// Main process entry point.
// Owns: BrowserWindow lifecycle, system tray, IPC handler registration.
// All Node/filesystem/shell work is delegated to the other main/ modules.

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import Store from "electron-store";

import { IPC, DEFAULT_SETTINGS } from "../shared/ipc-channels.js";
import { registerChatHandlers } from "./claude-client.js";
import { registerLogHandlers, stopAllWatchers } from "./log-watcher.js";
import { registerPluginHandlers } from "./plugin-bridge.js";
import { registerKeyHandlers } from "./key-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

// Persistent settings written to Electron's userData dir (not ~/.claude/onlooker)
export const store = new Store({ defaults: DEFAULT_SETTINGS });

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",        // macOS: inset traffic lights
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: "#0b0d14",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"), // CJS because contextBridge uses require()
      contextIsolation: true,   // renderer never gets Node access
      nodeIntegration: false,
      sandbox: false,           // preload needs require()
    },
    icon: path.join(__dirname, "../../assets/icon.png"),
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, "../../assets/tray-icon.png");
  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip("Onlooker");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Open Onlooker", click: () => mainWindow?.show() ?? createWindow() },
      { label: "Weekly Review", click: () => mainWindow?.webContents.send(IPC.REVIEW_REQUEST, {}) },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]));
    tray.on("click", () => mainWindow?.show());
  } catch {
    // Tray icon asset missing during dev — non-fatal
    console.warn("Tray icon not found, skipping tray");
  }
}

function registerWindowHandlers() {
  ipcMain.on(IPC.WINDOW_MINIMIZE, () => mainWindow?.minimize());
  ipcMain.on(IPC.WINDOW_MAXIMIZE, () => {
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
  });
  ipcMain.on(IPC.WINDOW_CLOSE, () => mainWindow?.close());
}

function registerSettingsHandlers() {
  ipcMain.handle(IPC.SETTINGS_GET, () => store.store);
  ipcMain.handle(IPC.SETTINGS_SET, (_e, partial) => {
    Object.entries(partial).forEach(([k, v]) => store.set(k, v));
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerWindowHandlers();
  registerSettingsHandlers();
  registerKeyHandlers(ipcMain);
  registerChatHandlers(ipcMain, mainWindow, store);
  registerLogHandlers(ipcMain, mainWindow, store);
  registerPluginHandlers(ipcMain, store);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => stopAllWatchers());
