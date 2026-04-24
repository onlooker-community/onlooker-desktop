// Synthesis Layer — causal timeline connecting instruction changes to agent behavior.
// Correlates Cartographer edits, Echo scores, friction, and cost across time.

import { useMemo, useState } from "react";
import {
	useCostData,
	useInstructionHealth,
	useInstructionWatcher,
} from "../hooks/useOnlooker.js";

const C = {
	bg0: "#0b0d14",
	bg1: "#12151f",
	bg2: "#181c2a",
	bg3: "#1f2335",
	border: "#252a3d",
	pink: "#f472b6",
	cyan: "#22d3ee",
	yellow: "#fbbf24",
	green: "#4ade80",
	red: "#f87171",
	sky: "#38bdf8",
	purple: "#a78bfa",
	emerald: "#34d399",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

function fmtCost(n) {
	if (n == null || Number.isNaN(n)) return "—";
	if (n < 0.005) return "<$0.01";
	return `$${n.toFixed(2)}`;
}

function formatDay(ts) {
	return new Date(ts).toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
}

// ── Build unified timeline from all data sources ────────────────────────────

function buildTimeline(sessions, costRecords, health, instructionChanges) {
	const events = [];

	// Group sessions by day
	const sessionsByDay = {};
	for (const s of sessions) {
		if (!s.start) continue;
		const day = s.start.slice(0, 10);
		if (!sessionsByDay[day]) sessionsByDay[day] = [];
		sessionsByDay[day].push(s);
	}

	// Session metrics per day
	for (const [day, daySessions] of Object.entries(sessionsByDay)) {
		const avgFriction =
			daySessions.filter((s) => s.friction != null).length > 0
				? daySessions
						.filter((s) => s.friction != null)
						.reduce((s, x) => s + x.friction.score, 0) /
					daySessions.filter((s) => s.friction != null).length
				: null;

		const avgScore =
			daySessions.filter((s) => s.avgScore != null).length > 0
				? daySessions
						.filter((s) => s.avgScore != null)
						.reduce((s, x) => s + x.avgScore, 0) /
					daySessions.filter((s) => s.avgScore != null).length
				: null;

		events.push({
			ts: `${day}T12:00:00Z`,
			day,
			stream: "sessions",
			label: `${daySessions.length} session${daySessions.length !== 1 ? "s" : ""}`,
			value: daySessions.length,
			color: C.textSecondary,
		});

		if (avgFriction != null) {
			events.push({
				ts: `${day}T12:00:00Z`,
				day,
				stream: "friction",
				label: `Friction: ${avgFriction.toFixed(2)}`,
				value: avgFriction,
				delta: null,
				color:
					avgFriction < 0.3 ? C.green : avgFriction < 0.6 ? C.yellow : C.red,
			});
		}

		if (avgScore != null) {
			events.push({
				ts: `${day}T12:00:00Z`,
				day,
				stream: "quality",
				label: `Quality: ${avgScore.toFixed(2)}`,
				value: avgScore,
				color: avgScore >= 0.85 ? C.green : avgScore >= 0.7 ? C.yellow : C.red,
			});
		}
	}

	// Cost per day
	const costByDay = {};
	for (const r of costRecords) {
		const day = r.ts.slice(0, 10);
		costByDay[day] = (costByDay[day] ?? 0) + r.estimated_cost_usd;
	}
	for (const [day, cost] of Object.entries(costByDay)) {
		events.push({
			ts: `${day}T12:00:00Z`,
			day,
			stream: "cost",
			label: `Cost: ${fmtCost(cost)}`,
			value: cost,
			color: C.green,
		});
	}

	// Instruction changes
	for (const ch of instructionChanges) {
		const day = ch.ts?.slice(0, 10) ?? "";
		events.push({
			ts: ch.ts,
			day,
			stream: "instructions",
			label: `${ch.type === "add" ? "New" : "Edit"}: ${ch.file}`,
			detail: `+${ch.added} -${ch.removed}`,
			color: C.sky,
		});
	}

	// Cartographer audit if available
	if (health?.last_audit_at) {
		const day = health.last_audit_at.slice(0, 10);
		const totalIssues =
			(health.issue_count?.high ?? 0) +
			(health.issue_count?.medium ?? 0) +
			(health.issue_count?.low ?? 0);
		events.push({
			ts: health.last_audit_at,
			day,
			stream: "instructions",
			label: `Audit: ${Math.round((health.health_score ?? 0) * 100)}% health`,
			detail:
				totalIssues > 0
					? `${totalIssues} issue${totalIssues !== 1 ? "s" : ""}`
					: "clean",
			color: (health.health_score ?? 1) >= 0.85 ? C.green : C.yellow,
		});
	}

	// Sort by day
	events.sort((a, b) => a.day.localeCompare(b.day));
	return events;
}

// ── Stream colors and labels ────────────────────────────────────────────────

const STREAMS = [
	{ id: "instructions", label: "Instructions", color: C.sky, icon: "⬡" },
	{ id: "quality", label: "Quality", color: C.pink, icon: "▦" },
	{ id: "friction", label: "Friction", color: C.yellow, icon: "◇" },
	{ id: "cost", label: "Cost", color: C.green, icon: "▦" },
	{ id: "sessions", label: "Sessions", color: C.textSecondary, icon: "◎" },
];

// ── Causal connections ──────────────────────────────────────────────────────
// Simple heuristic: if an instruction change happens on day N and friction/
// quality changes on day N+1 or N+2, draw a connection.

function findCausalLinks(timeline) {
	const links = [];
	const instructionDays = new Set(
		timeline
			.filter((e) => e.stream === "instructions" && e.label.startsWith("Edit"))
			.map((e) => e.day),
	);

	for (const day of instructionDays) {
		const nextDay = new Date(`${day}T12:00:00Z`);
		nextDay.setDate(nextDay.getDate() + 1);
		const nd1 = nextDay.toISOString().slice(0, 10);
		nextDay.setDate(nextDay.getDate() + 1);
		const nd2 = nextDay.toISOString().slice(0, 10);

		// Look for friction/quality changes on adjacent days
		for (const e of timeline) {
			if (
				(e.day === nd1 || e.day === nd2) &&
				(e.stream === "friction" || e.stream === "quality")
			) {
				links.push({ from: day, to: e.day, stream: e.stream, label: e.label });
			}
		}
	}

	return links;
}

function TimelineEvent({ event, selected, onSelect }) {
	const isSelected = selected === event;
	const streamDef = STREAMS.find((s) => s.id === event.stream);

	return (
		<button
			type="button"
			onClick={() => onSelect(isSelected ? null : event)}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				width: "100%",
				padding: "4px 8px",
				borderRadius: 4,
				border: "none",
				font: "inherit",
				color: "inherit",
				textAlign: "left",
				background: isSelected ? `${event.color}15` : "transparent",
				cursor: "pointer",
				transition: "background 0.1s",
			}}
		>
			<div
				style={{
					width: 6,
					height: 6,
					borderRadius: "50%",
					background: event.color,
					flexShrink: 0,
				}}
			/>
			<span
				style={{
					fontSize: 10,
					color: event.color,
					fontFamily: "monospace",
					width: 16,
				}}
			>
				{streamDef?.icon ?? "·"}
			</span>
			<span
				style={{
					fontSize: 10,
					color: C.textSecondary,
					flex: 1,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{event.label}
			</span>
			{event.detail && (
				<span
					style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}
				>
					{event.detail}
				</span>
			)}
		</button>
	);
}

export default function SynthesisLayer({ sessions }) {
	const [selected, setSelected] = useState(null);
	const { records: costRecords } = useCostData();
	const health = useInstructionHealth();
	const { changes: instructionChanges } = useInstructionWatcher(
		health?.cwd ? [health.cwd] : [],
	);

	const timeline = useMemo(
		() => buildTimeline(sessions, costRecords, health, instructionChanges),
		[sessions, costRecords, health, instructionChanges],
	);

	const causalLinks = useMemo(() => findCausalLinks(timeline), [timeline]);

	// Group timeline by day
	const grouped = useMemo(() => {
		const days = {};
		for (const e of timeline) {
			if (!days[e.day]) days[e.day] = [];
			days[e.day].push(e);
		}
		return Object.entries(days)
			.sort(([a], [b]) => b.localeCompare(a)) // newest first
			.slice(0, 30);
	}, [timeline]);

	return (
		<div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 18,
				}}
			>
				<span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
					Synthesis Layer
				</span>
				<span
					style={{
						fontSize: 9,
						color: C.textMuted,
						fontFamily: "monospace",
						background: C.bg2,
						padding: "3px 8px",
						borderRadius: 4,
						border: `1px solid ${C.border}`,
					}}
				>
					cross-plugin causal view
				</span>
			</div>

			{timeline.length === 0 ? (
				<div
					style={{
						textAlign: "center",
						padding: "60px 20px",
						color: C.textMuted,
					}}
				>
					<div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>⧖</div>
					<div style={{ fontSize: 13, marginBottom: 8 }}>
						No synthesis data yet
					</div>
					<div style={{ fontSize: 11 }}>
						The synthesis layer connects instruction changes to behavior
						changes. It needs session data, cost records, and instruction file
						activity to build the timeline.
					</div>
				</div>
			) : (
				<>
					{/* Stream legend */}
					<div
						style={{
							display: "flex",
							gap: 14,
							marginBottom: 16,
							flexWrap: "wrap",
							padding: "8px 12px",
							background: C.bg2,
							borderRadius: 6,
							border: `1px solid ${C.border}`,
						}}
					>
						{STREAMS.map((s) => (
							<span
								key={s.id}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									fontSize: 9,
									color: C.textMuted,
								}}
							>
								<div
									style={{
										width: 6,
										height: 6,
										borderRadius: "50%",
										background: s.color,
									}}
								/>
								{s.label}
							</span>
						))}
						{causalLinks.length > 0 && (
							<span
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									fontSize: 9,
									color: C.textMuted,
									marginLeft: "auto",
								}}
							>
								<svg width="16" height="8">
									<title>Causal link indicator</title>
									<line
										x1="0"
										y1="4"
										x2="16"
										y2="4"
										stroke={C.pink}
										strokeWidth="1.5"
										strokeDasharray="3,2"
									/>
								</svg>
								{causalLinks.length} causal link
								{causalLinks.length !== 1 ? "s" : ""} detected
							</span>
						)}
					</div>

					{/* Timeline */}
					{grouped.map(([day, dayEvents]) => {
						const hasLink = causalLinks.some(
							(l) => l.from === day || l.to === day,
						);
						const linksForDay = causalLinks.filter((l) => l.to === day);

						return (
							<div
								key={day}
								style={{
									marginBottom: 12,
									borderLeft: `2px solid ${hasLink ? C.pink : C.border}`,
									paddingLeft: 14,
								}}
							>
								{/* Day header */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										marginBottom: 6,
									}}
								>
									<div
										style={{
											width: 8,
											height: 8,
											borderRadius: "50%",
											background: hasLink ? C.pink : C.border,
											marginLeft: -19,
										}}
									/>
									<span
										style={{
											fontSize: 11,
											fontWeight: 600,
											color: C.textPrimary,
										}}
									>
										{formatDay(`${day}T12:00:00`)}
									</span>
									<span
										style={{
											fontSize: 9,
											color: C.textMuted,
											fontFamily: "monospace",
										}}
									>
										{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
									</span>
								</div>

								{/* Causal annotations */}
								{linksForDay.map((link) => (
									<div
										key={`${link.from}-${link.to}-${link.stream}`}
										style={{
											fontSize: 9,
											color: C.pink,
											fontFamily: "monospace",
											padding: "2px 8px",
											marginBottom: 4,
											background: `${C.pink}0a`,
											borderRadius: 3,
											borderLeft: `2px solid ${C.pink}`,
										}}
									>
										← Possibly caused by instruction edit on{" "}
										{formatDay(`${link.from}T12:00:00`)}: {link.label}
									</div>
								))}

								{/* Events for this day */}
								<div
									style={{
										background: C.bg2,
										borderRadius: 8,
										border: `1px solid ${C.border}`,
										overflow: "hidden",
									}}
								>
									{dayEvents.map((e) => (
										<TimelineEvent
											key={`${e.stream}-${e.ts ?? ""}`}
											event={e}
											selected={selected}
											onSelect={setSelected}
										/>
									))}
								</div>
							</div>
						);
					})}
				</>
			)}
		</div>
	);
}
