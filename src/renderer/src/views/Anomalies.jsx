// Anomaly Detection — statistical outlier sessions surfaced proactively.
// Uses rolling 30-day baseline with σ-based thresholds. No LLM needed.

import { useMemo, useState } from "react";
import { useCostData } from "../hooks/useOnlooker.js";

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
	purple: "#a78bfa",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

function fmtCost(n) {
	if (n == null || Number.isNaN(n)) return "—";
	if (n < 0.005) return "<$0.01";
	return `$${n.toFixed(2)}`;
}

// Compute mean and standard deviation
function stats(values) {
	if (values.length < 2) return { mean: 0, std: 0 };
	const mean = values.reduce((s, v) => s + v, 0) / values.length;
	const variance =
		values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
	return { mean, std: Math.sqrt(variance) };
}

// Detect anomalies across sessions using σ-based thresholds
function detectAnomalies(sessions, costRecords) {
	if (sessions.length < 10)
		return { anomalies: [], baseline: null, reason: "insufficient" };

	// Build per-session cost map
	const costBySession = {};
	for (const r of costRecords) {
		const sid = r.session_id || "unknown";
		costBySession[sid] = (costBySession[sid] ?? 0) + r.estimated_cost_usd;
	}

	// Compute baselines
	const costs = sessions
		.map((s) => costBySession[s.id] ?? 0)
		.filter((c) => c > 0);
	const scores = sessions
		.filter((s) => s.avgScore != null)
		.map((s) => s.avgScore);
	const wardenCounts = sessions.map(
		(s) =>
			(s.events ?? []).filter(
				(e) => e.plugin === "warden" && e.status === "block",
			).length,
	);
	const durations = sessions
		.filter((s) => s.start && s.end)
		.map((s) => (new Date(s.end) - new Date(s.start)) / 60000);
	const frictionScores = sessions
		.filter((s) => s.friction != null)
		.map((s) => s.friction.score);

	const costStats = stats(costs);
	const scoreStats = stats(scores);
	const wardenStats = stats(wardenCounts);
	const durationStats = stats(durations);
	const frictionStats = stats(frictionScores);

	const baseline = {
		costStats,
		scoreStats,
		wardenStats,
		durationStats,
		frictionStats,
	};
	const anomalies = [];

	for (const session of sessions) {
		const signals = [];
		const sessionCost = costBySession[session.id] ?? 0;

		// Cost > 3σ
		if (costStats.std > 0 && sessionCost > costStats.mean + 3 * costStats.std) {
			signals.push({
				signal: "cost",
				label: `Cost ${fmtCost(sessionCost)} is ${((sessionCost - costStats.mean) / costStats.std).toFixed(1)}σ above baseline`,
				severity: "high",
				value: sessionCost,
				threshold: costStats.mean + 3 * costStats.std,
			});
		}

		// Score < 2σ below baseline
		if (
			scoreStats.std > 0 &&
			session.avgScore != null &&
			session.avgScore < scoreStats.mean - 2 * scoreStats.std
		) {
			signals.push({
				signal: "score",
				label: `Quality ${session.avgScore.toFixed(2)} is ${((scoreStats.mean - session.avgScore) / scoreStats.std).toFixed(1)}σ below baseline`,
				severity: "high",
				value: session.avgScore,
				threshold: scoreStats.mean - 2 * scoreStats.std,
			});
		}

		// Warden > 3σ
		const wardenCount = (session.events ?? []).filter(
			(e) => e.plugin === "warden" && e.status === "block",
		).length;
		if (
			wardenStats.std > 0 &&
			wardenCount > wardenStats.mean + 3 * wardenStats.std
		) {
			signals.push({
				signal: "warden",
				label: `${wardenCount} Warden blocks is ${((wardenCount - wardenStats.mean) / wardenStats.std).toFixed(1)}σ above baseline`,
				severity: "medium",
				value: wardenCount,
				threshold: wardenStats.mean + 3 * wardenStats.std,
			});
		}

		// Duration > 3σ
		if (session.start && session.end && durationStats.std > 0) {
			const dur = (new Date(session.end) - new Date(session.start)) / 60000;
			if (dur > durationStats.mean + 3 * durationStats.std) {
				signals.push({
					signal: "duration",
					label: `${Math.round(dur)}m duration is ${((dur - durationStats.mean) / durationStats.std).toFixed(1)}σ above baseline`,
					severity: "medium",
					value: dur,
					threshold: durationStats.mean + 3 * durationStats.std,
				});
			}
		}

		// Friction > 2σ
		if (
			session.friction != null &&
			frictionStats.std > 0 &&
			session.friction.score > frictionStats.mean + 2 * frictionStats.std
		) {
			signals.push({
				signal: "friction",
				label: `Friction ${session.friction.score.toFixed(2)} is ${((session.friction.score - frictionStats.mean) / frictionStats.std).toFixed(1)}σ above baseline`,
				severity: "high",
				value: session.friction.score,
				threshold: frictionStats.mean + 2 * frictionStats.std,
			});
		}

		if (signals.length > 0) {
			anomalies.push({
				session,
				signals,
				severity: signals.some((s) => s.severity === "high")
					? "high"
					: "medium",
				signalCount: signals.length,
			});
		}
	}

	return {
		anomalies: anomalies.sort((a, b) => b.signalCount - a.signalCount),
		baseline,
		reason: null,
	};
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

function sevColor(sev) {
	return sev === "high" ? C.red : C.yellow;
}

function AnomalyRow({ anomaly }) {
	const [expanded, setExpanded] = useState(false);
	const { session, signals, severity } = anomaly;
	const color = sevColor(severity);

	return (
		<button
			type="button"
			onClick={() => setExpanded((e) => !e)}
			style={{
				display: "block",
				width: "100%",
				textAlign: "left",
				border: "none",
				background: "none",
				font: "inherit",
				color: "inherit",
				padding: "10px 14px",
				cursor: "pointer",
				borderBottom: `1px solid ${C.border}`,
				transition: "background 0.1s",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.background = C.bg2;
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "transparent";
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<span
					style={{
						fontSize: 9,
						fontWeight: 700,
						fontFamily: "monospace",
						padding: "2px 6px",
						borderRadius: 4,
						background: `${color}22`,
						color,
						border: `1px solid ${color}44`,
						textTransform: "uppercase",
					}}
				>
					{severity}
				</span>
				<span
					style={{
						fontSize: 10,
						color: C.textSecondary,
						fontFamily: "monospace",
					}}
				>
					{session.id?.slice(0, 16)}…
				</span>
				<span style={{ fontSize: 10, color: C.textMuted }}>
					{session.start
						? new Date(session.start).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							})
						: ""}
				</span>
				<div style={{ flex: 1 }} />
				<div style={{ display: "flex", gap: 4 }}>
					{signals.map((s) => (
						<span
							key={s.signal}
							title={s.label}
							style={{
								fontSize: 8,
								fontFamily: "monospace",
								padding: "1px 4px",
								borderRadius: 3,
								background: `${sevColor(s.severity)}15`,
								color: sevColor(s.severity),
							}}
						>
							{s.signal}
						</span>
					))}
				</div>
			</div>

			{expanded && (
				<div
					style={{
						marginTop: 8,
						padding: "8px 10px",
						background: C.bg0,
						borderRadius: 5,
						border: `1px solid ${C.border}`,
					}}
				>
					{signals.map((s) => (
						<div
							key={s.signal}
							style={{
								fontSize: 10,
								color: C.textSecondary,
								marginBottom: 4,
								display: "flex",
								alignItems: "center",
								gap: 6,
							}}
						>
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: sevColor(s.severity),
									flexShrink: 0,
								}}
							/>
							{s.label}
						</div>
					))}
					<div
						style={{
							fontSize: 9,
							color: C.textMuted,
							marginTop: 6,
							fontFamily: "monospace",
						}}
					>
						{session.events?.length ?? 0} events · {session.blocks ?? 0} blocks
						· score {session.avgScore?.toFixed(2) ?? "—"}
					</div>
				</div>
			)}
		</button>
	);
}

export default function Anomalies({ sessions }) {
	const { records: costRecords } = useCostData();

	const { anomalies, baseline, reason } = useMemo(
		() => detectAnomalies(sessions, costRecords),
		[sessions, costRecords],
	);

	const highCount = anomalies.filter((a) => a.severity === "high").length;
	const mediumCount = anomalies.filter((a) => a.severity === "medium").length;

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
					Anomaly Detection
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
					pure statistics · no LLM
				</span>
			</div>

			{reason === "insufficient" ? (
				<div
					style={{
						textAlign: "center",
						padding: "60px 20px",
						color: C.textMuted,
					}}
				>
					<div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>◇</div>
					<div style={{ fontSize: 13, marginBottom: 8 }}>
						Not enough data yet
					</div>
					<div style={{ fontSize: 11 }}>
						Anomaly detection needs at least 10 sessions to establish a
						baseline. Currently have {sessions.length} session
						{sessions.length !== 1 ? "s" : ""}.
					</div>
				</div>
			) : (
				<>
					{/* Summary cards */}
					<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
						<StatCard
							label="Anomalous Sessions"
							value={anomalies.length}
							color={anomalies.length > 0 ? C.yellow : C.green}
						/>
						<StatCard
							label="High Severity"
							value={highCount}
							color={highCount > 0 ? C.red : C.green}
						/>
						<StatCard
							label="Medium Severity"
							value={mediumCount}
							color={mediumCount > 0 ? C.yellow : C.green}
						/>
						<StatCard label="Baseline Sessions" value={sessions.length} />
					</div>

					{/* Baseline summary */}
					{baseline && (
						<div
							style={{
								background: C.bg2,
								borderRadius: 10,
								padding: "14px 16px",
								border: `1px solid ${C.border}`,
								marginBottom: 16,
								display: "flex",
								gap: 20,
								flexWrap: "wrap",
							}}
						>
							<div
								style={{
									fontSize: 10,
									color: C.textMuted,
									letterSpacing: "0.07em",
									textTransform: "uppercase",
									fontFamily: "monospace",
									width: "100%",
									marginBottom: 4,
								}}
							>
								30-Day Baseline
							</div>
							{[
								{ label: "Avg Cost", value: fmtCost(baseline.costStats.mean) },
								{
									label: "Avg Score",
									value:
										baseline.scoreStats.mean > 0
											? baseline.scoreStats.mean.toFixed(2)
											: "—",
								},
								{
									label: "Avg Friction",
									value:
										baseline.frictionStats.mean > 0
											? baseline.frictionStats.mean.toFixed(2)
											: "—",
								},
								{
									label: "Avg Duration",
									value:
										baseline.durationStats.mean > 0
											? `${Math.round(baseline.durationStats.mean)}m`
											: "—",
								},
							].map((b) => (
								<div key={b.label} style={{ fontSize: 10 }}>
									<span style={{ color: C.textMuted }}>{b.label}: </span>
									<span
										style={{ color: C.textSecondary, fontFamily: "monospace" }}
									>
										{b.value}
									</span>
								</div>
							))}
						</div>
					)}

					{/* Anomaly list */}
					{anomalies.length === 0 ? (
						<div
							style={{
								textAlign: "center",
								padding: "40px 0",
								color: C.green,
								fontSize: 12,
							}}
						>
							No anomalies detected — all sessions are within normal range
						</div>
					) : (
						<div
							style={{
								background: C.bg2,
								borderRadius: 10,
								border: `1px solid ${C.border}`,
								overflow: "hidden",
							}}
						>
							<div
								style={{
									padding: "10px 14px",
									borderBottom: `1px solid ${C.border}`,
									fontSize: 10,
									color: C.textMuted,
									letterSpacing: "0.07em",
									textTransform: "uppercase",
									fontFamily: "monospace",
								}}
							>
								Anomalous Sessions ({anomalies.length})
							</div>
							{anomalies.map((a) => (
								<AnomalyRow key={a.session.id} anomaly={a} />
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
