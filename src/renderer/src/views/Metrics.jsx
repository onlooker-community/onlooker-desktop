// Metrics view — aggregated stats across all sessions for a selected time range.

import { useState, useMemo } from "react";
import {
  PLUGIN_IDS, PLUGIN_COLORS, PLUGIN_REGISTRY,
  STATUS_COLORS, pluginColor,
} from "../plugins.js";

const C = {
  bg0: "#0b0d14", bg1: "#12151f", bg2: "#181c2a", bg3: "#1f2335",
  border: "#252a3d",
  pink: "#f472b6", cyan: "#22d3ee", yellow: "#fbbf24",
  green: "#4ade80", red: "#f87171",
  textPrimary: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "#475569",
};

function scoreColor(s) {
  if (s == null) return C.textMuted;
  if (s >= 0.85) return C.green;
  if (s >= 0.70) return C.yellow;
  return C.red;
}

const RANGES = [
  { id: "today",  label: "Today"      },
  { id: "week",   label: "This week"  },
  { id: "month",  label: "This month" },
  { id: "all",    label: "All time"   },
];

function filterByRange(sessions, range) {
  const now    = new Date();
  const cutoff = {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    week:  new Date(now - 7  * 86400000),
    month: new Date(now - 30 * 86400000),
    all:   new Date(0),
  }[range];
  return sessions.filter((s) => s.start && new Date(s.start) >= cutoff);
}

// ── Reusable primitives ───────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: C.bg2, borderRadius: 10, padding: "14px 16px",
      border: `1px solid ${C.border}`, flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, marginBottom: 4,
        color: color ?? C.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.textSecondary }}>{label}</div>
    </div>
  );
}

function MiniBar({ label, value, max, color, count, sub }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: 130, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%",
          background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: C.textSecondary,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </div>
      <div style={{ flex: 1, height: 3, borderRadius: 2,
        background: C.bg3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color,
          borderRadius: 2, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace",
        width: 36, textAlign: "right", flexShrink: 0 }}>{count}</span>
      {sub && <span style={{ fontSize: 9, color: C.textMuted, width: 60,
        flexShrink: 0 }}>{sub}</span>}
    </div>
  );
}

// ── Score sparkline ───────────────────────────────────────────────────────────

function ScoreSparkline({ sessions }) {
  const byDay = {};
  for (const s of sessions) {
    if (!s.start || s.avgScore == null) continue;
    const day = s.start.slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(s.avgScore);
  }
  const points = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, scores]) => ({
      day,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }));

  if (points.length < 2) return null;

  const w = 480, h = 72, px = 8, py = 8;
  const minY = 0.5, maxY = 1.0;
  const xs = points.map((_, i) => px + (i / (points.length - 1)) * (w - px * 2));
  const ys = points.map((p) => h - py - ((p.avg - minY) / (maxY - minY)) * (h - py * 2));
  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${line} L${xs[xs.length - 1]},${h} L${xs[0]},${h} Z`;

  return (
    <div style={{ background: C.bg2, borderRadius: 10, padding: "16px 18px",
      border: `1px solid ${C.border}`, marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.07em",
        textTransform: "uppercase", fontFamily: "monospace", marginBottom: 10 }}>
        Score over time
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={C.pink} stopOpacity="0.25" />
            <stop offset="100%" stopColor={C.pink} stopOpacity="0"    />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sg)" />
        <path d={line} fill="none" stroke={C.pink} strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" />
        {xs.map((x, i) => (
          <circle key={i} cx={x} cy={ys[i]} r={3} fill={scoreColor(points[i].avg)} />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {points.filter((_, i) => i === 0 || i === points.length - 1 || points.length <= 7)
          .map((p, i) => (
            <span key={i} style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}>
              {new Date(p.day + "T12:00:00").toLocaleDateString("en-US",
                { month: "short", day: "numeric" })}
            </span>
          ))}
      </div>
    </div>
  );
}

// ── Plugin activity section ───────────────────────────────────────────────────
// Groups plugins by category, shows event count + pass rate per plugin.

function PluginActivity({ allEvents }) {
  // Count events and pass rate per plugin
  const byPlugin = useMemo(() => {
    const map = {};
    for (const e of allEvents) {
      if (!map[e.plugin]) map[e.plugin] = { total: 0, pass: 0, warn: 0, block: 0 };
      map[e.plugin].total++;
      if (e.status === "pass" || e.status === "allow") map[e.plugin].pass++;
      if (e.status === "warn" || e.status === "fail")  map[e.plugin].warn++;
      if (e.status === "block")                        map[e.plugin].block++;
    }
    return map;
  }, [allEvents]);

  // Only show plugins that actually have events, grouped by category
  const activePlugins = Object.keys(byPlugin);
  if (activePlugins.length === 0) return null;

  const maxCount = Math.max(...activePlugins.map((id) => byPlugin[id].total));

  // Group by category, only showing categories with active plugins
  const categories = {};
  for (const id of activePlugins) {
    const cat = PLUGIN_REGISTRY[id]?.category ?? "Other";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(id);
  }

  return (
    <div style={{ background: C.bg2, borderRadius: 10, padding: "16px 18px",
      border: `1px solid ${C.border}`, marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.07em",
        textTransform: "uppercase", fontFamily: "monospace", marginBottom: 14 }}>
        Plugin Activity
      </div>

      {Object.entries(categories).map(([cat, ids]) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.06em",
            textTransform: "uppercase", fontFamily: "monospace", marginBottom: 8,
            paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
            {cat}
          </div>
          {ids.map((id) => {
            const stats = byPlugin[id];
            const color = pluginColor(id);
            const sub   = stats.block > 0 ? `⊘ ${stats.block}` :
                          stats.warn  > 0 ? `⚑ ${stats.warn}`  : null;
            return (
              <MiniBar
                key={id}
                label={PLUGIN_REGISTRY[id]?.desc
                  ? id.charAt(0).toUpperCase() + id.slice(1)
                  : id}
                value={stats.total}
                max={maxCount}
                color={color}
                count={stats.total}
                sub={sub}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Top flagged patterns ──────────────────────────────────────────────────────

function FlaggedPatterns({ allEvents }) {
  const patterns = useMemo(() => {
    const counts = {};
    for (const e of allEvents) {
      if (e.status === "warn" || e.status === "fail" || e.status === "block") {
        const key = `${e.plugin}:${e.label ?? e.type ?? "unknown"}`;
        if (!counts[key]) counts[key] = { count: 0, plugin: e.plugin };
        counts[key].count++;
      }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 8)
      .map(([key, v]) => ({ key, ...v }));
  }, [allEvents]);

  if (patterns.length === 0) return null;
  const maxCount = patterns[0].count;

  return (
    <div style={{ background: C.bg2, borderRadius: 10, padding: "16px 18px",
      border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.07em",
        textTransform: "uppercase", fontFamily: "monospace", marginBottom: 12 }}>
        Top Flagged Patterns
      </div>
      {patterns.map(({ key, count, plugin }) => (
        <MiniBar
          key={key}
          label={key}
          value={count}
          max={maxCount}
          color={pluginColor(plugin)}
          count={count}
        />
      ))}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function Metrics({ sessions }) {
  const [range, setRange] = useState("week");

  const filtered  = useMemo(() => filterByRange(sessions, range), [sessions, range]);
  const allEvents = useMemo(() => filtered.flatMap((s) => s.events ?? []), [filtered]);

  const avgScore = useMemo(() => {
    const scores = filtered.filter((s) => s.avgScore != null).map((s) => s.avgScore);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  }, [filtered]);

  const totalBlocks = useMemo(() =>
    allEvents.filter((e) => e.status === "block").length, [allEvents]);

  const totalWarns = useMemo(() =>
    allEvents.filter((e) => e.status === "warn" || e.status === "fail").length, [allEvents]);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>

      {/* Header + range selector */}
      <div style={{ display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 18 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>Metrics</span>
        <div style={{ display: "flex", gap: 2 }}>
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} style={{
              fontSize: 10, padding: "4px 10px", borderRadius: 5, cursor: "pointer",
              border: `1px solid ${range === r.id ? C.pink : C.border}`,
              background: range === r.id ? `${C.pink}15` : "transparent",
              color: range === r.id ? C.pink : C.textMuted,
              fontFamily: "inherit", transition: "all 0.15s",
            }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <StatCard label="Avg Score"    value={avgScore?.toFixed(2) ?? "—"}
          color={scoreColor(avgScore)} />
        <StatCard label="Sessions"     value={filtered.length} />
        <StatCard label="Total Events" value={allEvents.length} />
        <StatCard label="Blocks"       value={totalBlocks}
          color={totalBlocks > 0 ? C.red : C.green} />
      </div>

      {/* Score sparkline */}
      <ScoreSparkline sessions={filtered} />

      {/* Plugin activity grouped by category */}
      <PluginActivity allEvents={allEvents} />

      {/* Top flagged patterns */}
      <FlaggedPatterns allEvents={allEvents} />

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0",
          color: C.textMuted, fontSize: 12 }}>
          No sessions in this time range
        </div>
      )}
    </div>
  );
}