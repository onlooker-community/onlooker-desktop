// Weekly Review view — full-width document-feel summary of the past 7 days.
// This replaces the old WeeklyReview modal component.

import { useState, useMemo } from "react";

const C = {
  bg0: "#0b0d14", bg1: "#12151f", bg2: "#181c2a",
  border: "#252a3d", borderAccent: "#2e3555",
  pink: "#f472b6", pinkDim: "#9d346b",
  cyan: "#22d3ee", yellow: "#fbbf24",
  green: "#4ade80", red: "#f87171",
  textPrimary: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "#475569",
};

function scoreColor(s) {
  if (s == null) return C.textMuted;
  if (s >= 0.85) return C.green;
  if (s >= 0.70) return C.yellow;
  return C.red;
}

function StatItem({ label, value, delta, color }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? C.textPrimary,
        fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, marginBottom: 3 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.textSecondary }}>{label}</div>
      {delta != null && (
        <div style={{ fontSize: 10, color: delta >= 0 ? C.green : C.red, marginTop: 2 }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}
        </div>
      )}
    </div>
  );
}

function DayRow({ session, isTop }) {
  const date = new Date(session.start + "T12:00:00" || "").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  const score = session.avgScore;
  const color = scoreColor(score);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "7px 12px", borderRadius: 6, marginBottom: 3,
      background: isTop ? `${C.green}0a` : "transparent",
      border: `1px solid ${isTop ? C.green + "22" : "transparent"}`,
    }}>
      <span style={{ width: 110, fontSize: 10, color: C.textMuted,
        fontFamily: "monospace", flexShrink: 0 }}>{date}</span>
      {/* Score bar */}
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: C.bg2, overflow: "hidden" }}>
        <div style={{ width: `${(score ?? 0) * 100}%`, height: "100%",
          background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color, fontFamily: "monospace", width: 32,
        textAlign: "right", flexShrink: 0 }}>
        {score?.toFixed(2) ?? "—"}
      </span>
      <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace",
        width: 36, textAlign: "right", flexShrink: 0 }}>
        {session.events?.length ?? 0}ev
      </span>
      {session.blocks > 0 && (
        <span style={{ fontSize: 9, color: C.red, background: `${C.red}15`,
          padding: "1px 5px", borderRadius: 3, fontFamily: "monospace",
          flexShrink: 0 }}>
          ⊘ {session.blocks}
        </span>
      )}
      {session.warns > 0 && !session.blocks && (
        <span style={{ fontSize: 9, color: C.yellow, background: `${C.yellow}15`,
          padding: "1px 5px", borderRadius: 3, fontFamily: "monospace",
          flexShrink: 0 }}>
          ⚑ {session.warns}
        </span>
      )}
    </div>
  );
}

// Template-generated narrative from metrics (no API key required)
function generateNarrative(sessions, avgScore, totalBlocks, totalWarns) {
  if (sessions.length === 0) return "No sessions this week.";

  const sorted = [...sessions].filter((s) => s.avgScore != null)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
  const best  = sorted[0];
  const worst = sorted[sorted.length - 1];

  const scoreWord = avgScore >= 0.85 ? "Strong" : avgScore >= 0.70 ? "Solid" : "Challenging";
  const bestDate  = best?.start ? new Date(best.start).toLocaleDateString("en-US",
    { weekday: "long" }) : null;
  const worstDate = worst?.start ? new Date(worst.start).toLocaleDateString("en-US",
    { weekday: "long" }) : null;

  let narrative = `${scoreWord} week overall (avg ${(avgScore * 100).toFixed(0)}%).`;
  if (bestDate && best?.avgScore) {
    narrative += ` ${bestDate} was your peak session (${best.avgScore.toFixed(2)}).`;
  }
  if (worst && worst.id !== best?.id && worst?.avgScore != null) {
    narrative += ` ${worstDate} had the lowest score (${worst.avgScore.toFixed(2)})`;
    if (worst.warns > 0 || worst.blocks > 0) {
      narrative += ` with ${worst.warns + worst.blocks} flags`;
    }
    narrative += ".";
  }
  if (totalBlocks > 0) {
    narrative += ` Sentinel blocked ${totalBlocks} operation${totalBlocks > 1 ? "s" : ""} this week.`;
  }
  narrative += " Consider running Echo regression against your lowest-scoring session.";
  return narrative;
}

export default function WeeklyReview({ sessions }) {
  const [counselKeyConnected, setCounselKeyConnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Filter to last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const thisWeek = useMemo(() =>
    sessions.filter((s) => s.start && new Date(s.start) >= weekAgo),
    [sessions]
  );

  const avgScore = useMemo(() => {
    const scores = thisWeek.filter((s) => s.avgScore != null).map((s) => s.avgScore);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  }, [thisWeek]);

  const totalEvents = useMemo(() => thisWeek.reduce((a, s) => a + (s.events?.length ?? 0), 0), [thisWeek]);
  const totalBlocks = useMemo(() => thisWeek.reduce((a, s) => a + (s.blocks ?? 0), 0), [thisWeek]);
  const totalWarns  = useMemo(() => thisWeek.reduce((a, s) => a + (s.warns ?? 0), 0), [thisWeek]);
  const maxScore    = useMemo(() => Math.max(...thisWeek.filter((s) => s.avgScore != null).map((s) => s.avgScore), 0), [thisWeek]);

  // Sort by day for the day-row table
  const byDay = useMemo(() =>
    [...thisWeek].sort((a, b) => new Date(a.start) - new Date(b.start)),
    [thisWeek]
  );

  const narrative = useMemo(() =>
    generateNarrative(thisWeek, avgScore ?? 0, totalBlocks, totalWarns),
    [thisWeek, avgScore, totalBlocks, totalWarns]
  );

  const flaggedSessions = useMemo(() =>
    thisWeek.filter((s) => s.blocks > 0 || s.warns > 0 || (s.avgScore != null && s.avgScore < 0.75))
      .sort((a, b) => (a.avgScore ?? 1) - (b.avgScore ?? 1)),
    [thisWeek]
  );

  const weekStart = new Date(weekAgo).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const weekEnd   = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: C.pink, fontWeight: 700,
            letterSpacing: "0.12em", fontFamily: "monospace",
            textTransform: "uppercase", marginBottom: 4 }}>
            Weekly Review
          </div>
          <div style={{ fontSize: 11, color: C.textMuted }}>
            {weekStart} – {weekEnd}
          </div>
        </div>

        {thisWeek.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 13 }}>
            No sessions this week yet.
          </div>
        ) : (
          <>
            {/* Week at a glance */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12, marginBottom: 28 }}>
              <StatItem label="Avg Score"    value={avgScore?.toFixed(2) ?? "—"}
                color={scoreColor(avgScore)} />
              <StatItem label="Sessions"     value={thisWeek.length} />
              <StatItem label="Total Events" value={totalEvents} />
              <StatItem label="Blocks"       value={totalBlocks}
                color={totalBlocks > 0 ? C.red : C.textPrimary} />
            </div>

            {/* Day-by-day rows */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.06em",
                textTransform: "uppercase", fontFamily: "monospace", marginBottom: 10 }}>
                Day by Day
              </div>
              {byDay.map((s) => (
                <DayRow key={s.id} session={s} isTop={s.avgScore === maxScore && maxScore > 0} />
              ))}
            </div>

            {/* Synthesis */}
            <div style={{ background: C.bg2, borderRadius: 10, padding: "18px 20px",
              border: `1px solid ${C.border}`, marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.06em",
                textTransform: "uppercase", fontFamily: "monospace", marginBottom: 10 }}>
                Synthesis
              </div>
              <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7,
                fontStyle: "italic" }}>
                "{narrative}"
              </div>
            </div>

            {/* Counsel upsell — shown once, dismissible */}
            {!counselKeyConnected && !dismissed && (
              <div style={{ background: C.bg1, borderRadius: 10, padding: "16px 18px",
                border: `1px solid ${C.borderAccent}`, marginBottom: 24,
                boxShadow: `0 0 20px ${C.pink}08` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ fontSize: 16, color: C.pink, flexShrink: 0 }}>✦</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary,
                      marginBottom: 4 }}>Enable AI synthesis</div>
                    <div style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.6,
                      marginBottom: 12 }}>
                      Connect an Anthropic API key to generate a narrative weekly review
                      with Counsel. Uses ~2,000 tokens per review (~$0.03).
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => window.onlooker.window.close()}
                        style={{
                          fontSize: 11, padding: "6px 14px", borderRadius: 6,
                          border: `1px solid ${C.pinkDim}`,
                          background: `${C.pink}15`, color: C.pink,
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = `${C.pink}25`}
                        onMouseLeave={(e) => e.currentTarget.style.background = `${C.pink}15`}
                      >
                        Connect API key →
                      </button>
                      <button onClick={() => setDismissed(true)} style={{
                        fontSize: 11, padding: "6px 14px", borderRadius: 6,
                        border: `1px solid ${C.border}`, background: "transparent",
                        color: C.textMuted, cursor: "pointer", transition: "all 0.15s",
                      }}>
                        Not now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Flagged sessions */}
            {flaggedSessions.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: "0.06em",
                  textTransform: "uppercase", fontFamily: "monospace", marginBottom: 10 }}>
                  Needs Attention
                </div>
                {flaggedSessions.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", background: C.bg2, borderRadius: 6, marginBottom: 6,
                    border: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 10, color: scoreColor(s.avgScore),
                      fontFamily: "monospace", fontWeight: 700 }}>
                      {s.avgScore?.toFixed(2) ?? "—"}
                    </span>
                    <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>
                      {s.id?.slice(0, 16)}…
                    </span>
                    <span style={{ fontSize: 10, color: C.textMuted, marginLeft: "auto" }}>
                      {s.blocks > 0 && <span style={{ color: C.red }}>⊘ {s.blocks}  </span>}
                      {s.warns  > 0 && <span style={{ color: C.yellow }}>⚑ {s.warns}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Export row */}
            <div style={{ display: "flex", gap: 8 }}>
              <ActionBtn label="Export markdown" onClick={() => {}} />
              <ActionBtn label="Run Echo regression" onClick={() =>
                window.onlooker.plugins.run("echo", "run", [])} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, padding: "7px 14px", borderRadius: 7,
      border: `1px solid ${C.border}`, background: "transparent",
      color: C.textSecondary, cursor: "pointer", transition: "all 0.15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.color = C.textPrimary; e.currentTarget.style.borderColor = C.borderAccent; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = C.textSecondary; e.currentTarget.style.borderColor = C.border; }}
    >
      {label}
    </button>
  );
}
