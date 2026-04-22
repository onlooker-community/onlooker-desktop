// Sessions view — browsable history of all past sessions.
// Two-panel: session list on left, session detail on right.

import { useState, useMemo, useRef } from "react";
import { PLUGIN_COLORS, PLUGIN_LABELS, STATUS_COLORS } from "../plugins.js";
import { groupIntoTurns } from "../hooks/useOnlooker.js";
import TurnCard from "../components/TurnCard.jsx";

const C = {
  bg0: "#0b0d14", bg1: "#12151f", bg2: "#181c2a", bg3: "#1f2335",
  border: "#252a3d", borderAccent: "#2e3555",
  pink: "#f472b6", cyan: "#22d3ee", yellow: "#fbbf24",
  green: "#4ade80", red: "#f87171", purple: "#a78bfa",
  textPrimary: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "#475569",
};

// Plugin colors/labels/statuses imported from ../plugins.js

function scoreColor(s) {
  if (s == null) return C.textMuted;
  if (s >= 0.85) return C.green;
  if (s >= 0.70) return C.yellow;
  return C.red;
}

function ScoreBar({ score }) {
  if (score == null) return <span style={{ fontSize: 10, color: C.textMuted }}>—</span>;
  const color = scoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 48, height: 3, borderRadius: 2, background: C.bg3, overflow: "hidden" }}>
        <div style={{ width: `${score * 100}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: "monospace", color }}>{score.toFixed(2)}</span>
    </div>
  );
}

function PluginBadge({ plugin }) {
  const color = PLUGIN_COLORS[plugin] ?? C.textMuted;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
      padding: "1px 5px", borderRadius: 3,
      border: `1px solid ${color}44`, color, background: `${color}11`,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {PLUGIN_LABELS[plugin] ?? plugin?.toUpperCase()}
    </span>
  );
}

// ── Session list ──────────────────────────────────────────────────────────────

function groupByDay(sessions) {
  const groups = new Map();
  for (const s of sessions) {
    const day = s.start?.slice(0, 10) ?? "Unknown";
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(s);
  }
  return Array.from(groups.entries());
}

function formatDayLabel(iso) {
  if (!iso || iso === "Unknown") return "Unknown";
  const d = new Date(iso + "T12:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeRange(start, end) {
  const fmt = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dur = start && end
    ? Math.round((new Date(end) - new Date(start)) / 60000)
    : null;
  return `${fmt(start)} → ${fmt(end)}${dur != null ? `  (${dur}m)` : ""}`;
}

function SessionListItem({ session, selected, onClick }) {
  const isSelected = selected === session.id;
  return (
    <div onClick={onClick} style={{
      padding: "10px 16px", cursor: "pointer",
      background: isSelected ? `${C.pink}0f` : "transparent",
      borderLeft: `2px solid ${isSelected ? C.pink : "transparent"}`,
      transition: "all 0.1s",
    }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = C.bg2; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>
          {session.id?.slice(0, 16)}…
        </span>
        {session.blocks > 0 && (
          <span style={{ fontSize: 9, color: C.red, background: `${C.red}15`,
            padding: "1px 5px", borderRadius: 3, fontFamily: "monospace" }}>
            ⊘ {session.blocks}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6 }}>
        {formatTimeRange(session.start, session.end)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ScoreBar score={session.avgScore} />
        <span style={{ fontSize: 10, color: C.textMuted, marginLeft: "auto" }}>
          {session.events?.length ?? 0} events
        </span>
      </div>
    </div>
  );
}

// ── Session detail ────────────────────────────────────────────────────────────

function SummaryStrip({ events }) {
  const plugins = ["sentinel", "tribunal", "archivist", "scribe"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
      {plugins.map((plugin) => {
        const pluginEvents = events.filter((e) => e.plugin === plugin);
        const blocks = pluginEvents.filter((e) => e.status === "block").length;
        const warns  = pluginEvents.filter((e) => e.status === "warn" || e.status === "fail").length;
        const passes = pluginEvents.filter((e) => e.status === "pass" || e.status === "info").length;
        const color  = PLUGIN_COLORS[plugin];

        return (
          <div key={plugin} style={{ background: C.bg2, borderRadius: 8,
            padding: "10px 12px", border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, color, fontFamily: "monospace", fontWeight: 700,
              letterSpacing: "0.08em", marginBottom: 6 }}>
              {PLUGIN_LABELS[plugin]}
            </div>
            <div style={{ fontSize: 11, color: C.textPrimary, fontWeight: 600, marginBottom: 4 }}>
              {pluginEvents.length}
            </div>
            <div style={{ fontSize: 9, color: C.textMuted }}>
              {blocks > 0 && <span style={{ color: C.red }}>⊘ {blocks} block  </span>}
              {warns  > 0 && <span style={{ color: C.yellow }}>⚑ {warns} warn  </span>}
              {passes > 0 && <span style={{ color: C.green }}>✓ {passes}</span>}
              {pluginEvents.length === 0 && "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreSparkline({ events }) {
  const scored = events
    .filter((e) => e.plugin === "tribunal" && e.meta?.score != null)
    .map((e) => e.meta.score);

  if (scored.length < 2) return null;

  const w = 240, h = 40, pad = 4;
  const min = Math.min(...scored, 0.5);
  const max = Math.max(...scored, 1.0);
  const xs = scored.map((_, i) => pad + (i / (scored.length - 1)) * (w - pad * 2));
  const ys = scored.map((s) => h - pad - ((s - min) / (max - min)) * (h - pad * 2));
  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.06em",
        textTransform: "uppercase", fontFamily: "monospace", marginBottom: 8 }}>
        Score Timeline
      </div>
      <svg width={w} height={h} style={{ display: "block" }}>
        <path d={path} fill="none" stroke={C.pink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={2.5}
            fill={scoreColor(scored[i])} />
        ))}
      </svg>
    </div>
  );
}

function DetailEventRow({ event }) {
  const [expanded, setExpanded] = useState(false);
  const hasMeta = event.meta && Object.keys(event.meta).length > 0;
  const statusColor = STATUS_COLORS[event.status] ?? C.textMuted;

  return (
    <div onClick={hasMeta ? () => setExpanded((e) => !e) : undefined}
      style={{ padding: "5px 0", cursor: hasMeta ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: statusColor, boxShadow: `0 0 4px ${statusColor}88` }} />
        <PluginBadge plugin={event.plugin} />
        <span style={{ fontSize: 11, color: C.textSecondary, flex: 1 }}>{event.label}</span>
        <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}>
          {new Date(event.ts).toLocaleTimeString("en-US", { hour12: false })}
        </span>
      </div>
      {event.detail && (
        <div style={{
          fontSize: 10, fontFamily: "monospace", marginTop: 2, paddingLeft: 22,
          color: (event.status === "fail" || event.status === "block") ? C.red : C.textMuted,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{event.detail}</div>
      )}
      {expanded && hasMeta && (
        <div style={{ marginTop: 6, marginLeft: 22, padding: "6px 8px",
          background: C.bg0, borderRadius: 5, border: `1px solid ${C.border}`,
          fontSize: 10, fontFamily: "monospace", color: C.cyan }}>
          {JSON.stringify(event.meta, null, 2)}
        </div>
      )}
    </div>
  );
}

function ScrollJumpButtons({ scrollRef }) {
  return (
    <div style={{
      position: "absolute", bottom: 14, right: 14, zIndex: 10,
      display: "flex", flexDirection: "column", gap: 3,
      pointerEvents: "none",
    }}>
      {[["↑", 0, "Jump to top"], ["↓", null, "Jump to bottom"]].map(([arrow, top, title]) => (
        <button
          key={title}
          title={title}
          onClick={() => scrollRef.current?.scrollTo({
            top: top ?? scrollRef.current.scrollHeight,
            behavior: "smooth",
          })}
          style={{
            width: 24, height: 24, pointerEvents: "auto",
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 5, border: `1px solid ${C.border}`,
            background: `${C.bg2}e8`,
            color: C.textMuted, fontSize: 11,
            cursor: "pointer",
            transition: "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.textPrimary; e.currentTarget.style.borderColor = C.borderAccent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = C.border; }}
        >
          {arrow}
        </button>
      ))}
    </div>
  );
}

function SessionDetail({ session }) {
  const scrollRef = useRef(null);
  const [viewMode, setViewMode] = useState("turns"); // "turns" | "flat"

  const turns = useMemo(
    () => session ? groupIntoTurns(session.events ?? []) : [],
    [session]
  );

  // Auto-select: if turns have structure, default to turns; otherwise flat
  const hasTurnStructure = turns.length > 0 && (turns.length > 1 || turns[0]?.toolCalls?.length > 0);
  const effectiveMode = hasTurnStructure ? viewMode : "flat";

  if (!session) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      color: C.textMuted, fontSize: 13 }}>
      Select a session to inspect it
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
    <div ref={scrollRef} style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "monospace",
          marginBottom: 4 }}>{session.id}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor(session.avgScore),
            fontFamily: "monospace" }}>
            {session.avgScore?.toFixed(2) ?? "—"}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            {formatTimeRange(session.start, session.end)}
            <span style={{ marginLeft: 10 }}>{session.events?.length ?? 0} events</span>
            {hasTurnStructure && (
              <span style={{ marginLeft: 10 }}>{turns.length} turns</span>
            )}
            {session.blocks > 0 && (
              <span style={{ marginLeft: 10, color: C.red }}>⊘ {session.blocks} blocks</span>
            )}
          </div>
        </div>
      </div>

      <SummaryStrip events={session.events ?? []} />
      <ScoreSparkline events={session.events ?? []} />

      {/* Timeline header with view toggle */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.06em",
          textTransform: "uppercase", fontFamily: "monospace" }}>
          {effectiveMode === "turns" ? "Turn Timeline" : "Event Timeline"}
        </div>
        <div style={{ flex: 1 }} />
        {hasTurnStructure && (
          <div style={{
            display: "inline-flex", borderRadius: 4, overflow: "hidden",
            border: `1px solid ${C.border}`,
          }}>
            {[["turns", "Turns"], ["flat", "Flat"]].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                fontSize: 9, padding: "2px 8px",
                border: "none",
                borderRight: mode === "turns" ? `1px solid ${C.border}` : "none",
                background: viewMode === mode ? `${C.pink}20` : "transparent",
                color: viewMode === mode ? C.pink : C.textMuted,
                cursor: "pointer", fontFamily: "monospace", transition: "all 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Turn view */}
      {effectiveMode === "turns" ? (
        <div>
          {turns.map((t) => (
            <TurnCard
              key={`turn-${t.turn}-${t.start}`}
              turn={t}
              defaultExpanded={turns.length <= 5}
            />
          ))}
        </div>
      ) : (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {(session.events ?? []).map((e, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${C.border}`, padding: "2px 0" }}>
              <DetailEventRow event={e} />
            </div>
          ))}
        </div>
      )}
    </div>
    <ScrollJumpButtons scrollRef={scrollRef} />
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function Sessions({ sessions, loading }) {
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState("");

  const filtered = sessions.filter((s) =>
    !search || s.id?.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupByDay(filtered);
  const selectedSession = sessions.find((s) => s.id === selected) ?? null;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>

      {/* Left: session list */}
      <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", background: C.bg1 }}>
        <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${C.border}`,
          flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary,
            marginBottom: 10 }}>Sessions</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions…"
            style={{
              width: "100%", fontSize: 11, padding: "5px 9px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: C.bg2,
              color: C.textPrimary, outline: "none", fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 12 }}>
              Loading sessions…
            </div>
          )}
          {!loading && grouped.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 12 }}>
              No sessions found
            </div>
          )}
          {grouped.map(([day, daySessions]) => (
            <div key={day}>
              <div style={{ padding: "8px 16px 4px", fontSize: 9, color: C.textMuted,
                letterSpacing: "0.08em", textTransform: "uppercase",
                fontFamily: "monospace" }}>
                {formatDayLabel(day)}
              </div>
              {daySessions.map((s) => (
                <SessionListItem
                  key={s.id}
                  session={s}
                  selected={selected}
                  onClick={() => setSelected(s.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Right: session detail */}
      <SessionDetail session={selectedSession} />
    </div>
  );
}