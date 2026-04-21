// Stores the Anthropic API key in the OS keychain via keytar.
// macOS → Keychain Access, Windows → Credential Manager, Linux → libsecret.
//
// The key NEVER touches electron-store (plain JSON on disk).
// The renderer only ever sees a masked version: "sk-ant-api03-…****"

import keytar from "keytar";
import { IPC } from "../shared/ipc-channels.js";

const SERVICE = "dev.onlooker.desktop";
const ACCOUNT = "anthropic-api-key";

// Called by claude-client.js — stays in main process only
export async function getApiKey() {
  return keytar.getPassword(SERVICE, ACCOUNT);
}

export function registerKeyHandlers(ipcMain) {
  ipcMain.handle(IPC.KEY_GET, async () => {
    const key = await keytar.getPassword(SERVICE, ACCOUNT);
    if (!key) return null;
    // Return masked form so the renderer can show it without exposing the key
    return key.slice(0, 14) + "…" + key.slice(-4);
  });

  ipcMain.handle(IPC.KEY_SET, async (_e, { key }) => {
    await keytar.setPassword(SERVICE, ACCOUNT, key);
    return { ok: true };
  });

  ipcMain.handle(IPC.KEY_DELETE, async () => {
    await keytar.deletePassword(SERVICE, ACCOUNT);
    return { ok: true };
  });
}
