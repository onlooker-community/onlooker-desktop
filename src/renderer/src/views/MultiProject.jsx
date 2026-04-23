// Multi-Project Overview — bird's eye health view across all active projects.
// Table of all projects with 7-day metrics, sortable, click to drill down.

import { useState, useMemo } from "react";
import { useCostData, useInstructionHealth } from "../hooks/useOnlooker.js";

const C = {
  bg0: "#0b0d14", bg1: "#12151f", bg2: "#181c2a", bg3: "#1f2335",
  border: "#252a3d",
  pink: "#f472b6", cyan: "#22d3ee", yellow: "#fbbf24",
  green: "#4ade80", red: "#f87171",
  textPrimary: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "#475569",
};

function fmtCost(n) {
  if (n == null || isNaN(n)) return "—";
  if (n < 0.005) return "<$0.01";
  return "$" + n.toFixed(2);
}

function scoreColor(s) {
  if (s == null) return C.textMuted;
  if (s >= 0.85) return C.green;
  if (s >= 0.70) return C.yellow;
  return C.red;
}

function frictionColor(s) {
  if (s == null) return C.textMuted;
  if (s < 0.3) return C.green;
  if (s < 0.6) return C.yellow;
  return C.red;
}

function relativeTime(ts) {
  if (!ts) return "—";
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
  if (parts.length <= 3) return cwd;
  return parts.slice(-2).join("/");
}

const SORT_KEYS = [
  { id: "sessions", label: "Sessions" },
  { id: "cost",     label: "Cost" },
  { id: "friction", label: "Friction" },
  { id: "warden",   label: "Warden" },
  { id: "last",     label: "Last Active" },
];

export default function MultiProject({ sessions }) {
  const [sortKey, setSortKey] = useState("sessions");
  const [sortAsc, setSortAsc] = useState(false);
  const { records: costRecords } = useCostData();
  const health = useInstructionHealth();

  // 7-day cutoff
  const cutoff = new Date(Date.now() - 7 * 86400000);

  const projects = useMemo(() => {
    const cwdMap = {};

    for (const s of sessions) {
      const cwdEvent = (s.events ?? []).find((e) =>
        e.meta?.cwd || e.meta?.working_directory
      );
      const cwd = cwdEvent?.meta?.cwd ?? cwdEvent?.meta?.working_directory ?? health?.cwd ?? "(unknown)";

      if (!cwdMap[cwd]) {
        cwdMap[cwd] = {
          cwd,
          sessions7d: 0,
          sessionsAll: 0,
          cost7d: 0,
          frictionSum: 0,
          frictionCount: 0,
          wardenEvents: 0,
          scoreSum: 0,
          scoreCount: 0,
          lastActive: null,
          sessionIds: new Set(),
        };
      }
      const p = cwdMap[cwd];
      p.sessionsAll++;
      p.sessionIds.add(s.id);

      const isRecent = s.start && new Date(s.start) >= cutoff;
      if (isRecent) p.sessions7d++;

      if (s.friction != null) {
        p.frictionSum += s.friction.score;
        p.frictionCount++;
      }
      if (s.avgScore != null) {
        p.scoreSum += s.avgScore;
        p.scoreCount++;
      }
      p.wardenEvents += (s.events ?? []).filter(
        (e) => e.plugin === "warden" && e.status === "block"
      ).length;

      if (!p.lastActive || (s.start && s.start > p.lastActive)) {
        p.lastActive = s.start;
      }
    }

    // Add cost data
    for (const r of costRecords) {
      if (new Date(r.ts) < cutoff) continue;
      for (const p of Object.values(cwdMap)) {
        if (p.sessionIds.has(r.session_id)) {
          p.cost7d += r.estimated_cost_usd;
        }
      }
    }

    // Compute averages
    return Object.values(cwdMap).map((p) => ({
      ...p,
      avgFriction: p.frictionCount > 0 ? p.frictionSum / p.frictionCount : null,
      avgScore: p.scoreCount > 0 ? p.scoreSum / p.scoreCount : null,
    }));
  }, [sessions, costRecords, health?.cwd]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...projects];
    const dir = sortAsc ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "sessions": return (a.sessions7d - b.sessions7d) * dir;
        case "cost":     return (a.cost7d - b.cost7d) * dir;
        case "friction": return ((a.avgFriction ?? 0) - (b.avgFriction ?? 0)) * dir;
        case "warden":   return (a.wardenEvents - b.wardenEvents) * dir;
        case "last":     return ((new Date(a.lastActive || 0)) - (new Date(b.lastActive || 0))) * dir;
        default:         return 0;
      }
    });
    return arr;
  }, [projects, sortKey, sortAsc]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 18,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
          All Projects
        </span>
        <span style={{ fontSize: 10, color: C.textMuted }}>
          {projects.length} project{projects.length !== 1 ? "s" : ""} · last 7 days
        </span>
      </div>

      {projects.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px", color: C.textMuted,
        }}>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>◰</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>No projects found</div>
          <div style={{ fontSize: 11 }}>
            Projects appear once agent sessions are recorded with working directory metadata.
          </div>
        </div>
      ) : (
        <div style={{
          background: C.bg2, borderRadius: 10,
          border: `1px solid ${C.border}`, overflow: "hidden",
        }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr",
            gap: 0, padding: "8px 14px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 9, color: C.textMuted, fontFamily: "monospace",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <span>Project</span>
            {SORT_KEYS.map((sk) => (
              <span key={sk.id}
                onClick={() => toggleSort(sk.id)}
                style={{
                  cursor: "pointer", textAlign: "right",
                  color: sortKey === sk.id ? C.pink : C.textMuted,
                }}>
                {sk.label} {sortKey === sk.id ? (sortAsc ? "↑" : "↓") : ""}
              </span>
            ))}
            <span style={{ textAlign: "right" }}>Score</span>
          </div>

          {/* Rows */}
          {sorted.map((p) => (
            <div key={p.cwd} style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr",
              gap: 0, padding: "10px 14px",
              borderBottom: `1px solid ${C.border}`,
              fontSize: 11,
              transition: "background 0.1s",
              cursor: "default",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${C.pink}08`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{
                color: C.textPrimary, fontFamily: "monospace", fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {shortenCwd(p.cwd)}
              </span>
              <span style={{ color: C.textSecondary, textAlign: "right", fontFamily: "monospace" }}>
                {p.sessions7d}
              </span>
              <span style={{
                textAlign: "right", fontFamily: "monospace",
                color: p.cost7d > 5 ? C.red : p.cost7d > 1 ? C.yellow : C.green,
              }}>
                {fmtCost(p.cost7d)}
              </span>
              <span style={{
                textAlign: "right", fontFamily: "monospace",
                color: frictionColor(p.avgFriction),
              }}>
                {p.avgFriction?.toFixed(2) ?? "—"}
              </span>
              <span style={{
                textAlign: "right", fontFamily: "monospace",
                color: p.wardenEvents > 0 ? C.red : C.textMuted,
              }}>
                {p.wardenEvents}
              </span>
              <span style={{
                textAlign: "right", fontFamily: "monospace",
                color: C.textMuted, fontSize: 10,
              }}>
                {relativeTime(p.lastActive)}
              </span>
              <span style={{
                textAlign: "right", fontFamily: "monospace",
                color: scoreColor(p.avgScore),
              }}>
                {p.avgScore?.toFixed(2) ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
