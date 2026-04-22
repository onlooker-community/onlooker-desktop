// Watches ~/.claude/onlooker/core/logs/*.jsonl using chokidar.
//
// The key insight is "tail" behaviour: we track a byte cursor per file so
// that when chokidar fires a "change" event we only read the bytes appended
// since the last read — not the entire file. This keeps the feed fast even
// in long sessions with thousands of events.
//
// Expected JSONL event shape (written by hook scripts):
// {
//   "ts":      "2026-04-20T14:32:01.000Z",   // ISO 8601
//   "plugin":  "tribunal",                    // which plugin fired
//   "type":    "PostToolUse",                 // hook type
//   "label":   "Quality check",               // short display label
//   "detail":  "Score 0.87 · no bias flags",  // one-line description
//   "status":  "pass",                        // pass|warn|fail|info|block
//   "session": "sess_abc123",                 // groups events by session
//   "meta":    { "score": 0.87 }              // plugin-specific payload
// }

import chokidar from "chokidar";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { IPC } from "../shared/ipc-channels.js";

// Map from absolute log dir path → chokidar FSWatcher
const watchers = new Map();

// Map from absolute file path → byte offset (how far we've read)
const cursors = new Map();

function resolveDir(logDir) {
  return logDir.replace(/^~/, os.homedir());
}

// Infer plugin name from file path when the event doesn't include one.
// ~/.claude/onlooker/tribunal/session-abc.jsonl → "tribunal"
function inferPlugin(filePath, rootDir) {
  const rel = path.relative(rootDir, filePath);
  const parts = rel.split(path.sep);
  // If file is one level deep (plugin/file.jsonl), use the dir name
  if (parts.length >= 2) return parts[0];
  return null;
}

// Normalise an event from whatever schema the plugin wrote into the canonical
// shape the UI expects. Handles both the original spec shape and the actual
// Onlooker plugin schema observed in the wild.
//
// Canonical shape:
//   { ts, plugin, type, label, detail, status, session, meta,
//     hook_type?, turn?, tool_call_seq?, tool_name? }
//
// Actual plugin shape (e.g. warden, oracle):
//   { timestamp, plugin, session_id, trigger|event, tool, decision, detail, ... }
//
// Enriched envelope shape (onlooker core ≥ v0.5):
//   { timestamp, session_id, plugin, event_type, hook_type, turn, tool_call_seq,
//     tool_name, payload }
function normalise(event, inferredPlugin) {
  // Already in canonical form — has ts and label
  if (event.ts && event.label) return event;

  const plugin  = event.plugin ?? inferredPlugin ?? "unknown";

  // Timestamp: prefer ts, fall back to timestamp
  const ts = event.ts ?? event.timestamp ?? new Date().toISOString();

  // Session: prefer session, fall back to session_id
  const session = event.session ?? event.session_id ?? null;

  // Status: map decision/status values to canonical set
  let status = event.status;
  if (!status && event.decision) {
    status = event.decision === "block" ? "block"
           : event.decision === "allow" ? "pass"
           : "info";
  }
  // Oracle three-state calibration → canonical status
  if (!status && event.state) {
    status = event.state === "confident"             ? "pass"
           : event.state === "uncertain_recoverable" ? "warn"
           : event.state === "uncertain_high_stakes" ? "block"
           : "info";
  }
  status = status ?? "info";

  // Type: prefer type, fall back to event_type (enriched envelope), trigger, or event field
  const type = event.type ?? event.event_type ?? event.trigger ?? event.event ?? "unknown";

  // Label: prefer label, otherwise build from event/trigger + tool.
  // For oracle events, append the calibration state so it's scannable at a glance.
  const stateHint = event.state ? ` · ${event.state.replace(/_/g, " ")}` : "";
  const label = event.label
    ?? (event.tool ? `${type}: ${event.tool}${stateHint}` : `${type}${stateHint}`);

  // Detail: prefer detail, fall back to reason (oracle flagged assumptions /
  // blocking questions), then pattern_matched or input_summary
  const detail = event.detail
    ?? event.reason
    ?? event.pattern_matched
    ?? event.input_summary
    ?? null;

  // Turn-level fields (enriched envelope, optional)
  const hook_type     = event.hook_type ?? null;
  const turn          = event.turn ?? null;
  const tool_call_seq = event.tool_call_seq ?? null;
  // tool_name: prefer top-level (enriched envelope), fall back to payload
  const toolName      = event.tool_name ?? event.payload?.tool_name ?? null;

  // Meta: everything not in the canonical/turn fields goes into meta
  const { ts: _ts, timestamp: _timestamp, plugin: _plugin,
          session: _session, session_id: _session_id,
          status: _status, decision: _decision,
          type: _type, event_type: _et, trigger: _trigger, event: _event,
          label: _label, detail: _detail,
          pattern_matched: _pm, input_summary: _is,
          tool: _tool, tool_name: _tn,
          hook_type: _ht, turn: _turn, tool_call_seq: _tcs,
          payload: _payload,
          ...rest } = event;

  const meta = {
    ...(event.tool      ? { tool: event.tool }           : {}),
    ...(event.tool_name ? { tool_name: event.tool_name } : {}),
    ...(event.decision  ? { decision: event.decision }   : {}),
    ...(event.pattern_matched ? { pattern_matched: event.pattern_matched } : {}),
    // Merge payload fields into meta (enriched envelope nests plugin data here)
    ...(event.payload && typeof event.payload === "object" ? event.payload : {}),
    ...rest,
  };

  return {
    ts, plugin, type, label, detail, status, session, meta,
    // Turn-level fields — null when absent (legacy events)
    ...(hook_type     != null ? { hook_type }     : {}),
    ...(turn          != null ? { turn }          : {}),
    ...(tool_call_seq != null ? { tool_call_seq } : {}),
    ...(toolName      != null ? { tool_name: toolName } : {}),
  };
}

// Read only the lines appended since the last cursor position.
// Calls callback once per valid JSON line.
// filePath and rootDir are used to infer the plugin name if absent from the event.
function tailNewLines(filePath, rootDir, callback) {
  const cursor = cursors.get(filePath) ?? 0;
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat || stat.size <= cursor) return; // nothing new

  const stream = fs.createReadStream(filePath, {
    start: cursor,
    encoding: "utf8",
  });

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const raw = JSON.parse(trimmed);
      const inferred = inferPlugin(filePath, rootDir);
      callback(normalise(raw, inferred));
    } catch {
      // Malformed line — skip silently. Hook scripts occasionally write
      // partial lines if they're interrupted.
    }
  });

  rl.on("close", () => {
    // Advance cursor to end of file so next read starts here
    cursors.set(filePath, stat.size);
  });
}

// Recursively collect all .jsonl files under a directory.
function collectJsonlFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsonlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      results.push(full);
    }
  }
  return results;
}

// Full historical scan for Weekly Review / LOGS_QUERY
async function queryLogs(logDir, { from, to, plugins, limit } = {}) {
  const resolved = resolveDir(logDir);
  const events = [];

  const files = collectJsonlFiles(resolved);

  for (const file of files) {
    await new Promise((resolve) => {
      const stream = fs.createReadStream(file, { encoding: "utf8" });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const raw = JSON.parse(trimmed);
          const inferred = inferPlugin(file, resolved);
          const event = normalise(raw, inferred);
          const ts = new Date(event.ts);
          if (from    && ts < new Date(from)) return;
          if (to      && ts > new Date(to))   return;
          if (plugins && !plugins.includes(event.plugin)) return;
          events.push(event);
        } catch { /* skip */ }
      });

      rl.on("close", resolve);
    });
  }

  const sorted = events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return limit ? sorted.slice(-limit) : sorted;
}

export function registerLogHandlers(ipcMain, mainWindow, store) {
  const forward = (event) => mainWindow?.webContents.send(IPC.LOGS_EVENT, event);

  ipcMain.handle(IPC.LOGS_SUBSCRIBE, (_e, { logDir }) => {
    const dir = resolveDir(logDir ?? store.get("logDir"));

    // Create the directory if it doesn't exist yet
    fs.mkdirSync(dir, { recursive: true });

    // Stop any existing watcher for this directory before creating a new one
    watchers.get(dir)?.close();

    // Use **/*.jsonl to watch files at any subdirectory depth:
    //   ~/.claude/onlooker/tribunal/session-abc.jsonl  ✓
    //   ~/.claude/onlooker/sentinel/session-abc.jsonl  ✓
    //   ~/.claude/onlooker/session-abc.jsonl           ✓ (flat layout also works)
    const watcher = chokidar.watch(path.join(dir, "**", "*.jsonl"), {
      persistent: true,
      ignoreInitial: true,  // don't replay past events on startup
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 50,
      },
    });

    watcher.on("change", (filePath) => tailNewLines(filePath, dir, forward));

    watcher.on("add", (filePath) => {
      // New file — set cursor at end so we only tail future appends
      const stat = fs.statSync(filePath, { throwIfNoEntry: false });
      if (stat) cursors.set(filePath, stat.size);
    });

    watchers.set(dir, watcher);
    return { ok: true, dir };
  });

  ipcMain.handle(IPC.LOGS_UNSUBSCRIBE, () => {
    watchers.forEach((w) => w.close());
    watchers.clear();
    cursors.clear();
    return { ok: true };
  });

  ipcMain.handle(IPC.LOGS_QUERY, (_e, opts) => {
    return queryLogs(store.get("logDir"), opts ?? {});
  });
}

export function stopAllWatchers() {
  watchers.forEach((w) => w.close());
  watchers.clear();
}