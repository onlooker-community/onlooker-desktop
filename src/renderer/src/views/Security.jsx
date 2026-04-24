// Security view — dedicated Warden analysis.
// Shows injection attempt timeline, matched patterns, threat sources, and event log.
// Data comes from the same sessions prop used by Metrics — no new IPC needed.

import { useMemo, useState } from "react";

const C = {
	bg0: "#0b0d14",
	bg1: "#12151f",
	bg2: "#181c2a",
	bg3: "#1f2335",
	border: "#252a3d",
	orange: "#fb923c",
	red: "#f87171",
	green: "#4ade80",
	yellow: "#fbbf24",
	cyan: "#22d3ee",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

const RANGES = [
	{ id: "today", label: "Today" },
	{ id: "week", label: "This week" },
	{ id: "month", label: "This month" },
	{ id: "all", label: "All time" },
];

function filterByRange(sessions, range) {
	const now = new Date();
	const cutoff = {
		today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
		week: new Date(now - 7 * 86400000),
		month: new Date(now - 30 * 86400000),
		all: new Date(0),
	}[range];
	return sessions.filter((s) => s.start && new Date(s.start) >= cutoff);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

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

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, style }) {
	return (
		<div
			style={{
				background: C.bg2,
				borderRadius: 10,
				padding: "16px 18px",
				border: `1px solid ${C.border}`,
				marginBottom: 16,
				...style,
			}}
		>
			<div
				style={{
					fontSize: 10,
					color: C.textMuted,
					letterSpacing: "0.07em",
					textTransform: "uppercase",
					fontFamily: "monospace",
					marginBottom: 14,
				}}
			>
				{title}
			</div>
			{children}
		</div>
	);
}

// ── Threat timeline ───────────────────────────────────────────────────────────
// Auto-buckets by hour (≤48h span) or by day (longer spans).
// Single-day data was producing one giant bar — hourly bucketing makes the
// distribution over the course of a session actually readable.

function ThreatTimeline({ events }) {
	const { data, unit } = useMemo(() => {
		if (events.length === 0) return { data: [], unit: "day" };

		const first = events.reduce((m, e) => (e.ts < m ? e.ts : m), events[0].ts);
		const last = events.reduce((m, e) => (e.ts > m ? e.ts : m), events[0].ts);
		const spanHours = (new Date(last) - new Date(first)) / 3_600_000;

		// ≤48h → hourly buckets; otherwise daily
		const useHours = spanHours <= 48;
		const keyFn = useHours
			? (ts) => ts.slice(0, 13) // "2026-04-22T14"
			: (ts) => ts.slice(0, 10); // "2026-04-22"
		const labelFn = useHours
			? (k) => {
					const h = parseInt(k.slice(11, 13), 10);
					return `${h % 12 || 12}${h >= 12 ? "p" : "a"}`;
				}
			: (k) =>
					new Date(`${k}T12:00:00`).toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
					});

		const map = {};
		for (const e of events) {
			const k = keyFn(e.ts);
			if (!map[k]) map[k] = { key: k, blocks: 0, allows: 0 };
			if (e.status === "block") map[k].blocks++;
			else map[k].allows++;
		}

		const data = Object.values(map)
			.sort((a, b) => a.key.localeCompare(b.key))
			.map((d) => ({ ...d, label: labelFn(d.key) }));

		return { data, unit: useHours ? "hour" : "day" };
	}, [events]);

	const maxTotal = Math.max(...data.map((d) => d.blocks + d.allows), 1);
	const barW = 10,
		gap = 3;
	const svgH = 72,
		labelH = 18;
	const totalW = Math.max(data.length * (barW + gap) - gap, 400);
	// Show label every N bars so they don't crowd each other
	const labelEvery = Math.ceil(data.length / 10);

	const title = `Injection Attempts — ${unit === "hour" ? "By Hour" : "By Day"}`;

	return (
		<Section title={title}>
			<svg
				width="100%"
				viewBox={`0 0 ${totalW} ${svgH + labelH}`}
				style={{ display: "block", overflow: "visible" }}
			>
				<title>{title}</title>
				{data.map(({ key, blocks, allows, label }, i) => {
					const x = i * (barW + gap);
					const totalPx = ((blocks + allows) / maxTotal) * svgH;
					const blockPx = (blocks / maxTotal) * svgH;
					const allowPx = totalPx - blockPx;
					const showLabel =
						i === 0 || i === data.length - 1 || i % labelEvery === 0;
					return (
						<g key={key}>
							{allows > 0 && (
								<rect
									x={x}
									y={svgH - totalPx}
									width={barW}
									height={allowPx}
									fill={C.green}
									opacity={0.55}
									rx={2}
								/>
							)}
							{blocks > 0 && (
								<rect
									x={x}
									y={svgH - blockPx}
									width={barW}
									height={blockPx}
									fill={C.red}
									opacity={0.85}
									rx={2}
								/>
							)}
							{showLabel && (
								<text
									x={x + barW / 2}
									y={svgH + 13}
									textAnchor="middle"
									fontSize={7}
									fill={C.textMuted}
									fontFamily="monospace"
								>
									{label}
								</text>
							)}
						</g>
					);
				})}
			</svg>
			<div style={{ display: "flex", gap: 16, marginTop: 4 }}>
				<LegendDot color={C.red} label="Blocked" />
				<LegendDot color={C.green} label="Allowed" opacity={0.55} />
			</div>
		</Section>
	);
}

function LegendDot({ color, label, opacity = 1 }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
			<div
				style={{
					width: 8,
					height: 8,
					borderRadius: 1,
					background: color,
					opacity,
				}}
			/>
			<span style={{ fontSize: 10, color: C.textMuted }}>{label}</span>
		</div>
	);
}

// ── Matched patterns ──────────────────────────────────────────────────────────
// Most common injection patterns Warden detected, from meta.pattern_matched.

function MatchedPatterns({ events }) {
	const patterns = useMemo(() => {
		const counts = {};
		for (const e of events) {
			const pattern = e.meta?.pattern_matched ?? "(no pattern recorded)";
			if (!counts[pattern]) counts[pattern] = { total: 0, blocks: 0 };
			counts[pattern].total++;
			if (e.status === "block") counts[pattern].blocks++;
		}
		return Object.entries(counts)
			.sort(([, a], [, b]) => b.total - a.total)
			.slice(0, 8)
			.map(([pattern, v]) => ({ pattern, ...v }));
	}, [events]);

	const maxCount = patterns.length > 0 ? patterns[0].total : 1;

	if (patterns.length === 0) {
		return (
			<Section title="Matched Patterns" style={{ flex: 1 }}>
				<div style={{ color: C.textMuted, fontSize: 11 }}>
					No patterns recorded
				</div>
			</Section>
		);
	}

	return (
		<Section title="Matched Patterns" style={{ flex: 1 }}>
			{patterns.map(({ pattern, total, blocks }) => {
				const pct = (total / maxCount) * 100;
				const truncated =
					pattern.length > 38 ? `${pattern.slice(0, 35)}…` : pattern;
				return (
					<div key={pattern} title={pattern} style={{ marginBottom: 9 }}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 3,
							}}
						>
							<span
								style={{
									fontSize: 10,
									color: C.textSecondary,
									fontFamily: "monospace",
								}}
							>
								{truncated}
							</span>
							<span
								style={{
									fontSize: 9,
									fontFamily: "monospace",
									color: blocks > 0 ? C.red : C.green,
								}}
							>
								{blocks > 0 ? `⊘ ${blocks}/${total}` : `✓ ${total}`}
							</span>
						</div>
						<div style={{ height: 3, borderRadius: 2, background: C.bg3 }}>
							<div
								style={{
									width: `${pct}%`,
									height: "100%",
									borderRadius: 2,
									background: blocks > 0 ? C.orange : C.green,
									transition: "width 0.4s ease",
								}}
							/>
						</div>
					</div>
				);
			})}
		</Section>
	);
}

// ── Trigger sources ───────────────────────────────────────────────────────────
// Which URLs or file paths most frequently triggered Warden checks.
// Uses meta.target for enriched events, falls back to e.detail (normalised from input_summary).

function TriggerSources({ events }) {
	const sources = useMemo(() => {
		const counts = {};
		for (const e of events) {
			const raw =
				e.meta?.target ?? e.meta?.url ?? e.detail ?? "(unknown source)";
			const key = typeof raw === "string" ? raw : "(complex source)";
			if (!counts[key]) counts[key] = { total: 0, blocks: 0 };
			counts[key].total++;
			if (e.status === "block") counts[key].blocks++;
		}
		return Object.entries(counts)
			.sort(([, a], [, b]) => b.total - a.total)
			.slice(0, 8)
			.map(([source, v]) => ({ source, ...v }));
	}, [events]);

	const maxCount = sources.length > 0 ? sources[0].total : 1;

	if (sources.length === 0) {
		return (
			<Section title="Trigger Sources" style={{ flex: 1 }}>
				<div style={{ color: C.textMuted, fontSize: 11 }}>
					No sources recorded
				</div>
			</Section>
		);
	}

	return (
		<Section title="Trigger Sources" style={{ flex: 1 }}>
			{sources.map(({ source, total, blocks }) => {
				const pct = (total / maxCount) * 100;
				const display = source.length > 44 ? `…${source.slice(-41)}` : source;
				return (
					<div key={source} title={source} style={{ marginBottom: 9 }}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 3,
								gap: 8,
							}}
						>
							<span
								style={{
									fontSize: 10,
									color: C.textSecondary,
									fontFamily: "monospace",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									flex: 1,
								}}
							>
								{display}
							</span>
							<span
								style={{
									fontSize: 9,
									fontFamily: "monospace",
									flexShrink: 0,
									color: blocks > 0 ? C.red : C.textMuted,
								}}
							>
								{blocks > 0 ? `⊘ ${blocks}` : total}
							</span>
						</div>
						<div style={{ height: 3, borderRadius: 2, background: C.bg3 }}>
							<div
								style={{
									width: `${pct}%`,
									height: "100%",
									borderRadius: 2,
									background: blocks > 0 ? C.red : C.cyan,
									transition: "width 0.4s ease",
								}}
							/>
						</div>
					</div>
				);
			})}
		</Section>
	);
}

// ── Tool coverage ─────────────────────────────────────────────────────────────
// Which tools (WebFetch, Read, etc.) Warden is checking.

function ToolCoverage({ events }) {
	const tools = useMemo(() => {
		const counts = {};
		for (const e of events) {
			const tool =
				e.meta?.tool ?? e.tool_name ?? e.meta?.tool_name ?? "Unknown";
			if (!counts[tool]) counts[tool] = { total: 0, blocks: 0 };
			counts[tool].total++;
			if (e.status === "block") counts[tool].blocks++;
		}
		return Object.entries(counts)
			.sort(([, a], [, b]) => b.total - a.total)
			.map(([tool, v]) => ({ tool, ...v }));
	}, [events]);

	if (tools.length === 0) return null;

	return (
		<Section title="Tool Coverage">
			<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
				{tools.map(({ tool, total, blocks }) => {
					const rate = total > 0 ? Math.round((blocks / total) * 100) : 0;
					return (
						<div
							key={tool}
							style={{
								background: C.bg3,
								borderRadius: 8,
								padding: "10px 14px",
								border: `1px solid ${C.border}`,
								minWidth: 110,
								flex: 1,
							}}
						>
							<div
								style={{
									fontSize: 11,
									color: C.textSecondary,
									fontFamily: "monospace",
									marginBottom: 4,
								}}
							>
								{tool}
							</div>
							<div
								style={{
									fontSize: 20,
									fontWeight: 700,
									color: C.orange,
									fontFamily: "'JetBrains Mono', monospace",
									lineHeight: 1,
								}}
							>
								{total}
							</div>
							<div
								style={{
									fontSize: 9,
									color: blocks > 0 ? C.red : C.textMuted,
									marginTop: 3,
								}}
							>
								{blocks > 0 ? `${rate}% blocked` : "all allowed"}
							</div>
						</div>
					);
				})}
			</div>
		</Section>
	);
}

// ── Event log ─────────────────────────────────────────────────────────────────
// Recent Warden events, newest first, with expandable meta detail.

function EventLog({ events }) {
	const [expanded, setExpanded] = useState(null);
	const recent = useMemo(() => [...events].reverse().slice(0, 50), [events]);

	if (recent.length === 0) return null;

	return (
		<Section
			title={`Event Log${events.length > 50 ? ` — showing 50 of ${events.length}` : ""}`}
		>
			{recent.map((e, i) => {
				const isBlock = e.status === "block";
				const isOpen = expanded === i;
				const time = new Date(e.ts).toLocaleTimeString("en-US", {
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
				});
				const date = e.ts.slice(0, 10);
				const pattern = e.meta?.pattern_matched;
				const tool = e.meta?.tool ?? e.tool_name ?? e.meta?.tool_name;

				return (
					<button
						key={`${e.ts}-${e.plugin ?? ""}-${e.status ?? ""}`}
						type="button"
						onClick={() => setExpanded(isOpen ? null : i)}
						style={{
							display: "block",
							width: "100%",
							textAlign: "left",
							padding: "8px 10px",
							borderRadius: 6,
							marginBottom: 3,
							cursor: "pointer",
							border: `1px solid ${isOpen ? C.border : "transparent"}`,
							background: isOpen ? C.bg3 : "transparent",
							transition: "background 0.15s",
							font: "inherit",
							color: "inherit",
						}}
						onMouseEnter={(ev) => {
							if (!isOpen) ev.currentTarget.style.background = "#ffffff06";
						}}
						onMouseLeave={(ev) => {
							if (!isOpen) ev.currentTarget.style.background = "transparent";
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<div
								style={{
									width: 6,
									height: 6,
									borderRadius: "50%",
									flexShrink: 0,
									background: isBlock ? C.red : C.green,
								}}
							/>

							<span
								style={{
									fontSize: 9,
									fontFamily: "monospace",
									fontWeight: 700,
									flexShrink: 0,
									color: isBlock ? C.red : C.green,
									background: isBlock ? `${C.red}18` : `${C.green}18`,
									padding: "1px 5px",
									borderRadius: 3,
								}}
							>
								{isBlock ? "BLOCK" : "ALLOW"}
							</span>

							{tool && (
								<span
									style={{
										fontSize: 9,
										fontFamily: "monospace",
										flexShrink: 0,
										color: C.orange,
										background: `${C.orange}18`,
										padding: "1px 5px",
										borderRadius: 3,
									}}
								>
									{tool}
								</span>
							)}

							<span
								style={{
									fontSize: 11,
									color: C.textSecondary,
									flex: 1,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{pattern ?? e.label ?? e.detail ?? "Warden check"}
							</span>

							<span
								style={{
									fontSize: 9,
									color: C.textMuted,
									flexShrink: 0,
									fontFamily: "monospace",
								}}
							>
								{date} {time}
							</span>
						</div>

						{isOpen && (
							<div
								style={{
									marginTop: 10,
									paddingTop: 10,
									borderTop: `1px solid ${C.border}`,
								}}
							>
								{e.detail && <MetaRow k="detail" v={e.detail} />}
								{Object.entries(e.meta ?? {}).map(([k, v]) =>
									v != null ? <MetaRow key={k} k={k} v={v} /> : null,
								)}
							</div>
						)}
					</button>
				);
			})}
		</Section>
	);
}

function MetaRow({ k, v }) {
	const display =
		typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
	return (
		<div
			style={{
				display: "flex",
				gap: 10,
				marginBottom: 5,
				alignItems: "flex-start",
			}}
		>
			<span
				style={{
					fontSize: 9,
					color: C.textMuted,
					fontFamily: "monospace",
					minWidth: 100,
					flexShrink: 0,
				}}
			>
				{k}
			</span>
			<span
				style={{
					fontSize: 10,
					color: C.textSecondary,
					fontFamily: "monospace",
					wordBreak: "break-all",
					whiteSpace: "pre-wrap",
				}}
			>
				{display}
			</span>
		</div>
	);
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
	return (
		<div
			style={{
				background: C.bg2,
				borderRadius: 10,
				padding: "48px 24px",
				border: `1px solid ${C.border}`,
				textAlign: "center",
			}}
		>
			<div
				style={{
					fontSize: 32,
					marginBottom: 12,
					color: C.orange,
					opacity: 0.4,
				}}
			>
				⊘
			</div>
			<div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 6 }}>
				No Warden events in this range
			</div>
			<div
				style={{
					fontSize: 11,
					color: C.textMuted,
					maxWidth: 320,
					margin: "0 auto",
				}}
			>
				Warden monitors WebFetch and Read operations for indirect prompt
				injection attempts. Events appear here once Claude Code sessions are
				active.
			</div>
		</div>
	);
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function Security({ sessions }) {
	const [range, setRange] = useState("week");

	const filtered = useMemo(
		() => filterByRange(sessions, range),
		[sessions, range],
	);
	const allEvents = useMemo(
		() => filtered.flatMap((s) => s.events ?? []),
		[filtered],
	);
	const wardenEvents = useMemo(
		() => allEvents.filter((e) => e.plugin === "warden"),
		[allEvents],
	);

	const blocks = useMemo(
		() => wardenEvents.filter((e) => e.status === "block"),
		[wardenEvents],
	);
	const allows = useMemo(
		() => wardenEvents.filter((e) => e.status !== "block"),
		[wardenEvents],
	);
	const blockRate =
		wardenEvents.length > 0
			? Math.round((blocks.length / wardenEvents.length) * 100)
			: null;

	return (
		<div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
			{/* Header */}
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
						Security
					</span>
					<span
						style={{
							fontSize: 10,
							color: C.orange,
							fontFamily: "monospace",
							background: `${C.orange}18`,
							padding: "2px 7px",
							borderRadius: 4,
						}}
					>
						Warden
					</span>
				</div>
				<div style={{ display: "flex", gap: 2 }}>
					{RANGES.map((r) => (
						<button
							key={r.id}
							type="button"
							onClick={() => setRange(r.id)}
							style={{
								fontSize: 10,
								padding: "4px 10px",
								borderRadius: 5,
								cursor: "pointer",
								border: `1px solid ${range === r.id ? C.orange : C.border}`,
								background: range === r.id ? `${C.orange}15` : "transparent",
								color: range === r.id ? C.orange : C.textMuted,
								fontFamily: "inherit",
								transition: "all 0.15s",
							}}
						>
							{r.label}
						</button>
					))}
				</div>
			</div>

			{/* Summary cards */}
			<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
				<StatCard label="Total Checks" value={wardenEvents.length} />
				<StatCard
					label="Blocked"
					value={blocks.length}
					color={blocks.length > 0 ? C.red : C.textMuted}
				/>
				<StatCard label="Allowed" value={allows.length} color={C.green} />
				<StatCard
					label="Block Rate"
					value={blockRate != null ? `${blockRate}%` : "—"}
					color={blockRate > 20 ? C.red : blockRate > 5 ? C.yellow : C.green}
				/>
			</div>

			{wardenEvents.length === 0 ? (
				<EmptyState />
			) : (
				<>
					<ThreatTimeline events={wardenEvents} />

					<div style={{ display: "flex", gap: 16 }}>
						<MatchedPatterns events={wardenEvents} />
						<TriggerSources events={wardenEvents} />
					</div>

					<ToolCoverage events={wardenEvents} />
					<EventLog events={wardenEvents} />
				</>
			)}
		</div>
	);
}
