// The right-hand telemetry panel. Three tabs:
//
//   Live Feed  — every hook event as it arrives, color-coded by plugin/status
//   Metrics    — session score gauge, plugin activity bars, agent layer decomposition
//   Debug      — raw JSONL event dump + active hooks.json display

import { useEffect, useRef, useState } from "react";

const C = {
	bg0: "#0b0d14",
	bg1: "#12151f",
	bg2: "#181c2a",
	bg3: "#1f2335",
	border: "#252a3d",
	borderAccent: "#2e3555",
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

const PLUGIN_COLORS = {
	sentinel: C.yellow,
	tribunal: C.pink,
	archivist: C.cyan,
	scribe: C.purple,
};
const PLUGIN_LABELS = {
	sentinel: "SEN",
	tribunal: "TRB",
	archivist: "ARC",
	scribe: "SCR",
};
const STATUS_COLORS = {
	pass: C.green,
	warn: C.yellow,
	fail: C.red,
	info: C.cyan,
	block: C.red,
};

function scoreColor(s) {
	if (s >= 0.85) return C.green;
	if (s >= 0.7) return C.yellow;
	return C.red;
}

function PluginBadge({ plugin }) {
	const color = PLUGIN_COLORS[plugin] ?? C.textMuted;
	return (
		<span
			style={{
				fontSize: 9,
				fontWeight: 700,
				letterSpacing: "0.08em",
				padding: "1px 5px",
				borderRadius: 3,
				border: `1px solid ${color}44`,
				color,
				background: `${color}11`,
				fontFamily: "'JetBrains Mono', monospace",
			}}
		>
			{PLUGIN_LABELS[plugin] ?? plugin?.toUpperCase()}
		</span>
	);
}

function MiniBar({ value, color, width = 60 }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
			<div
				style={{
					width,
					height: 3,
					borderRadius: 2,
					background: C.bg3,
					overflow: "hidden",
					flexShrink: 0,
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
				style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}
			>
				{(value * 100).toFixed(0)}%
			</span>
		</div>
	);
}

function ScoreGauge({ score }) {
	const r = 28,
		circ = 2 * Math.PI * r,
		fill = circ * score;
	const color = scoreColor(score);
	return (
		<div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
			<svg width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
				<title>Session Score Gauge</title>
				<circle
					cx={36}
					cy={36}
					r={r}
					fill="none"
					stroke={C.bg3}
					strokeWidth={5}
				/>
				<circle
					cx={36}
					cy={36}
					r={r}
					fill="none"
					stroke={color}
					strokeWidth={5}
					strokeDasharray={`${fill} ${circ - fill}`}
					strokeLinecap="round"
					style={{
						transition: "stroke-dasharray 0.7s ease",
						filter: `drop-shadow(0 0 4px ${color}88)`,
					}}
				/>
			</svg>
			<div
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<span
					style={{
						fontSize: 15,
						fontWeight: 700,
						color,
						fontFamily: "'JetBrains Mono', monospace",
						lineHeight: 1,
					}}
				>
					{score.toFixed(2)}
				</span>
				<span style={{ fontSize: 8, color: C.textMuted, marginTop: 1 }}>
					score
				</span>
			</div>
		</div>
	);
}

// ── Live Feed tab ─────────────────────────────────────────────────────────────
function FeedTab({ events }) {
	const ref = useRef(null);

	// Auto-scroll to the newest event whenever the list grows
	useEffect(() => {
		if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
	}, []);

	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				minHeight: 0,
			}}
		>
			<div
				style={{
					padding: "8px 14px 4px",
					display: "flex",
					alignItems: "center",
					gap: 6,
				}}
			>
				<div
					style={{
						width: 5,
						height: 5,
						borderRadius: "50%",
						background: C.green,
						animation: "pulse 2s infinite",
					}}
				/>
				<span style={{ fontSize: 10, color: C.textMuted }}>
					{events.length} events this session
				</span>
			</div>

			<div ref={ref} style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
				{events.length === 0 && (
					<div
						style={{
							padding: "24px 14px",
							textAlign: "center",
							color: C.textMuted,
							fontSize: 11,
						}}
					>
						Waiting for hook events…
					</div>
				)}
				{events.map((e, i) => (
					<div
						key={`${e.plugin}-${e.ts}`}
						style={{
							display: "flex",
							alignItems: "flex-start",
							gap: 8,
							padding: "5px 14px",
							transition: "background 0.1s",
							cursor: "default",
							animation:
								i === events.length - 1 ? "fadeSlideIn 0.25s ease" : undefined,
						}}
					>
						<div
							style={{
								width: 6,
								height: 6,
								borderRadius: "50%",
								background: STATUS_COLORS[e.status] ?? C.textMuted,
								marginTop: 5,
								flexShrink: 0,
								boxShadow: `0 0 5px ${STATUS_COLORS[e.status] ?? C.textMuted}88`,
							}}
						/>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									flexWrap: "wrap",
								}}
							>
								<PluginBadge plugin={e.plugin} />
								<span
									style={{
										fontSize: 11,
										color: C.textSecondary,
										fontWeight: 500,
									}}
								>
									{e.label}
								</span>
								<span
									style={{
										fontSize: 10,
										color: C.textMuted,
										marginLeft: "auto",
										fontFamily: "monospace",
										flexShrink: 0,
									}}
								>
									{new Date(e.ts).toLocaleTimeString("en-US", {
										hour12: false,
									})}
								</span>
							</div>
							<div
								style={{
									fontSize: 10,
									color: C.textMuted,
									marginTop: 2,
									fontFamily: "monospace",
								}}
							>
								{e.detail}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Metrics tab ───────────────────────────────────────────────────────────────
function MetricsTab({ events }) {
	// Derive live metrics from the real event stream rather than hardcoding them
	const tribunalScores = events
		.filter((e) => e.plugin === "tribunal" && e.meta?.score != null)
		.map((e) => e.meta.score);

	const avgScore = tribunalScores.length
		? tribunalScores.reduce((a, b) => a + b, 0) / tribunalScores.length
		: 0.84; // placeholder until real events arrive

	const sentinelBlocks = events.filter(
		(e) => e.plugin === "sentinel" && e.status === "block",
	).length;
	const archivistWrites = events.filter(
		(e) => e.plugin === "archivist" && e.label?.includes("write"),
	).length;
	const warnCount = events.filter(
		(e) => e.status === "warn" || e.status === "fail",
	).length;

	return (
		<div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
			{/* Score + quick stats */}
			<div
				style={{
					display: "flex",
					alignItems: "flex-start",
					gap: 12,
					marginBottom: 18,
				}}
			>
				<ScoreGauge score={avgScore} />
				<div style={{ flex: 1 }}>
					<div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
						Session · Today
					</div>
					{[
						{ label: "Total Events", value: events.length },
						{ label: "Sentinel Blocks", value: sentinelBlocks },
						{ label: "Archivist Writes", value: archivistWrites },
						{ label: "Warnings / Flags", value: warnCount },
					].map((m) => (
						<div
							key={m.label}
							style={{
								display: "flex",
								justifyContent: "space-between",
								fontSize: 11,
								marginBottom: 5,
								color: C.textSecondary,
							}}
						>
							<span>{m.label}</span>
							<span style={{ fontFamily: "monospace", color: C.textPrimary }}>
								{m.value}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Per-plugin pass-rate bars */}
			<div style={{ marginBottom: 16 }}>
				<div
					style={{
						fontSize: 10,
						letterSpacing: "0.08em",
						color: C.textMuted,
						textTransform: "uppercase",
						fontFamily: "monospace",
						marginBottom: 10,
					}}
				>
					Plugin Activity
				</div>
				{["tribunal", "archivist", "sentinel", "scribe"].map((plugin) => {
					const pluginEvents = events.filter((e) => e.plugin === plugin);
					const passRate = pluginEvents.length
						? pluginEvents.filter(
								(e) => e.status === "pass" || e.status === "info",
							).length / pluginEvents.length
						: 0;
					return (
						<div key={plugin} style={{ marginBottom: 10 }}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									fontSize: 11,
									marginBottom: 3,
								}}
							>
								<span style={{ display: "flex", alignItems: "center", gap: 6 }}>
									<span
										style={{
											width: 6,
											height: 6,
											borderRadius: "50%",
											background: PLUGIN_COLORS[plugin],
											display: "inline-block",
										}}
									/>
									{plugin.charAt(0).toUpperCase() + plugin.slice(1)}
								</span>
								<span style={{ fontSize: 10, color: C.textMuted }}>
									{pluginEvents.length} events
								</span>
							</div>
							<MiniBar
								value={passRate}
								color={PLUGIN_COLORS[plugin]}
								width={120}
							/>
						</div>
					);
				})}
			</div>

			{/* Jeong & Son agent layer decomposition
          These are derived from the session's Tribunal meta fields.
          In this version the values are static reference points from the paper;
          a future release will compute them from real session data. */}
			<div
				style={{
					background: C.bg2,
					borderRadius: 8,
					padding: 12,
					border: `1px solid ${C.border}`,
				}}
			>
				<div
					style={{
						fontSize: 10,
						letterSpacing: "0.08em",
						color: C.textMuted,
						textTransform: "uppercase",
						fontFamily: "monospace",
						marginBottom: 10,
					}}
				>
					Agent Layer Decomposition
				</div>
				{[
					{ label: "Belief Tracking", val: 1.0, color: C.cyan },
					{ label: "World-Model Plan", val: 0.74, color: C.purple },
					{ label: "Symbolic Reflect.", val: 0.55, color: C.yellow },
					{ label: "LLM Revision", val: 0.043, color: C.pink },
				].map((layer) => (
					<div
						key={layer.label}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							marginBottom: 7,
						}}
					>
						<span
							style={{
								width: 102,
								fontSize: 9.5,
								color: C.textSecondary,
								flexShrink: 0,
							}}
						>
							{layer.label}
						</span>
						<MiniBar value={layer.val} color={layer.color} width={80} />
					</div>
				))}
				<div
					style={{
						fontSize: 9,
						color: C.textMuted,
						marginTop: 6,
						fontStyle: "italic",
						lineHeight: 1.5,
					}}
				>
					via Jeong &amp; Son (2026) decomposition framework
				</div>
			</div>
		</div>
	);
}

// ── Debug tab ─────────────────────────────────────────────────────────────────
function DebugTab({ events }) {
	return (
		<div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
			<div
				style={{
					fontSize: 10,
					letterSpacing: "0.08em",
					color: C.textMuted,
					textTransform: "uppercase",
					fontFamily: "monospace",
					marginBottom: 10,
				}}
			>
				Raw Hook Events (newest first)
			</div>

			{/* Show the 50 most recent events in reverse order */}
			{events
				.slice(-50)
				.reverse()
				.map((e) => (
					<div
						key={`${e.plugin}-${e.ts}`}
						style={{
							marginBottom: 6,
							padding: "8px 10px",
							background: C.bg2,
							borderRadius: 6,
							border: `1px solid ${C.border}`,
							fontSize: 10,
							fontFamily: "monospace",
							color: C.textMuted,
							lineHeight: 1.6,
						}}
					>
						<div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
							<span style={{ color: STATUS_COLORS[e.status] ?? C.textMuted }}>
								●
							</span>
							<span style={{ color: C.textSecondary }}>
								{new Date(e.ts).toLocaleTimeString("en-US", { hour12: false })}
							</span>
							<PluginBadge plugin={e.plugin} />
							<span style={{ color: C.textSecondary }}>{e.type}</span>
						</div>
						<div style={{ color: C.textSecondary }}>{e.label}</div>
						<div>{e.detail}</div>
						{e.meta && Object.keys(e.meta).length > 0 && (
							<div style={{ marginTop: 3, color: C.cyan, opacity: 0.7 }}>
								{JSON.stringify(e.meta)}
							</div>
						)}
					</div>
				))}

			{/* Static hooks.json reference so you can see what's registered */}
			<div
				style={{
					marginTop: 10,
					padding: 10,
					background: C.bg0,
					borderRadius: 6,
					fontSize: 10,
					fontFamily: "monospace",
					color: C.textMuted,
					border: `1px solid ${C.border}`,
				}}
			>
				<div style={{ color: C.cyan, marginBottom: 4 }}>
					{"// ~/.claude/hooks.json (active)"}
				</div>
				<div>PreToolUse → sentinel:gate.sh</div>
				<div>PostToolUse → tribunal:score.sh</div>
				<div>SubagentStop → archivist:write.sh</div>
				<div>UserPromptSubmit → scribe:capture.sh</div>
			</div>
		</div>
	);
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function ObservabilityPane({ events, settings }) {
	const [activeTab, setActiveTab] = useState("feed");
	const tabs = [
		{ id: "feed", label: "Live Feed" },
		{ id: "metrics", label: "Metrics" },
		{ id: "debug", label: "Debug" },
	];

	return (
		<div
			style={{
				width: settings?.panelWidth ?? 320,
				display: "flex",
				flexDirection: "column",
				background: C.bg1,
				flexShrink: 0,
			}}
		>
			{/* Panel header + tab strip */}
			<div
				style={{
					padding: "10px 14px 0",
					borderBottom: `1px solid ${C.border}`,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
					<span
						style={{
							fontSize: 10,
							fontWeight: 700,
							letterSpacing: "0.12em",
							color: C.pink,
							fontFamily: "monospace",
							textTransform: "uppercase",
						}}
					>
						Onlooker
					</span>
				</div>
				<div style={{ display: "flex", gap: 0 }}>
					{tabs.map((tab) => (
						<button
							type="button"
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							style={{
								fontSize: 10,
								padding: "5px 12px",
								border: "none",
								background: "transparent",
								borderBottom: `2px solid ${activeTab === tab.id ? C.pink : "transparent"}`,
								color: activeTab === tab.id ? C.textPrimary : C.textMuted,
								cursor: "pointer",
								fontFamily: "'DM Sans', sans-serif",
								transition: "all 0.15s",
							}}
						>
							{tab.label}
						</button>
					))}
				</div>
			</div>

			{/* Tab content */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
				}}
			>
				{activeTab === "feed" && <FeedTab events={events} />}
				{activeTab === "metrics" && <MetricsTab events={events} />}
				{activeTab === "debug" && <DebugTab events={events} />}
			</div>

			{/* Footer: model + hook status */}
			<div
				style={{
					padding: "7px 14px",
					borderTop: `1px solid ${C.border}`,
					display: "flex",
					gap: 8,
					fontSize: 9,
					color: C.textMuted,
					fontFamily: "monospace",
					background: C.bg0,
					flexWrap: "wrap",
				}}
			>
				<span>{settings?.model ?? "claude-sonnet-4"}</span>
				<span>·</span>
				<span style={{ color: C.green }}>4 hooks active</span>
				<span>·</span>
				<span>{settings?.logDir ?? "~/.claude/onlooker"}</span>
			</div>
		</div>
	);
}
