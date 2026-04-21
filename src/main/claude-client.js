// Anthropic API client — runs entirely in the main process.
// The API key is fetched from the keychain here; it never crosses
// into the renderer. Tokens stream back via IPC events.

import Anthropic from "@anthropic-ai/sdk";
import { IPC } from "../shared/ipc-channels.js";
import { getApiKey } from "./key-manager.js";

// Lazily instantiated — recreated if the key changes
let _client = null;

async function getClient() {
  const key = await getApiKey();
  if (!key) throw new Error("No Anthropic API key found. Add one in Settings.");
  if (!_client) _client = new Anthropic({ apiKey: key });
  return _client;
}

export function registerChatHandlers(ipcMain, mainWindow, store) {
  ipcMain.handle(IPC.CHAT_SEND, async (_event, { messages, sessionId }) => {
    // Helper so we don't repeat mainWindow?.webContents.send everywhere
    const push = (channel, data) => mainWindow?.webContents.send(channel, data);

    try {
      const client = await getClient();
      const model  = store.get("model");
      const maxTok = store.get("maxTokens");

      const stream = await client.messages.stream({
        model,
        max_tokens: maxTok,
        messages,
      });

      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta?.type === "text_delta"
        ) {
          push(IPC.CHAT_STREAM_CHUNK, { sessionId, delta: chunk.delta.text });
        }
      }

      const final = await stream.finalMessage();
      push(IPC.CHAT_STREAM_END, {
        sessionId,
        usage: final.usage,
        stopReason: final.stop_reason,
      });

      return { ok: true };
    } catch (err) {
      push(IPC.CHAT_STREAM_ERROR, { sessionId, error: err.message });
      return { ok: false, error: err.message };
    }
  });
}
