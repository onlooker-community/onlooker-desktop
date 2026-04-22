// Preload script — runs in a privileged context with access to both
// Node APIs and the renderer's window object.
//
// contextBridge.exposeInMainWorld() is the security boundary:
// everything under window.onlooker is available to React,
// but the renderer still can't import Node modules directly.

const { contextBridge, ipcRenderer } = require("electron");

// We can't use ES module import here, so we inline the channel names.
// Keep this in sync with src/shared/ipc-channels.js.
const IPC = {
  CHAT_SEND:         "chat:send",
  CHAT_STREAM_CHUNK: "chat:stream-chunk",
  CHAT_STREAM_END:   "chat:stream-end",
  CHAT_STREAM_ERROR: "chat:stream-error",
  KEY_GET:           "key:get",
  KEY_SET:           "key:set",
  KEY_DELETE:        "key:delete",
  LOGS_SUBSCRIBE:    "logs:subscribe",
  LOGS_UNSUBSCRIBE:  "logs:unsubscribe",
  LOGS_EVENT:        "logs:event",
  LOGS_QUERY:        "logs:query",
  COSTS_QUERY:       "costs:query",
  HEALTH_QUERY:      "health:query",
  REVIEW_REQUEST:    "review:request",
  REVIEW_READY:      "review:ready",
  SETTINGS_GET:      "settings:get",
  SETTINGS_SET:      "settings:set",
  PLUGIN_RUN:        "plugin:run",
  PLUGIN_LIST:       "plugin:list",
  WINDOW_MINIMIZE:   "window:minimize",
  WINDOW_MAXIMIZE:   "window:maximize",
  WINDOW_CLOSE:      "window:close",
};

contextBridge.exposeInMainWorld("onlooker", {
  chat: {
    send: (messages, sessionId) =>
      ipcRenderer.invoke(IPC.CHAT_SEND, { messages, sessionId }),
    // Return a cleanup fn so React's useEffect can unsubscribe
    onChunk: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on(IPC.CHAT_STREAM_CHUNK, handler);
      return () => ipcRenderer.removeListener(IPC.CHAT_STREAM_CHUNK, handler);
    },
    onEnd: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on(IPC.CHAT_STREAM_END, handler);
      return () => ipcRenderer.removeListener(IPC.CHAT_STREAM_END, handler);
    },
    onError: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on(IPC.CHAT_STREAM_ERROR, handler);
      return () => ipcRenderer.removeListener(IPC.CHAT_STREAM_ERROR, handler);
    },
  },

  key: {
    get:    ()    => ipcRenderer.invoke(IPC.KEY_GET),
    set:    (key) => ipcRenderer.invoke(IPC.KEY_SET, { key }),
    delete: ()    => ipcRenderer.invoke(IPC.KEY_DELETE),
  },

  logs: {
    subscribe:   (logDir) => ipcRenderer.invoke(IPC.LOGS_SUBSCRIBE, { logDir }),
    unsubscribe: ()       => ipcRenderer.invoke(IPC.LOGS_UNSUBSCRIBE),
    query:       (opts)   => ipcRenderer.invoke(IPC.LOGS_QUERY, opts),
    onEvent: (cb) => {
      const handler = (_e, event) => cb(event);
      ipcRenderer.on(IPC.LOGS_EVENT, handler);
      return () => ipcRenderer.removeListener(IPC.LOGS_EVENT, handler);
    },
  },

  costs: {
    query: (opts) => ipcRenderer.invoke(IPC.COSTS_QUERY, opts ?? {}),
  },

  health: {
    query: () => ipcRenderer.invoke(IPC.HEALTH_QUERY),
  },

  review: {
    request: (weekStart) => ipcRenderer.invoke(IPC.REVIEW_REQUEST, { weekStart }),
    onReady: (cb) => {
      const handler = (_e, data) => cb(data);
      ipcRenderer.on(IPC.REVIEW_READY, handler);
      return () => ipcRenderer.removeListener(IPC.REVIEW_READY, handler);
    },
  },

  settings: {
    get: ()        => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (partial) => ipcRenderer.invoke(IPC.SETTINGS_SET, partial),
  },

  plugins: {
    run:  (plugin, command, args) =>
      ipcRenderer.invoke(IPC.PLUGIN_RUN, { plugin, command, args }),
    list: () => ipcRenderer.invoke(IPC.PLUGIN_LIST),
  },

  window: {
    minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.send(IPC.WINDOW_MAXIMIZE),
    close:    () => ipcRenderer.send(IPC.WINDOW_CLOSE),
  },
});
