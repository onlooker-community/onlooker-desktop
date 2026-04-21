# Onlooker Desktop

Local-first AI agent observability client for Claude Code.
A native desktop app wrapping the Anthropic API with Onlooker's full plugin telemetry surface.

## What this is

A split-pane Electron application:
- **Left**: Real Claude chat (streaming, full conversation history)
- **Right**: Live Onlooker telemetry panel — event feed, session metrics, raw debug view
- **Weekly Review**: Modal with session history, scores, and Counsel synthesis
- **Settings**: OS keychain API key storage, model selection, Tribunal threshold, plugin config

The app tails `~/.claude/onlooker/logs/*.jsonl` in real time using chokidar, with per-file byte cursors
so only newly appended lines are read — not the full file on every change.

## Project structure

```
onlooker-desktop/
├── src/
│   ├── main/                       # Electron main process (Node.js)
│   │   ├── index.js                # Window, tray, IPC registration
│   │   ├── preload.cjs             # contextBridge → window.onlooker
│   │   ├── claude-client.js        # Anthropic SDK, streaming chat
│   │   ├── log-watcher.js          # chokidar tail → LOGS_EVENT IPC
│   │   ├── key-manager.js          # keytar OS keychain integration
│   │   └── plugin-bridge.js        # Allowlisted spawn() for plugin scripts
│   ├── shared/
│   │   └── ipc-channels.js         # Channel names shared by both processes
│   └── renderer/                   # React UI (Vite)
│       ├── index.html
│       ├── main.jsx
│       └── src/
│           ├── App.jsx             # Root — composes all panes and modals
│           ├── index.css           # Global reset, fonts, animations
│           ├── components/
│           │   ├── TitleBar.jsx
│           │   ├── ChatPane.jsx
│           │   ├── ObservabilityPane.jsx
│           │   ├── WeeklyReview.jsx
│           │   └── SettingsModal.jsx
│           └── hooks/
│               └── useOnlooker.js  # IPC hooks: events, chat, settings, plugins
├── assets/                         # icon.icns / icon.ico / icon.png / tray-icon.png
├── package.json
├── vite.config.js
└── .gitignore
```

## Setup

### Prerequisites
- Node.js 20+
- Onlooker plugins installed in `~/.claude/onlooker/`
- Hook scripts writing JSONL to `~/.claude/onlooker/logs/`
- macOS: Xcode Command Line Tools (for keytar native module)
- Linux: `libsecret-1-dev` package (for keytar)

### Install and run

```bash
cd onlooker-desktop
npm install
npm run dev       # starts Vite + Electron in dev mode
npm run build     # produces distributable in dist-electron/
```

## JSONL event format

Hook scripts should append one JSON object per line:

```jsonl
{"ts":"2026-04-20T14:32:01.000Z","plugin":"tribunal","type":"PostToolUse","label":"Quality check","detail":"Score 0.87","status":"pass","session":"sess_abc123","meta":{"score":0.87}}
```

Fields: `ts` (ISO 8601), `plugin`, `type` (hook type), `label`, `detail`, `status` (pass|warn|fail|info|block), `session`, `meta` (plugin-specific payload).

## Security model

- Context isolation is on — the renderer has zero Node.js access.
- All filesystem, shell, and keychain ops go through the contextBridge.
- The plugin bridge maintains an explicit allowlist of plugin:command pairs.
- The API key is stored in the OS keychain and never crosses into the renderer.
