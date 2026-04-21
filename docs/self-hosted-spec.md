# Onlooker Desktop — Managed Tier Specification

**Status**: Draft  
**Version**: 0.1.0  
**Last updated**: 2026-04-20

---

## Overview

Onlooker Desktop ships in two modes:

| Mode | Who it's for | API key | Plugin setup |
|------|-------------|---------|--------------|
| **Self-hosted** | Existing Claude Code users with their own API key and plugins installed | User-supplied | User-managed (`~/.claude/onlooker/`) |
| **Managed** | Users who want Onlooker without setting up Claude Code or plugins manually | Onlooker-supplied (proxied) | Bundled, zero-config |

The Managed tier is a premium subscription. Onlooker holds the Anthropic API key, routes all model calls through a thin proxy server, enforces per-tier usage limits, and ships a pre-configured plugin bundle that runs entirely inside the desktop app without requiring a separate Claude Code installation.

---

## 1. Managed Tier Architecture

### 1.1 System topology

```
┌─────────────────────────────────────┐
│         Onlooker Desktop App        │
│                                     │
│  ┌─────────────┐  ┌───────────────┐ │
│  │  Chat pane  │  │  Observability│ │
│  │  (renderer) │  │  pane         │ │
│  └──────┬──────┘  └───────┬───────┘ │
│         │                 │         │
│  ┌──────▼─────────────────▼───────┐ │
│  │        Main process            │ │
│  │  mode: "managed"               │ │
│  │  auth: JWT from onlooker.dev   │ │
│  └──────────────┬─────────────────┘ │
└─────────────────┼───────────────────┘
                  │ HTTPS
                  ▼
┌─────────────────────────────────────┐
│       api.onlooker.dev (proxy)      │
│                                     │
│  • JWT verification                 │
│  • Per-user rate limiting           │
│  • Token metering & quota enforcement│
│  • Request logging (audit trail)    │
│  • Abuse detection                  │
└──────────────────┬──────────────────┘
                   │
                   ▼
        Anthropic API (claude-sonnet-4)
```

### 1.2 Why a proxy, not a bundled key

A key baked into the Electron binary can be extracted with standard tooling (`strings`, `asar` unpacking). For a free or trial tier this may be an acceptable risk, but for a subscription product it creates two hard problems:

1. **No enforcement** — you cannot rate-limit or meter usage client-side without the server being the authority.
2. **No revocation** — if a key leaks you must ship a new binary to rotate it; with a proxy you rotate the upstream key server-side in seconds.

The proxy is a small, stateless service. It does not store message content — it forwards requests and records only metadata (user ID, timestamp, token counts, model).

### 1.3 Proxy server responsibilities

```
POST /v1/chat
  Headers: Authorization: Bearer <onlooker_jwt>
  Body: { messages, model, max_tokens, session_id }

  1. Verify JWT signature + expiry
  2. Look up user quota (Redis or Postgres)
  3. Reject with 429 if over limit
  4. Forward to Anthropic API with Onlooker's key
  5. Stream response back to client
  6. On stream end: record token usage against user quota
```

The proxy is intentionally thin. No message content is persisted server-side — all session storage and JSONL logs remain local to the user's machine.

### 1.4 Authentication flow

```
1. User creates account at onlooker.dev (email + password or OAuth)
2. App opens → detects no self-hosted key → shows mode selection screen
3. User selects "Managed" → app opens onlooker.dev/activate in browser
4. User logs in → onlooker.dev issues a long-lived refresh token
5. App receives token via deep link (onlooker://auth?token=...)
6. App exchanges refresh token for short-lived JWT (24h expiry)
7. All API calls carry this JWT in Authorization header
8. App silently refreshes JWT before expiry
```

Tokens are stored in the OS keychain (same keytar integration already in place for self-hosted keys). The refresh token is stored under account `onlooker-refresh-token`; the active JWT under `onlooker-jwt`.

---

## 2. Pricing Tiers and Usage Limits

### 2.1 Tier definitions

| Tier | Price | Messages/mo | Models available | Plugins bundled | Priority |
|------|-------|-------------|-----------------|-----------------|----------|
| **Free** | $0 | 50 | Haiku only | Sentinel, Scribe | None |
| **Pro** | $18/mo | 1,000 | Sonnet, Haiku | All (see §3) | Standard |
| **Power** | $42/mo | 4,000 | Sonnet, Haiku | All + Echo CI | Priority |
| **Self-hosted** | $0 | Unlimited* | All | User-managed | N/A |

\* Self-hosted users pay Anthropic directly. Onlooker Desktop is free for self-hosted mode.

### 2.2 Rationale for limits

Anthropic pricing as of this writing (Sonnet):
- Input: $3 / 1M tokens
- Output: $15 / 1M tokens

Assuming an average conversation turn of ~2K input + ~800 output tokens:
- Cost per turn ≈ $0.006 + $0.012 = **~$0.018**
- 1,000 turns/mo ≈ **$18 COGS** at list price

Pro tier ($18/mo, 1,000 messages) is therefore roughly break-even at list price before overhead. Anthropic typically offers volume discounts at scale; target **40–50% gross margin** at steady state, which requires either volume discounts or pricing above COGS.

**Recommended approach**: Launch Pro at $18/mo as a simple, honest price. Re-evaluate margin after first 100 paying users when Anthropic usage volume becomes eligible for committed-use pricing.

### 2.3 Limit enforcement

Limits are enforced **server-side** at the proxy. The client is not trusted for quota decisions.

The desktop app displays a live usage meter in the Settings modal:

```
Pro plan · 247 / 1,000 messages used this month
████████░░░░░░░░░░░░░░░░░░░░  24.7%
Resets May 1
```

When a user hits 80% of their limit, the app shows a non-blocking banner. At 100%, requests return 429 and the app shows an upgrade prompt inline in the chat pane rather than a modal (less disruptive).

### 2.4 Token counting vs message counting

Counting **messages** (turns) rather than tokens is strongly preferred for user-facing pricing:
- Users understand "1,000 messages" immediately
- "X million tokens" requires explanation
- Internally, the proxy still records exact token counts for COGS tracking

A "message" = one complete user turn + one complete assistant response, regardless of length. This slightly penalises power users with long context but is vastly simpler to communicate.

---

## 3. Plugin Bundling Strategy

### 3.1 What "bundled" means

In self-hosted mode, plugins are shell scripts in `~/.claude/plugins/` that Claude Code's hooks system invokes. In managed mode, Claude Code is not installed — the desktop app must replicate the hook lifecycle internally.

The app already has a `plugin-bridge.js` that spawns plugin shell scripts. For the managed bundle, we ship the plugin scripts **inside the app's `resources/` directory** (packaged by electron-builder) and the plugin bridge resolves them there instead of `~/.claude/plugins/`.

```javascript
// plugin-bridge.js — managed mode path resolution
function resolveScript(plugin, command) {
  if (store.get("mode") === "managed") {
    // Bundled plugins live in the app package
    return path.join(process.resourcesPath, "plugins", plugin, "scripts", command + ".sh");
  }
  // Self-hosted: look in ~/.claude/plugins/ as before
  return path.join(os.homedir(), ".claude", "plugins", plugin, "scripts", command + ".sh");
}
```

Bundled plugins run in a sandboxed subprocess. They cannot write outside `~/.claude/onlooker/` and cannot access the network.

### 3.2 Plugin inventory by tier

| Plugin | Free | Pro | Power | What it does in the app |
|--------|------|-----|-------|------------------------|
| **Sentinel** | ✓ | ✓ | ✓ | Pre-flight gate on destructive operations; shown as block events in the feed |
| **Scribe** | ✓ | ✓ | ✓ | Captures intent on each turn; drives the session summary in Weekly Review |
| **Tribunal** | — | ✓ | ✓ | Scores each response; powers the Metrics tab score gauge and quality warnings |
| **Archivist** | — | ✓ | ✓ | Maintains session memory across context truncation |
| **Echo** | — | — | ✓ | Prompt regression CI; available as "Run Echo Regression" in Weekly Review |
| **Counsel** | — | ✓ | ✓ | Weekly synthesis; generates the narrative blurb in Weekly Review modal |
| **Forge** | — | — | — | Not bundled (developer tool; not relevant for managed users) |

### 3.3 Plugin versioning

Bundled plugins are versioned independently of the app. electron-builder packages them as a separate `plugins.asar` archive. This allows plugin updates to ship as smaller delta downloads without a full app update.

Plugin version is displayed in Settings → Installed Plugins alongside a "Check for updates" button.

### 3.4 JSONL log format compatibility

Bundled plugins write the same JSONL format as the self-hosted plugins. The log watcher, event feed, and Weekly Review work identically in both modes. This is a hard compatibility requirement — the log format is the contract between plugins and the UI.

### 3.5 What the bundled plugins do NOT do

In self-hosted mode, plugins hook into Claude Code's hook system (`PreToolUse`, `PostToolUse`, etc.) to observe real tool calls. In managed mode, the desktop app does not run Claude Code — it calls the Anthropic API directly.

This means bundled plugins operate on **conversation events** rather than tool call events:
- Sentinel gates are applied to tool calls Claude *describes* in its response (best-effort parsing), not actual shell operations
- Tribunal scores the model response quality directly
- Archivist writes summaries at turn boundaries rather than SubagentStop events

This is a meaningful capability difference. The UI should be clear about it — the feed header in managed mode reads "Managed · conversation events" rather than "4 hooks active".

A future version could use Claude's tool-use API to give the managed mode real tool observation, but that requires a more complex agent loop and is out of scope for v1.

---

## 4. Onboarding Flow

### 4.1 First-launch decision screen

On first launch, if no API key or auth token is found, the app shows a full-window onboarding screen instead of the normal split-pane UI:

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│                    ✦  Onlooker                         │
│         AI agent observability for Claude              │
│                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐   │
│  │                      │  │                      │   │
│  │   ✦  Managed         │  │   ⌘  Self-hosted     │   │
│  │                      │  │                      │   │
│  │  Zero setup.         │  │  Bring your own      │   │
│  │  Onlooker handles    │  │  Anthropic API key   │   │
│  │  the API key,        │  │  and Claude Code     │   │
│  │  plugins, and        │  │  plugin setup.       │   │
│  │  model access.       │  │                      │   │
│  │                      │  │  Free forever.       │   │
│  │  Free · Pro · Power  │  │                      │   │
│  │                      │  │                      │   │
│  │  [Get started →]     │  │  [Use my own key →]  │   │
│  │                      │  │                      │   │
│  └──────────────────────┘  └──────────────────────┘   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

This screen is shown exactly once. The choice is stored in settings as `mode: "managed" | "self-hosted"` and can be changed later in Settings.

### 4.2 Managed onboarding path

```
Step 1: Mode selection → user clicks "Get started"
Step 2: Tier selection screen (Free / Pro / Power comparison table)
Step 3: "Create account" → opens onlooker.dev/signup in browser
Step 4: User completes signup + optionally subscribes
Step 5: Browser redirects to onlooker://auth?token=<refresh_token>
Step 6: App receives deep link, stores token in keychain, shows success
Step 7: App transitions to main UI with managed mode active
```

Steps 3–6 use the OS default browser, not an embedded webview. This is both more trustworthy for users and avoids needing to build a payment UI inside Electron.

**Deep link registration** requires adding to `package.json` build config:
```json
"protocols": [
  { "name": "Onlooker", "schemes": ["onlooker"] }
]
```
And in `main/index.js`:
```javascript
app.setAsDefaultProtocolClient("onlooker");
app.on("open-url", (_event, url) => handleAuthCallback(url));
```

### 4.3 Self-hosted onboarding path

```
Step 1: Mode selection → user clicks "Use my own key"
Step 2: Settings modal opens directly to API Key section
Step 3: User pastes their Anthropic key → stored in keychain
Step 4: Optional: app checks for ~/.claude/plugins/ and shows
        which Onlooker plugins are detected
Step 5: App transitions to main UI with self-hosted mode active
```

If no plugins are detected in step 4, the app shows a non-blocking notice:
> "No Onlooker plugins found in ~/.claude/plugins/. The Live Feed will be empty until plugins are installed. [View setup guide →]"

The setup guide link opens the onlooker.dev docs in the browser.

### 4.4 Mode indicator in the UI

The mode is surfaced unobtrusively in the title bar and the observability panel footer:

- Title bar: `✦ Onlooker  ·  ● Session active  ·  [MANAGED]` or `[SELF-HOSTED]`
- Footer: `claude-sonnet-4 · managed · 247/1000 this month` or `claude-sonnet-4 · 4 hooks active · ~/.claude/onlooker/logs`

---

## 5. Implementation Phases

### Phase 1 — Self-hosted polish (now)
- Wire real JSONL events into the feed
- Fix plugin-bridge paths for installed plugins
- Weekly Review with real log data

### Phase 2 — Managed auth + proxy (pre-launch)
- `onlooker://` deep link handler
- JWT auth flow + keychain storage
- Proxy server (`api.onlooker.dev`) — Node.js/Fastify, deployable to Fly.io or Railway
- Usage meter in Settings
- Mode detection on startup
- First-launch onboarding screen

### Phase 3 — Plugin bundle (launch)
- Package Sentinel, Scribe, Tribunal, Archivist, Counsel into `resources/plugins/`
- `plugins.asar` build step in electron-builder config
- Managed-mode plugin bridge path resolution
- Plugin update check mechanism

### Phase 4 — Billing integration (post-launch)
- Stripe integration on onlooker.dev (not in the app)
- Webhook → quota update in proxy database
- Upgrade prompts at 80% and 100% usage
- Usage history page on onlooker.dev

---

## 6. Open Questions

| # | Question | Notes |
|---|----------|-------|
| 1 | Free tier model: Haiku only, or rate-limited Sonnet? | Haiku is cheaper and fast; Sonnet on free may be too generous at $0 |
| 2 | Should managed mode support tool use / computer use in v1? | Significant complexity; recommend deferring |
| 3 | Plugin update cadence: in-app or tied to app releases? | `plugins.asar` delta updates preferred but adds infra |
| 4 | Is conversation content ever sent to Onlooker servers? | Strong preference: no. Proxy should be message-blind (forward-only). Document this prominently. |
| 5 | What happens to local JSONL logs if a managed user cancels? | They keep their logs — data portability is a feature, not a risk |
| 6 | Self-hosted users on the free plan: should they have access to the onlooker.dev dashboard? | Could drive upgrades; low implementation cost |