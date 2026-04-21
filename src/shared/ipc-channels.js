// Single source of truth for all IPC channel names and constants.
// Imported by both main and renderer processes via the preload bridge.

export const IPC = {
  // Chat
  CHAT_SEND:            "chat:send",
  CHAT_STREAM_CHUNK:    "chat:stream-chunk",
  CHAT_STREAM_END:      "chat:stream-end",
  CHAT_STREAM_ERROR:    "chat:stream-error",

  // API key (keychain)
  KEY_GET:              "key:get",
  KEY_SET:              "key:set",
  KEY_DELETE:           "key:delete",

  // Log / telemetry
  LOGS_SUBSCRIBE:       "logs:subscribe",
  LOGS_UNSUBSCRIBE:     "logs:unsubscribe",
  LOGS_EVENT:           "logs:event",
  LOGS_QUERY:           "logs:query",

  // Weekly review
  REVIEW_REQUEST:       "review:request",
  REVIEW_READY:         "review:ready",

  // Settings
  SETTINGS_GET:         "settings:get",
  SETTINGS_SET:         "settings:set",

  // Plugin shell bridge
  PLUGIN_RUN:           "plugin:run",
  PLUGIN_LIST:          "plugin:list",

  // Window controls (custom title bar)
  WINDOW_MINIMIZE:      "window:minimize",
  WINDOW_MAXIMIZE:      "window:maximize",
  WINDOW_CLOSE:         "window:close",
  TRAY_NOTIFY:          "tray:notify",
};

export const PLUGINS = {
  SENTINEL:  "sentinel",
  TRIBUNAL:  "tribunal",
  ARCHIVIST: "archivist",
  SCRIBE:    "scribe",
  ECHO:      "echo",
  FORGE:     "forge",
  COUNSEL:   "counsel",
};

export const EVENT_STATUS = {
  PASS:  "pass",
  WARN:  "warn",
  FAIL:  "fail",
  INFO:  "info",
  BLOCK: "block",
};

export const DEFAULT_SETTINGS = {
  logDir:            "~/.claude/onlooker",
  model:             "claude-sonnet-4-20250514",
  maxTokens:         8096,
  tribunalThreshold: 0.75,
  sentinelStrict:    true,
  debugMode:         false,
  theme:             "dark",
  panelWidth:        320,
  weeklyReviewDay:   "sunday",
};