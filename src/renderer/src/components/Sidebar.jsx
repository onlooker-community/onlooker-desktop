// Persistent left sidebar — navigation + live session indicator.
// Icons are text/emoji glyphs so there's no icon dependency to manage.

import { useState } from "react";
import PressureGauge from "./PressureGauge.jsx";

const C = {
	bg: "#0b0d14",
	border: "#1f2335",
	pink: "#f472b6",
	green: "#4ade80",
	yellow: "#fbbf24",
	textMuted: "#475569",
	textActive: "#e2e8f0",
};

const NAV = [
	{ id: "feed", icon: "⚡", label: "Live Feed" },
	{ id: "sessions", icon: "◎", label: "Sessions" },
	{ id: "replay", icon: "▶", label: "Session Replay" },
	{ id: "project", icon: "◫", label: "Project" },
	{ id: "multiproj", icon: "◰", label: "All Projects" },
	{ id: "synthesis", icon: "⧖", label: "Synthesis" },
	{ id: "metrics", icon: "▦", label: "Metrics" },
	{ id: "heatmap", icon: "▧", label: "Attention" },
	{ id: "security", icon: "⊘", label: "Security" },
	{ id: "anomalies", icon: "◇", label: "Anomalies" },
	{ id: "deadends", icon: "⊗", label: "Dead Ends" },
	{ id: "instgraph", icon: "⬡", label: "Instructions" },
	{ id: "diffing", icon: "⇄", label: "Prompt Diffs" },
	{ id: "handoffs", icon: "⤻", label: "Handoffs" },
	{ id: "review", icon: "☆", label: "Weekly Review" },
];

export default function Sidebar({
	activeView,
	onNavigate,
	liveActive,
	blockCount,
	sessionCount,
	wardenBlocks,
	health,
	pressure,
}) {
	return (
		<div
			style={{
				width: 56,
				background: C.bg,
				borderRight: `1px solid ${C.border}`,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				paddingBottom: 12,
				flexShrink: 0,
				// Leave room for macOS traffic lights
				paddingTop: 52,
			}}
		>
			{/* Wordmark dot */}
			<div
				style={{
					width: 28,
					height: 28,
					borderRadius: "50%",
					background: `${C.pink}18`,
					border: `1px solid ${C.pink}44`,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: 14,
					color: C.pink,
					marginBottom: 24,
					flexShrink: 0,
				}}
			>
				✦
			</div>

			{/* Nav items */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 2,
					width: "100%",
				}}
			>
				{NAV.map((item) => (
					<NavItem
						key={item.id}
						item={item}
						active={activeView === item.id}
						onNavigate={onNavigate}
						badge={
							item.id === "feed" && blockCount > 0
								? blockCount
								: item.id === "sessions" && sessionCount > 0
									? sessionCount
									: item.id === "security" && wardenBlocks > 0
										? wardenBlocks
										: null
						}
						badgeColor={item.id === "security" ? "#fb923c" : undefined}
						dot={item.id === "feed" && liveActive}
					/>
				))}
			</div>

			{/* Spacer */}
			<div style={{ flex: 1 }} />

			{/* Context pressure gauge */}
			<PressureGauge pressure={pressure} active={liveActive} />

			{/* Instruction health indicator (Cartographer) */}
			{health != null && (
				<HealthIndicator health={health} onNavigate={onNavigate} />
			)}

			{/* Settings at bottom */}
			<NavItem
				item={{ id: "settings", icon: "⚙", label: "Settings" }}
				active={activeView === "settings"}
				onNavigate={onNavigate}
			/>
		</div>
	);
}

// Derives a traffic-light color from issue counts (not score).
// high > 0 → red, medium > 0 → amber, else → green.
function healthColor(issue_count) {
	if (!issue_count) return C.textMuted;
	if (issue_count.high > 0) return "#f87171";
	if (issue_count.medium > 0) return "#fbbf24";
	return "#4ade80";
}

function sevColor(severity) {
	if (severity === "high") return "#f87171";
	if (severity === "medium") return "#fbbf24";
	return "#94a3b8";
}

function HealthIndicator({ health, onNavigate }) {
	const [open, setOpen] = useState(false);

	const color = healthColor(health.issue_count);
	const high = health.issue_count?.high ?? 0;
	const medium = health.issue_count?.medium ?? 0;
	const low = health.issue_count?.low ?? 0;
	const total = high + medium + low;
	const score =
		health.health_score != null
			? `${Math.round(health.health_score * 100)}%`
			: "?";
	const hasIssues = total > 0;

	// Tooltip only shown when panel is closed (title attr conflicts with open panel)
	const issueLine =
		total === 0
			? "no issues found"
			: [
					high > 0 && `${high} high`,
					medium > 0 && `${medium} medium`,
					low > 0 && `${low} low`,
				]
					.filter(Boolean)
					.join(", ");
	const ageLabel = health.last_audit_at
		? new Date(health.last_audit_at).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})
		: null;
	const tooltip = open
		? undefined
		: [
				`Instruction health: ${score}`,
				issueLine,
				ageLabel && `audited ${ageLabel}`,
			]
				.filter(Boolean)
				.join("\n");

	return (
		<>
			<button
				type="button"
				title={tooltip}
				onClick={() => setOpen((o) => !o)}
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 3,
					marginBottom: 10,
					cursor: "pointer",
					opacity: hasIssues ? 1 : 0.55,
					background: "none",
					border: "none",
					padding: 0,
				}}
			>
				{/* Colored dot — glows when there are issues worth noticing */}
				<div
					style={{
						width: 8,
						height: 8,
						borderRadius: "50%",
						background: color,
						boxShadow: hasIssues ? `0 0 7px ${color}bb` : "none",
						transition: "background 0.3s, box-shadow 0.3s",
					}}
				/>
				<span
					style={{
						fontSize: 7,
						fontFamily: "monospace",
						color,
						letterSpacing: "0.03em",
					}}
				>
					CAR
				</span>
			</button>

			{open && (
				<HealthPanel
					health={health}
					color={color}
					score={score}
					ageLabel={ageLabel}
					onNavigate={onNavigate}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

function HealthPanel({ health, color, score, ageLabel, onNavigate, onClose }) {
	const issues = health.issues ?? [];

	return (
		<div
			style={{
				position: "fixed",
				left: 64,
				bottom: 52,
				width: 300,
				background: "#12151f",
				border: "1px solid #252a3d",
				borderRadius: 8,
				padding: "12px 14px",
				zIndex: 100,
				boxShadow: "0 8px 32px #00000088",
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 4,
				}}
			>
				<span
					style={{
						fontSize: 11,
						fontWeight: 600,
						color: "#e2e8f0",
						letterSpacing: "0.03em",
					}}
				>
					Instruction Health
				</span>
				<span
					style={{
						fontSize: 13,
						fontWeight: 700,
						color,
						fontFamily: "monospace",
					}}
				>
					{score}
				</span>
			</div>

			{ageLabel && (
				<div
					style={{
						fontSize: 9,
						color: "#475569",
						marginBottom: 8,
						fontFamily: "monospace",
					}}
				>
					audited {ageLabel}
				</div>
			)}

			{/* Summary line */}
			{health.summary && (
				<div
					style={{
						fontSize: 10,
						color: "#94a3b8",
						lineHeight: 1.5,
						marginBottom: 8,
						paddingBottom: 8,
						borderBottom: "1px solid #1f2335",
					}}
				>
					{health.summary}
				</div>
			)}

			{/* Issues list */}
			{issues.length === 0 ? (
				<div style={{ fontSize: 10, color: "#4ade80", padding: "4px 0" }}>
					No issues found
				</div>
			) : (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 5,
						maxHeight: 220,
						overflowY: "auto",
					}}
				>
					{issues.map((issue, i) => (
						<div
							key={issue.id ?? i}
							style={{
								padding: "5px 8px",
								borderRadius: 5,
								background: "#181c2a",
								border: `1px solid ${sevColor(issue.severity)}28`,
							}}
						>
							<div
								style={{
									display: "flex",
									gap: 5,
									alignItems: "center",
									marginBottom: 2,
								}}
							>
								<span
									style={{
										fontSize: 8,
										fontWeight: 700,
										fontFamily: "monospace",
										padding: "1px 4px",
										borderRadius: 3,
										background: `${sevColor(issue.severity)}22`,
										color: sevColor(issue.severity),
										textTransform: "uppercase",
										letterSpacing: "0.05em",
									}}
								>
									{issue.severity}
								</span>
								{issue.category && (
									<span
										style={{
											fontSize: 9,
											color: "#475569",
											fontStyle: "italic",
										}}
									>
										{issue.category}
									</span>
								)}
							</div>
							<div style={{ fontSize: 10, color: "#cbd5e1", lineHeight: 1.45 }}>
								{issue.description}
							</div>
						</div>
					))}
				</div>
			)}

			{/* Actions */}
			<div
				style={{
					display: "flex",
					gap: 6,
					marginTop: 10,
					justifyContent: "flex-end",
				}}
			>
				<button
					type="button"
					onClick={() => {
						onNavigate("feed");
						onClose();
					}}
					style={{
						fontSize: 10,
						padding: "4px 10px",
						borderRadius: 5,
						border: "1px solid #252a3d",
						background: "transparent",
						color: "#94a3b8",
						cursor: "pointer",
						fontFamily: "monospace",
					}}
				>
					View Feed
				</button>
				<button
					type="button"
					onClick={onClose}
					style={{
						fontSize: 10,
						padding: "4px 10px",
						borderRadius: 5,
						border: "1px solid #252a3d",
						background: "transparent",
						color: "#475569",
						cursor: "pointer",
						fontFamily: "monospace",
					}}
				>
					Close
				</button>
			</div>
		</div>
	);
}

function NavItem({ item, active, onNavigate, badge, dot, badgeColor }) {
	return (
		<button
			type="button"
			title={item.label}
			onClick={() => onNavigate(item.id)}
			style={{
				position: "relative",
				width: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				height: 40,
				cursor: "pointer",
				fontSize: 16,
				color: active ? C.textActive : C.textMuted,
				background: active ? "#ffffff0a" : "transparent",
				borderLeft: `2px solid ${active ? C.pink : "transparent"}`,
				transition: "all 0.15s",
				border: "none",
				padding: 0,
			}}
			onMouseEnter={(e) => {
				if (!active) e.currentTarget.style.color = C.textActive;
			}}
			onMouseLeave={(e) => {
				if (!active) e.currentTarget.style.color = C.textMuted;
			}}
		>
			{item.icon}

			{/* Live pulse dot (feed only) */}
			{dot && (
				<div
					style={{
						position: "absolute",
						top: 8,
						right: 10,
						width: 6,
						height: 6,
						borderRadius: "50%",
						background: C.green,
						boxShadow: `0 0 6px ${C.green}`,
						animation: "pulse 2s infinite",
					}}
				/>
			)}

			{/* Badge (block/warn count) */}
			{badge != null && !dot && (
				<div
					style={{
						position: "absolute",
						top: 6,
						right: 8,
						minWidth: 14,
						height: 14,
						borderRadius: 7,
						background: badgeColor ?? C.yellow,
						color: "#000",
						fontSize: 8,
						fontWeight: 700,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: "0 3px",
						fontFamily: "monospace",
					}}
				>
					{badge > 99 ? "99+" : badge}
				</div>
			)}
		</button>
	);
}
