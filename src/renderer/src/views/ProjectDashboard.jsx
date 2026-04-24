// Project Dashboard — all Onlooker data scoped to a working directory.
// Shows sessions, cost, instruction health, dead ends, and file attention for one project.

import { useMemo, useState } from "react";
import {
	useCostData,
	useDeadEnds,
	useInstructionHealth,
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
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

function fmtCost(n) {
	if (n == null || Number.isNaN(n)) return "—";
	if (n < 0.005) return "<$0.01";
	return `$${n.toFixed(2)}`;
}

function scoreColor(s) {
	if (s == null) return C.textMuted;
	if (s >= 0.85) return C.green;
	if (s >= 0.7) return C.yellow;
	return C.red;
}

function frictionColor(s) {
	if (s == null) return C.textMuted;
	if (s < 0.3) return C.green;
	if (s < 0.6) return C.yellow;
	return C.red;
}

function StatCard({ label, value, color }) {
	return (
		<div
			style={{
				background: C.bg2,
				borderRadius: 10,
				padding: "14px 16px",
				border: `1px solid ${C.border}`,
				flex: 1,
				minWidth: 0,
			}}
		>
			<div
				style={{
					fontSize: 22,
					fontWeight: 700,
					lineHeight: 1,
					marginBottom: 4,
					color: color ?? C.textPrimary,
					fontFamily: "'JetBrains Mono', monospace",
				}}
			>
				{value}
			</div>
			<div style={{ fontSize: 11, color: C.textSecondary }}>{label}</div>
		</div>
	);
}

function shortenCwd(cwd) {
	if (!cwd) return "(unknown)";
	const parts = cwd.split("/");
	return parts.length > 3 ? `.../${parts.slice(-2).join("/")}` : cwd;
}

// Project picker — lists all distinct cwds
function ProjectPicker({ projects, selected, onSelect }) {
	return (
		<div
			style={{
				width: 200,
				flexShrink: 0,
				borderRight: `1px solid ${C.border}`,
				display: "flex",
				flexDirection: "column",
				background: C.bg1,
			}}
		>
			<div
				style={{
					padding: "14px 14px 10px",
					borderBottom: `1px solid ${C.border}`,
					fontSize: 12,
					fontWeight: 600,
					color: C.textPrimary,
				}}
			>
				Projects
			</div>
			<div style={{ flex: 1, overflowY: "auto" }}>
				{projects.map((p) => {
					const isSelected = selected === p.cwd;
					return (
						<button
							key={p.cwd}
							type="button"
							onClick={() => onSelect(p.cwd)}
							style={{
								display: "block",
								width: "100%",
								textAlign: "left",
								padding: "8px 14px",
								cursor: "pointer",
								background: isSelected ? `${C.pink}0f` : "transparent",
								borderLeft: `2px solid ${isSelected ? C.pink : "transparent"}`,
								borderTop: "none",
								borderRight: "none",
								borderBottom: "none",
								font: "inherit",
							}}
							onMouseEnter={(e) => {
								if (!isSelected) e.currentTarget.style.background = C.bg2;
							}}
							onMouseLeave={(e) => {
								if (!isSelected)
									e.currentTarget.style.background = isSelected
										? `${C.pink}0f`
										: "transparent";
							}}
						>
							<div
								style={{
									fontSize: 10,
									color: C.textPrimary,
									fontFamily: "monospace",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{shortenCwd(p.cwd)}
							</div>
							<div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>
								{p.sessionCount} session{p.sessionCount !== 1 ? "s" : ""}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

export default function ProjectDashboard({ sessions }) {
	const [selectedCwd, setSelectedCwd] = useState(null);
	const { records: costRecords } = useCostData();
	const { records: deadEndRecords } = useDeadEnds();
	const health = useInstructionHealth();

	// Build project list from session cwds
	const projects = useMemo(() => {
		const cwdMap = {};
		for (const s of sessions) {
			// Extract cwd from session events
			const cwdEvent = (s.events ?? []).find(
				(e) => e.meta?.cwd || e.meta?.working_directory,
			);
			const cwd =
				cwdEvent?.meta?.cwd ??
				cwdEvent?.meta?.working_directory ??
				health?.cwd ??
				"(unknown)";
			if (!cwdMap[cwd]) cwdMap[cwd] = { cwd, sessionCount: 0, sessions: [] };
			cwdMap[cwd].sessionCount++;
			cwdMap[cwd].sessions.push(s);
		}
		return Object.values(cwdMap).sort(
			(a, b) => b.sessionCount - a.sessionCount,
		);
	}, [sessions, health?.cwd]);

	// Auto-select first project
	const activeCwd = selectedCwd ?? projects[0]?.cwd ?? null;
	const project = projects.find((p) => p.cwd === activeCwd);
	const projectSessions = project?.sessions ?? [];

	// Project-scoped metrics
	const totalCost = useMemo(() => {
		const sessionIds = new Set(projectSessions.map((s) => s.id));
		return costRecords
			.filter((r) => sessionIds.has(r.session_id))
			.reduce((s, r) => s + r.estimated_cost_usd, 0);
	}, [projectSessions, costRecords]);

	const avgScore = useMemo(() => {
		const scored = projectSessions.filter((s) => s.avgScore != null);
		return scored.length > 0
			? scored.reduce((s, f) => s + f.avgScore, 0) / scored.length
			: null;
	}, [projectSessions]);

	const avgFriction = useMemo(() => {
		const f = projectSessions.filter((s) => s.friction != null);
		return f.length > 0
			? f.reduce((s, x) => s + x.friction.score, 0) / f.length
			: null;
	}, [projectSessions]);

	const projectDeadEnds = useMemo(
		() => deadEndRecords.filter((r) => r.cwd === activeCwd),
		[deadEndRecords, activeCwd],
	);

	return (
		<div style={{ display: "flex", height: "100%", minHeight: 0 }}>
			<ProjectPicker
				projects={projects}
				selected={activeCwd}
				onSelect={setSelectedCwd}
			/>

			<div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
				{!project ? (
					<div
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: C.textMuted,
							fontSize: 13,
							height: "100%",
						}}
					>
						No projects found — sessions will appear once agent activity is
						detected
					</div>
				) : (
					<>
						{/* Header */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 18,
							}}
						>
							<span
								style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}
							>
								Project Dashboard
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
								{shortenCwd(activeCwd)}
							</span>
						</div>

						{/* Summary cards */}
						<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
							<StatCard label="Sessions" value={projectSessions.length} />
							<StatCard
								label="Total Cost"
								value={fmtCost(totalCost)}
								color={
									totalCost > 5 ? C.red : totalCost > 1 ? C.yellow : C.green
								}
							/>
							<StatCard
								label="Avg Score"
								value={avgScore?.toFixed(2) ?? "—"}
								color={scoreColor(avgScore)}
							/>
							<StatCard
								label="Avg Friction"
								value={avgFriction?.toFixed(2) ?? "—"}
								color={frictionColor(avgFriction)}
							/>
						</div>

						{/* Instruction health */}
						{health && (
							<div
								style={{
									background: C.bg2,
									borderRadius: 10,
									padding: "14px 16px",
									border: `1px solid ${C.border}`,
									marginBottom: 16,
								}}
							>
								<div
									style={{
										fontSize: 10,
										color: C.textMuted,
										letterSpacing: "0.07em",
										textTransform: "uppercase",
										fontFamily: "monospace",
										marginBottom: 8,
									}}
								>
									Instruction Health
								</div>
								<div style={{ display: "flex", gap: 16, alignItems: "center" }}>
									<span
										style={{
											fontSize: 20,
											fontWeight: 700,
											fontFamily: "monospace",
											color:
												health.health_score >= 0.85
													? C.green
													: health.health_score >= 0.7
														? C.yellow
														: C.red,
										}}
									>
										{Math.round((health.health_score ?? 0) * 100)}%
									</span>
									<div style={{ fontSize: 10, color: C.textMuted }}>
										{health.issue_count?.high ?? 0} high ·
										{health.issue_count?.medium ?? 0} medium ·
										{health.issue_count?.low ?? 0} low
									</div>
									{health.last_audit_at && (
										<span
											style={{
												fontSize: 9,
												color: C.textMuted,
												fontFamily: "monospace",
											}}
										>
											audited{" "}
											{new Date(health.last_audit_at).toLocaleDateString()}
										</span>
									)}
								</div>
							</div>
						)}

						{/* Session timeline */}
						<div
							style={{
								background: C.bg2,
								borderRadius: 10,
								padding: "16px 18px",
								border: `1px solid ${C.border}`,
								marginBottom: 16,
							}}
						>
							<div
								style={{
									fontSize: 10,
									color: C.textMuted,
									letterSpacing: "0.07em",
									textTransform: "uppercase",
									fontFamily: "monospace",
									marginBottom: 12,
								}}
							>
								Recent Sessions
							</div>
							{projectSessions.slice(0, 10).map((s) => (
								<div
									key={s.id}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 10,
										padding: "6px 0",
										borderBottom: `1px solid ${C.border}`,
									}}
								>
									<span
										style={{
											fontSize: 9,
											color: C.textMuted,
											fontFamily: "monospace",
											width: 80,
										}}
									>
										{s.start
											? new Date(s.start).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})
											: "—"}
									</span>
									<span
										style={{
											fontSize: 10,
											color: scoreColor(s.avgScore),
											fontFamily: "monospace",
											width: 40,
										}}
									>
										{s.avgScore?.toFixed(2) ?? "—"}
									</span>
									{s.friction != null && (
										<span
											style={{
												fontSize: 9,
												color: frictionColor(s.friction.score),
												fontFamily: "monospace",
												width: 40,
											}}
										>
											F{s.friction.score.toFixed(2)}
										</span>
									)}
									<span style={{ fontSize: 9, color: C.textMuted, flex: 1 }}>
										{s.events?.length ?? 0} events
									</span>
									{s.blocks > 0 && (
										<span style={{ fontSize: 9, color: C.red }}>
											⊘ {s.blocks}
										</span>
									)}
								</div>
							))}
						</div>

						{/* Dead ends for this project */}
						{projectDeadEnds.length > 0 && (
							<div
								style={{
									background: C.bg2,
									borderRadius: 10,
									padding: "16px 18px",
									border: `1px solid ${C.border}`,
									marginBottom: 16,
								}}
							>
								<div
									style={{
										fontSize: 10,
										color: C.textMuted,
										letterSpacing: "0.07em",
										textTransform: "uppercase",
										fontFamily: "monospace",
										marginBottom: 12,
									}}
								>
									Dead Ends ({projectDeadEnds.length})
								</div>
								{projectDeadEnds.slice(0, 8).map((de) => (
									<div
										key={`${de.session_id ?? ""}:${de.approach ?? ""}:${de.ts ?? ""}`}
										style={{
											fontSize: 10,
											color: C.textSecondary,
											padding: "4px 0",
											borderBottom: `1px solid ${C.border}`,
										}}
									>
										{de.approach}
									</div>
								))}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
