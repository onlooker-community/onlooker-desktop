// Provides a controlled shell bridge so the renderer can trigger Onlooker
// plugin commands (e.g. tribunal:run, echo:run, counsel:synthesize) without
// ever having direct shell access.
//
// Security model: ALLOWED_COMMANDS is an explicit allowlist. The renderer
// sends { plugin, command, args } and we verify both plugin and command
// before constructing the spawn call. No arbitrary shell strings are accepted.

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { IPC, PLUGINS } from "../shared/ipc-channels.js";

// Only these plugin:command pairs can be invoked from the renderer
const ALLOWED_COMMANDS = {
  [PLUGINS.TRIBUNAL]:  ["run", "score", "meta-judge"],
  [PLUGINS.SENTINEL]:  ["audit", "status"],
  [PLUGINS.ARCHIVIST]: ["recall", "write", "compact"],
  [PLUGINS.SCRIBE]:    ["capture", "distill"],
  [PLUGINS.ECHO]:      ["run", "diff"],
  [PLUGINS.COUNSEL]:   ["synthesize", "weekly"],
  [PLUGINS.FORGE]:     ["scaffold"],
};

// Looks for either a .sh or a .js script under the plugin's scripts/ dir
function resolveScript(plugin, command) {
  const base = path.join(os.homedir(), ".claude", "plugins", plugin, "scripts");
  for (const ext of [".sh", ".js"]) {
    const candidate = path.join(base, command + ext);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function runPlugin(plugin, command, args = []) {
  return new Promise((resolve, reject) => {
    const allowed = ALLOWED_COMMANDS[plugin];
    if (!allowed) {
      return reject(new Error(`Unknown plugin: ${plugin}`));
    }
    if (!allowed.includes(command)) {
      return reject(new Error(`Command '${command}' not in allowlist for ${plugin}`));
    }

    const scriptPath = resolveScript(plugin, command);
    if (!scriptPath) {
      return reject(new Error(`Script not found for ${plugin}:${command} — is the plugin installed?`));
    }

    const isJs  = scriptPath.endsWith(".js");
    const bin   = isJs ? process.execPath : "bash";
    const argv  = isJs ? [scriptPath, ...args] : [scriptPath, ...args];

    const child = spawn(bin, argv, {
      env: { ...process.env },
      cwd: os.homedir(),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr, exitCode: code });
    });

    child.on("error", reject);
  });
}

function listInstalledPlugins() {
  const pluginsDir = path.join(os.homedir(), ".claude", "plugins");
  if (!fs.existsSync(pluginsDir)) return [];

  return fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const manifestPath = path.join(pluginsDir, d.name, "manifest.json");
      if (!fs.existsSync(manifestPath)) return { id: d.name };
      try {
        return { id: d.name, ...JSON.parse(fs.readFileSync(manifestPath, "utf8")) };
      } catch {
        return { id: d.name };
      }
    });
}

export function registerPluginHandlers(ipcMain, _store) {
  ipcMain.handle(IPC.PLUGIN_RUN, async (_e, { plugin, command, args }) => {
    try {
      return await runPlugin(plugin, command, args ?? []);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.PLUGIN_LIST, () => listInstalledPlugins());
}
