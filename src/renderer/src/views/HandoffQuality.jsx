// Handoff Quality — measures how well Relay handoffs transfer context.
// Compares handoff docs to next-session Archivist data.

import { useMemo, useState } from "react";
import { useHandoffQuality } from "../hooks/useOnlooker.js";

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
	emerald: "#34d399",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

function qualityColor(score) {
	if (score == null) return C.textMuted;
	if (score >= 80) return C.green;
	if (score >= 50) return C.yellow;
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

function HandoffRow({ handoff }) {
	const [expanded, setExpanded] = useState(false);
	const color = qualityColor(handoff.score);

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
				{/* Score badge */}
				<span
					style={{
						fontSize: 12,
						fontWeight: 700,
						fontFamily: "monospace",
						color,
						width: 36,
						textAlign: "center",
					}}
				>
					{handoff.score}%
				</span>

				{/* Session ID */}
				<span
					style={{
						fontSize: 10,
						color: C.textSecondary,
						fontFamily: "monospace",
					}}
				>
					{handoff.session_id?.slice(0, 14)}…
				</span>

				{/* Timestamp */}
				<span style={{ fontSize: 10, color: C.textMuted }}>
					{handoff.handoff_ts
						? new Date(handoff.handoff_ts).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							})
						: ""}
				</span>

				<div style={{ flex: 1 }} />

				{/* Question stats */}
				<div
					style={{
						display: "flex",
						gap: 8,
						fontSize: 9,
						fontFamily: "monospace",
					}}
				>
					{handoff.resolved > 0 && (
						<span style={{ color: C.green }}>
							✓ {handoff.resolved} resolved
						</span>
					)}
					{handoff.persisted > 0 && (
						<span style={{ color: C.yellow }}>
							↻ {handoff.persisted} persisted
						</span>
					)}
					{handoff.total_questions === 0 && (
						<span style={{ color: C.textMuted }}>no questions</span>
					)}
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
					<div
						style={{
							display: "flex",
							gap: 16,
							fontSize: 10,
							color: C.textSecondary,
						}}
					>
						<span>Total questions: {handoff.total_questions}</span>
						<span>
							Resolved:{" "}
							<span style={{ color: C.green }}>{handoff.resolved}</span>
						</span>
						<span>
							Persisted:{" "}
							<span style={{ color: C.yellow }}>{handoff.persisted}</span>
						</span>
					</div>
					{handoff.next_session_id && (
						<div
							style={{
								fontSize: 9,
								color: C.textMuted,
								marginTop: 4,
								fontFamily: "monospace",
							}}
						>
							Next session: {handoff.next_session_id?.slice(0, 20)}…
						</div>
					)}
					{handoff.cwd && (
						<div
							style={{
								fontSize: 9,
								color: C.textMuted,
								marginTop: 2,
								fontFamily: "monospace",
							}}
						>
							Project: {handoff.cwd}
						</div>
					)}
				</div>
			)}
		</button>
	);
}

// Quality trend sparkline
function QualityTrend({ handoffs }) {
	const points = handoffs
		.filter((h) => h.score != null)
		.slice(0, 20)
		.reverse();

	if (points.length < 2) return null;

	const w = 480,
		h = 56,
		px = 8,
		py = 8;
	const xs = points.map(
		(_, i) => px + (i / (points.length - 1)) * (w - px * 2),
	);
	const ys = points.map((p) => h - py - (p.score / 100) * (h - py * 2));
	const line = xs
		.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`)
		.join(" ");
	const area = `${line} L${xs[xs.length - 1]},${h} L${xs[0]},${h} Z`;

	return (
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
					marginBottom: 10,
				}}
			>
				Quality Trend
			</div>
			<svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
				<title>Quality Trend</title>
				<defs>
					<linearGradient id="hqg" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={C.emerald} stopOpacity="0.25" />
						<stop offset="100%" stopColor={C.emerald} stopOpacity="0" />
					</linearGradient>
				</defs>
				<path d={area} fill="url(#hqg)" />
				<path
					d={line}
					fill="none"
					stroke={C.emerald}
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				{xs.map((x, i) => (
					<circle
						key={`${points[i].session_id ?? i}-${points[i].score}`}
						cx={x}
						cy={ys[i]}
						r={3}
						fill={qualityColor(points[i].score)}
					/>
				))}
			</svg>
		</div>
	);
}

export default function HandoffQuality() {
	const { handoffs, loading } = useHandoffQuality();

	const avgScore = useMemo(() => {
		const scored = handoffs.filter(
			(h) => h.score != null && h.total_questions > 0,
		);
		return scored.length > 0
			? Math.round(scored.reduce((s, h) => s + h.score, 0) / scored.length)
			: null;
	}, [handoffs]);

	const worstCount = handoffs.filter(
		(h) => h.score < 50 && h.total_questions > 0,
	).length;
	const totalResolved = handoffs.reduce((s, h) => s + h.resolved, 0);
	const _totalPersisted = handoffs.reduce((s, h) => s + h.persisted, 0);

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
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
						Handoff Quality
					</span>
					<span
						style={{
							fontSize: 9,
							fontWeight: 700,
							letterSpacing: "0.08em",
							padding: "1px 5px",
							borderRadius: 3,
							border: `1px solid ${C.emerald}44`,
							color: C.emerald,
							background: `${C.emerald}11`,
							fontFamily: "'JetBrains Mono', monospace",
						}}
					>
						RLY
					</span>
				</div>
			</div>

			{loading ? (
				<div
					style={{
						textAlign: "center",
						padding: "40px 0",
						color: C.textMuted,
						fontSize: 12,
					}}
				>
					Loading handoff data...
				</div>
			) : handoffs.length === 0 ? (
				<div
					style={{
						textAlign: "center",
						padding: "60px 20px",
						color: C.textMuted,
					}}
				>
					<div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>⤻</div>
					<div style={{ fontSize: 13, marginBottom: 8 }}>
						No handoffs recorded
					</div>
					<div style={{ fontSize: 11 }}>
						Handoff quality data appears once Relay captures session handoffs.
						Quality is measured by comparing handoff documents to the next
						session's activity.
					</div>
				</div>
			) : (
				<>
					<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
						<StatCard
							label="Avg Quality"
							value={avgScore != null ? `${avgScore}%` : "—"}
							color={qualityColor(avgScore)}
						/>
						<StatCard label="Total Handoffs" value={handoffs.length} />
						<StatCard
							label="Questions Resolved"
							value={totalResolved}
							color={C.green}
						/>
						<StatCard
							label="Low Quality (<50%)"
							value={worstCount}
							color={worstCount > 0 ? C.red : C.green}
						/>
					</div>

					<QualityTrend handoffs={handoffs} />

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
							Handoff History
						</div>
						{handoffs.map((h) => (
							<HandoffRow key={`${h.session_id}-${h.handoff_ts}`} handoff={h} />
						))}
					</div>
				</>
			)}
		</div>
	);
}
