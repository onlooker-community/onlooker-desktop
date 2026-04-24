// Weekly Review modal.
//
// On mount it does two things in parallel:
//   1. Calls logs.query({ from: 7 days ago }) to derive session history from
//      real JSONL files — grouping by day, computing avg Tribunal score per day.
//   2. Listens for a REVIEW_READY IPC event in case the main process sends a
//      Counsel-synthesized digest (not yet wired up, but the hook is here).
//
// If neither produces data (fresh install, no logs yet) it falls back to
// illustrative placeholder data so the UI isn't empty.

import { useEffect, useState } from "react";

const C = {
	bg0: "#0b0d14",
	bg1: "#12151f",
	bg2: "#181c2a",
	border: "#252a3d",
	borderAccent: "#2e3555",
	pink: "#f472b6",
	pinkDim: "#9d346b",
	green: "#4ade80",
	yellow: "#fbbf24",
	red: "#f87171",
	cyan: "#22d3ee",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

function scoreColor(s) {
	if (s >= 0.85) return C.green;
	if (s >= 0.7) return C.yellow;
	return C.red;
}

function MiniBar({ value, color }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
			<div
				style={{
					flex: 1,
					height: 3,
					borderRadius: 2,
					background: C.bg2,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						width: `${Math.min(value * 100, 100)}%`,
						height: "100%",
						background: color,
						borderRadius: 2,
						transition: "width 0.5s ease",
					}}
				/>
			</div>
			<span
				style={{
					fontSize: 10,
					color: C.textMuted,
					fontFamily: "monospace",
					width: 28,
					textAlign: "right",
				}}
			>
				{(value * 100).toFixed(0)}%
			</span>
		</div>
	);
}

// Placeholder sessions shown while real data is loading or unavailable
const PLACEHOLDER_SESSIONS = [
	{ date: "Mon Apr 14", score: 0.91, turns: 31, flags: 0 },
	{ date: "Tue Apr 15", score: 0.78, turns: 19, flags: 2 },
	{ date: "Wed Apr 16", score: 0.85, turns: 44, flags: 1 },
	{ date: "Thu Apr 17", score: 0.92, turns: 28, flags: 0 },
	{ date: "Fri Apr 18", score: 0.73, turns: 52, flags: 3 },
	{ date: "Sat Apr 19", score: 0.88, turns: 14, flags: 0 },
	{ date: "Today", score: 0.84, turns: 23, flags: 1 },
];

export default function WeeklyReview({ onClose }) {
	const [sessions, setSessions] = useState(null);
	const [synthesis, setSynthesis] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// Listen for Counsel synthesis pushed from the main process
		const unsub = window.onlooker.review.onReady((data) => {
			if (data.sessions) setSessions(data.sessions);
			if (data.synthesis) setSynthesis(data.synthesis);
			setLoading(false);
		});

		// Query the last 7 days from real JSONL logs
		const weekAgo = new Date(
			Date.now() - 7 * 24 * 60 * 60 * 1000,
		).toISOString();
		window.onlooker.logs.query({ from: weekAgo }).then((events) => {
			if (!events?.length) {
				setLoading(false);
				return;
			}

			// Group events by calendar day (YYYY-MM-DD)
			const byDay = {};
			events.forEach((e) => {
				const day = e.ts.slice(0, 10);
				if (!byDay[day]) byDay[day] = { events: [], scores: [] };
				byDay[day].events.push(e);
				if (e.plugin === "tribunal" && e.meta?.score != null) {
					byDay[day].scores.push(e.meta.score);
				}
			});

			const derived = Object.entries(byDay)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([date, { events, scores }]) => ({
					date: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
						weekday: "short",
						month: "short",
						day: "numeric",
					}),
					score: scores.length
						? scores.reduce((a, b) => a + b) / scores.length
						: 0.8,
					turns: events.length,
					flags: events.filter(
						(e) => e.status === "warn" || e.status === "fail",
					).length,
				}));

			setSessions(derived);
			setLoading(false);
		});

		return () => unsub?.();
	}, []);

	const displaySessions = sessions ?? PLACEHOLDER_SESSIONS;
	const avg =
		displaySessions.reduce((a, s) => a + s.score, 0) / displaySessions.length;
	const totalTurns = displaySessions.reduce((a, s) => a + s.turns, 0);
	const totalFlags = displaySessions.reduce((a, s) => a + s.flags, 0);
	const maxScore = Math.max(...displaySessions.map((s) => s.score));

	const displaySynthesis =
		synthesis ??
		`Strong week overall (avg ${(avg * 100).toFixed(0)}%). ` +
			(totalFlags > 3
				? `${totalFlags} total flags — Tribunal confidence likely drifted on high-flag days. `
				: "Tribunal quality gates clean across most sessions. ") +
			"Consider running Echo regression against your lowest-scoring session to isolate the quality dip.";

	return (
		<button
			type="button"
			style={{
				position: "fixed",
				inset: 0,
				background: `${C.bg0}ee`,
				backdropFilter: "blur(8px)",
				zIndex: 200,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				animation: "fadeIn 0.2s ease",
				border: "none",
				padding: 0,
				cursor: "default",
			}}
			onClick={onClose}
		>
			<div
				role="dialog"
				style={{
					background: C.bg1,
					border: `1px solid ${C.borderAccent}`,
					borderRadius: 14,
					width: 500,
					maxWidth: "90vw",
					padding: 26,
					boxShadow: `0 0 60px ${C.pink}22, 0 24px 48px #0009`,
				}}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginBottom: 22,
					}}
				>
					<div>
						<div
							style={{
								fontSize: 13,
								color: C.pink,
								fontWeight: 700,
								letterSpacing: "0.1em",
								fontFamily: "monospace",
								textTransform: "uppercase",
							}}
						>
							Weekly Review
						</div>
						<div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
							{new Date(Date.now() - 6 * 86400000).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
							})}
							{" – "}
							{new Date().toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								year: "numeric",
							})}
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							color: C.textMuted,
							fontSize: 18,
							padding: "2px 8px",
							borderRadius: 4,
							transition: "color 0.15s",
						}}
						onMouseEnter={(e) => (e.target.style.color = C.textPrimary)}
						onMouseLeave={(e) => (e.target.style.color = C.textMuted)}
					>
						✕
					</button>
				</div>

				{loading ? (
					<div
						style={{
							textAlign: "center",
							padding: 40,
							color: C.textMuted,
							fontSize: 12,
						}}
					>
						Loading session data…
					</div>
				) : (
					<>
						{/* Summary stats */}
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(3, 1fr)",
								gap: 10,
								marginBottom: 20,
							}}
						>
							{[
								{
									label: "Avg Score",
									value: avg.toFixed(2),
									color: scoreColor(avg),
								},
								{ label: "Total Turns", value: totalTurns, color: C.cyan },
								{
									label: "Flags",
									value: totalFlags,
									color: totalFlags > 3 ? C.red : C.yellow,
								},
							].map((stat) => (
								<div
									key={stat.label}
									style={{
										background: C.bg2,
										borderRadius: 8,
										padding: "10px 12px",
										border: `1px solid ${C.border}`,
									}}
								>
									<div
										style={{
											fontSize: 20,
											fontWeight: 700,
											color: stat.color,
											fontFamily: "monospace",
										}}
									>
										{stat.value}
									</div>
									<div
										style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}
									>
										{stat.label}
									</div>
								</div>
							))}
						</div>

						{/* Per-day session rows */}
						<div style={{ marginBottom: 18 }}>
							{displaySessions.map((session) => (
								<div
									key={session.date}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										padding: "6px 10px",
										borderRadius: 6,
										marginBottom: 3,
										background:
											session.score === maxScore
												? `${C.green}0a`
												: "transparent",
										border: `1px solid ${session.score === maxScore ? `${C.green}22` : "transparent"}`,
									}}
								>
									<span
										style={{
											width: 90,
											fontSize: 10,
											color: C.textMuted,
											fontFamily: "monospace",
											flexShrink: 0,
										}}
									>
										{session.date}
									</span>
									<MiniBar
										value={session.score}
										color={scoreColor(session.score)}
									/>
									<span
										style={{
											fontSize: 10,
											color: C.textMuted,
											fontFamily: "monospace",
											flexShrink: 0,
											width: 28,
										}}
									>
										{session.turns}t
									</span>
									{session.flags > 0 && (
										<span
											style={{
												fontSize: 9,
												color: C.yellow,
												background: `${C.yellow}15`,
												padding: "1px 6px",
												borderRadius: 3,
												fontFamily: "monospace",
												flexShrink: 0,
											}}
										>
											⚑ {session.flags}
										</span>
									)}
								</div>
							))}
						</div>

						{/* Synthesis blurb */}
						<div
							style={{
								background: C.bg2,
								borderRadius: 8,
								padding: 14,
								border: `1px solid ${C.border}`,
								fontSize: 11,
								color: C.textSecondary,
								lineHeight: 1.7,
								fontStyle: "italic",
							}}
						>
							"{displaySynthesis}"
						</div>

						{/* Quick-action buttons */}
						<div
							style={{
								marginTop: 16,
								display: "flex",
								gap: 8,
								justifyContent: "flex-end",
							}}
						>
							<ActionBtn
								label="Run Echo Regression"
								color={C.cyan}
								onClick={() => window.onlooker.plugins.run("echo", "run", [])}
							/>
							<ActionBtn
								label="Counsel Synthesis"
								color={C.pink}
								onClick={() =>
									window.onlooker.plugins.run("counsel", "weekly", [])
								}
							/>
						</div>
					</>
				)}
			</div>
		</button>
	);
}

function ActionBtn({ label, color, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				fontSize: 10,
				padding: "6px 12px",
				borderRadius: 6,
				border: `1px solid ${color}44`,
				background: `${color}11`,
				color,
				cursor: "pointer",
				fontFamily: "monospace",
				letterSpacing: "0.05em",
				transition: "all 0.15s",
			}}
			onMouseEnter={(e) => (e.currentTarget.style.background = `${color}22`)}
			onMouseLeave={(e) => (e.currentTarget.style.background = `${color}11`)}
		>
			{label}
		</button>
	);
}
