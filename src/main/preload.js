// ─────────────────────────────────────────────────────────────────────────────
// src/main/preload.js
//
// Context bridge: exposes a typed, minimal API surface to the renderer.
// The renderer NEVER has access to Node.js or Electron internals directly.
// All communication goes through window.onlooker.
// ─────────────────────────────────────────────────────────────────────────────

const { contextBridge, ipcRenderer } = require("electron");
const { IPC } = require("../shared/ipc-channels.js");

contextBridge.exposeInMainWorld("onlooker", {
	// ── Chat ──────────────────────────────────────────────────────────────────
	chat: {
		send: (messages, sessionId) =>
			ipcRenderer.invoke(IPC.CHAT_SEND, { messages, sessionId }),
		onChunk: (cb) => {
			ipcRenderer.on(IPC.CHAT_STREAM_CHUNK, (_e, data) => cb(data));
			return () => ipcRenderer.removeAllListeners(IPC.CHAT_STREAM_CHUNK);
		},
		onEnd: (cb) => {
			ipcRenderer.on(IPC.CHAT_STREAM_END, (_e, data) => cb(data));
			return () => ipcRenderer.removeAllListeners(IPC.CHAT_STREAM_END);
		},
		onError: (cb) => {
			ipcRenderer.on(IPC.CHAT_STREAM_ERROR, (_e, data) => cb(data));
			return () => ipcRenderer.removeAllListeners(IPC.CHAT_STREAM_ERROR);
		},
	},

	// ── API key ───────────────────────────────────────────────────────────────
	key: {
		get: () => ipcRenderer.invoke(IPC.KEY_GET),
		set: (key) => ipcRenderer.invoke(IPC.KEY_SET, { key }),
		delete: () => ipcRenderer.invoke(IPC.KEY_DELETE),
	},

	// ── Log / event feed ─────────────────────────────────────────────────────
	logs: {
		subscribe: (logDir) => ipcRenderer.invoke(IPC.LOGS_SUBSCRIBE, { logDir }),
		unsubscribe: () => ipcRenderer.invoke(IPC.LOGS_UNSUBSCRIBE),
		query: (opts) => ipcRenderer.invoke(IPC.LOGS_QUERY, opts),
		onEvent: (cb) => {
			ipcRenderer.on(IPC.LOGS_EVENT, (_e, event) => cb(event));
			return () => ipcRenderer.removeAllListeners(IPC.LOGS_EVENT);
		},
	},

	// ── Cost data (Ledger / core cost tracking) ───────────────────────────────
	costs: {
		query: (opts) => ipcRenderer.invoke(IPC.COSTS_QUERY, opts ?? {}),
	},

	// ── Instruction health (Cartographer audit state) ─────────────────────────
	health: {
		query: () => ipcRenderer.invoke(IPC.HEALTH_QUERY),
	},

	// ── Weekly review ─────────────────────────────────────────────────────────
	review: {
		request: (weekStart) =>
			ipcRenderer.invoke(IPC.REVIEW_REQUEST, { weekStart }),
		onReady: (cb) => {
			ipcRenderer.on(IPC.REVIEW_READY, (_e, data) => cb(data));
			return () => ipcRenderer.removeAllListeners(IPC.REVIEW_READY);
		},
	},

	// ── Settings ──────────────────────────────────────────────────────────────
	settings: {
		get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
		set: (partial) => ipcRenderer.invoke(IPC.SETTINGS_SET, partial),
	},

	// ── Plugin bridge ─────────────────────────────────────────────────────────
	plugins: {
		run: (plugin, command, args) =>
			ipcRenderer.invoke(IPC.PLUGIN_RUN, { plugin, command, args }),
		list: () => ipcRenderer.invoke(IPC.PLUGIN_LIST),
	},

	// ── Window controls (for custom title bar) ────────────────────────────────
	window: {
		minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
		maximize: () => ipcRenderer.send(IPC.WINDOW_MAXIMIZE),
		close: () => ipcRenderer.send(IPC.WINDOW_CLOSE),
	},
});
