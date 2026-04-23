// Dead End Map — cross-session view of recurring failed approaches from Archivist.
// Groups by working directory, shows recurrence counts and filtering.

import { useState, useMemo } from "react";
import { useDeadEnds } from "../hooks/useOnlooker.js";

const C = {
  bg0: "#0b0d14", bg1: "#12151f", bg2: "#181c2a", bg3: "#1f2335",
  border: "#252a3d",
  pink: "#f472b6", cyan: "#22d3ee", yellow: "#fbbf24",
  green: "#4ade80", red: "#f87171",
  textPrimary: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "#475569",
};

const RANGES = [
  { id: "today", label: "Today" },
  { id: "week",  label: "This week" },
  { id: "month", label: "This month" },
  { id: "all",   label: "All time" },
];

function filterByRange(records, range) {
  const now = new Date();
  const cutoff = {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    week:  new Date(now - 7 * 86400000),
    month: new Date(now - 30 * 86400000),
    all:   new Date(0),
  }[range];
  return records.filter((r) => r.ts && new Date(r.ts) >= cutoff);
}

function recurrenceColor(count) {
  if (count >= 4) return C.red;
  if (count >= 2) return C.yellow;
  return C.textMuted;
}

function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortenCwd(cwd) {
  if (!cwd) return "(unknown)";
  const parts = cwd.split("/");
  return parts.length > 3
    ? ".../" + parts.slice(-2).join("/")
    : cwd;
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: C.bg2, borderRadius: 10, padding: "14px 16px",
      border: `1px solid ${C.border}`, flex: 1, minWidth: 0,
    }}>
      <div style={{
        fontSize: 22, fontWeight: 700, lineHeight: 1, marginBottom: 4,
        color: color ?? C.textPrimary, fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.textSecondary }}>{label}</div>
    </div>
  );
}

function DeadEndRow({ entry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        padding: "8px 12px", cursor: "pointer",
        borderBottom: `1px solid ${C.border}`,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.bg2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Recurrence badge */}
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: "monospace",
          padding: "2px 6px", borderRadius: 4, minWidth: 20, textAlign: "center",
          background: `${recurrenceColor(entry.count)}22`,
          color: recurrenceColor(entry.count),
          border: `1px solid ${recurrenceColor(entry.count)}44`,
        }}>
          {entry.count}x
        </span>

        {/* Approach text */}
        <span style={{
          fontSize: 11, color: C.textPrimary, flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {entry.approach}
        </span>

        {/* Category tag */}
        {entry.category && (
          <span style={{
            fontSize: 8, color: C.textMuted, fontFamily: "monospace",
            padding: "1px 5px", borderRadius: 3,
            background: `${C.textMuted}15`, border: `1px solid ${C.border}`,
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            {entry.category}
          </span>
        )}

        {/* Last seen */}
        <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace", flexShrink: 0 }}>
          {relativeTime(entry.lastSeen)}
        </span>
      </div>

      {expanded && (
        <div style={{
          marginTop: 8, padding: "8px 10px",
          background: C.bg0, borderRadius: 5,
          border: `1px solid ${C.border}`,
        }}>
          {entry.context && (
            <div style={{ fontSize: 10, color: C.textSecondary, marginBottom: 6 }}>
              <span style={{ color: C.textMuted }}>Context: </span>{entry.context}
            </div>
          )}
          {entry.outcome && (
            <div style={{ fontSize: 10, color: C.red, marginBottom: 6 }}>
              <span style={{ color: C.textMuted }}>Outcome: </span>{entry.outcome}
            </div>
          )}
          {entry.tools.size > 0 && (
            <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>
              Tools: {[...entry.tools].join(", ")}
            </div>
          )}
          <div style={{ fontSize: 9, color: C.textMuted }}>
            Sessions: {entry.sessions.length}
          </div>
        </div>
      )}
    </div>
  );
}

function CwdGroup({ cwd, entries }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{
      background: C.bg2, borderRadius: 10,
      border: `1px solid ${C.border}`, marginBottom: 12,
      overflow: "hidden",
    }}>
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px", cursor: "pointer",
          borderBottom: collapsed ? "none" : `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: 10, color: C.textMuted, transition: "transform 0.15s",
          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
          ▼
        </span>
        <span style={{
          fontSize: 11, color: C.textSecondary, fontFamily: "monospace", flex: 1,
        }}>
          {shortenCwd(cwd)}
        </span>
        <span style={{
          fontSize: 9, color: C.textMuted, fontFamily: "monospace",
          padding: "1px 6px", borderRadius: 3,
          background: `${C.textMuted}15`,
        }}>
          {entries.length} dead end{entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {!collapsed && (
        <div>
          {entries.map((entry, i) => (
            <DeadEndRow key={`${entry.approach}-${i}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DeadEndMap() {
  const { records, loading } = useDeadEnds();
  const [range, setRange] = useState("all");
  const [search, setSearch] = useState("");
  const [minRecurrence, setMinRecurrence] = useState(1);

  const filtered = useMemo(() => filterByRange(records, range), [records, range]);

  // Group by CWD, then by normalized approach
  const grouped = useMemo(() => {
    const searchLower = search.toLowerCase();
    const matching = filtered.filter((r) =>
      !search ||
      r.approach?.toLowerCase().includes(searchLower) ||
      r.context?.toLowerCase().includes(searchLower)
    );

    const byCwd = {};
    for (const r of matching) {
      const cwd = r.cwd ?? "(unknown)";
      if (!byCwd[cwd]) byCwd[cwd] = {};
      const key = r.approach?.toLowerCase().trim() ?? "";
      if (!byCwd[cwd][key]) {
        byCwd[cwd][key] = {
          approach: r.approach,
          sessions: [],
          count: 0,
          lastSeen: r.ts,
          category: r.category,
          context: r.context,
          outcome: r.outcome,
          tools: new Set(),
        };
      }
      const entry = byCwd[cwd][key];
      entry.count++;
      if (r.session_id) entry.sessions.push(r.session_id);
      if (r.ts > entry.lastSeen) entry.lastSeen = r.ts;
      (r.tools_involved ?? []).forEach((t) => entry.tools.add(t));
    }

    return Object.entries(byCwd)
      .map(([cwd, approaches]) => ({
        cwd,
        entries: Object.values(approaches)
          .filter((e) => e.count >= minRecurrence)
          .sort((a, b) => b.count - a.count),
      }))
      .filter((g) => g.entries.length > 0)
      .sort((a, b) => b.entries.length - a.entries.length);
  }, [filtered, search, minRecurrence]);

  const totalDeadEnds = grouped.reduce((s, g) => s + g.entries.length, 0);
  const totalRecurrences = grouped.reduce((s, g) =>
    s + g.entries.reduce((s2, e) => s2 + e.count, 0), 0);
  const maxRecurrence = grouped.reduce((m, g) =>
    Math.max(m, ...g.entries.map((e) => e.count)), 0);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
      {/* Header + range */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 18,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
            Dead Ends
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            padding: "1px 5px", borderRadius: 3,
            border: `1px solid ${C.cyan}44`, color: C.cyan,
            background: `${C.cyan}11`, fontFamily: "'JetBrains Mono', monospace",
          }}>
            ARC
          </span>
        </div>
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

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 12 }}>
          Loading dead end data...
        </div>
      ) : records.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px", color: C.textMuted,
        }}>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>⊗</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No dead ends recorded</div>
          <div style={{ fontSize: 11 }}>
            Dead ends appear when Archivist captures failed approaches across sessions.
            They help you avoid repeating mistakes.
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <StatCard label="Unique Approaches" value={totalDeadEnds} />
            <StatCard label="Total Occurrences" value={totalRecurrences} />
            <StatCard label="Projects" value={grouped.length} />
            <StatCard label="Most Recurring" value={maxRecurrence > 0 ? `${maxRecurrence}x` : "—"}
              color={recurrenceColor(maxRecurrence)} />
          </div>

          {/* Filters */}
          <div style={{
            display: "flex", gap: 10, marginBottom: 16, alignItems: "center",
          }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approaches..."
              style={{
                flex: 1, fontSize: 11, padding: "6px 10px", borderRadius: 6,
                border: `1px solid ${C.border}`, background: C.bg2,
                color: C.textPrimary, outline: "none", fontFamily: "inherit",
              }}
            />
            <select
              value={minRecurrence}
              onChange={(e) => setMinRecurrence(Number(e.target.value))}
              style={{
                fontSize: 10, padding: "5px 8px", borderRadius: 5,
                border: `1px solid ${C.border}`, background: C.bg2,
                color: C.textSecondary, outline: "none", cursor: "pointer",
              }}
            >
              <option value={1}>Any</option>
              <option value={2}>2+</option>
              <option value={3}>3+</option>
              <option value={5}>5+</option>
            </select>
          </div>

          {/* Grouped list */}
          {grouped.map(({ cwd, entries }) => (
            <CwdGroup key={cwd} cwd={cwd} entries={entries} />
          ))}

          {grouped.length === 0 && (
            <div style={{
              textAlign: "center", padding: "30px 0", color: C.textMuted, fontSize: 12,
            }}>
              No dead ends match your filters
            </div>
          )}
        </>
      )}
    </div>
  );
}
