// Metrics view — aggregated stats across all sessions for a selected time range.

import { useMemo, useState } from "react";
import { useCostData } from "../hooks/useOnlooker.js";
import { PLUGIN_REGISTRY, pluginColor } from "../plugins.js";

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

function scoreColor(s) {
	if (s == null) return C.textMuted;
	if (s >= 0.85) return C.green;
	if (s >= 0.7) return C.yellow;
	return C.red;
}

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

// ── Reusable primitives ───────────────────────────────────────────────────────

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

function MiniBar({ label, value, max, color, count, sub }) {
	const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				marginBottom: 7,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					width: 130,
					flexShrink: 0,
				}}
			>
				<div
					style={{
						width: 8,
						height: 8,
						borderRadius: "50%",
						background: color,
						flexShrink: 0,
					}}
				/>
				<span
					style={{
						fontSize: 11,
						color: C.textSecondary,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{label}
				</span>
			</div>
			<div
				style={{
					flex: 1,
					height: 3,
					borderRadius: 2,
					background: C.bg3,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						width: `${pct}%`,
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
					width: 36,
					textAlign: "right",
					flexShrink: 0,
				}}
			>
				{count}
			</span>
			{sub && (
				<span
					style={{ fontSize: 9, color: C.textMuted, width: 60, flexShrink: 0 }}
				>
					{sub}
				</span>
			)}
		</div>
	);
}

// ── Score sparkline ───────────────────────────────────────────────────────────

function ScoreSparkline({ sessions }) {
	const byDay = {};
	for (const s of sessions) {
		if (!s.start || s.avgScore == null) continue;
		const day = s.start.slice(0, 10);
		if (!byDay[day]) byDay[day] = [];
		byDay[day].push(s.avgScore);
	}
	const points = Object.entries(byDay)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([day, scores]) => ({
			day,
			avg: scores.reduce((a, b) => a + b, 0) / scores.length,
		}));

	if (points.length < 2) return null;

	const w = 480,
		h = 72,
		px = 8,
		py = 8;
	const minY = 0.5,
		maxY = 1.0;
	const xs = points.map(
		(_, i) => px + (i / (points.length - 1)) * (w - px * 2),
	);
	const ys = points.map(
		(p) => h - py - ((p.avg - minY) / (maxY - minY)) * (h - py * 2),
	);
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
				Score over time
			</div>
			<svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
				<title>Score over time</title>
				<defs>
					<linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={C.pink} stopOpacity="0.25" />
						<stop offset="100%" stopColor={C.pink} stopOpacity="0" />
					</linearGradient>
				</defs>
				<path d={area} fill="url(#sg)" />
				<path
					d={line}
					fill="none"
					stroke={C.pink}
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				{xs.map((x, i) => (
					<circle
						key={points[i].day}
						cx={x}
						cy={ys[i]}
						r={3}
						fill={scoreColor(points[i].avg)}
					/>
				))}
			</svg>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					marginTop: 4,
				}}
			>
				{points
					.filter(
						(_, i) => i === 0 || i === points.length - 1 || points.length <= 7,
					)
					.map((p) => (
						<span
							key={p.day}
							style={{
								fontSize: 9,
								color: C.textMuted,
								fontFamily: "monospace",
							}}
						>
							{new Date(`${p.day}T12:00:00`).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
							})}
						</span>
					))}
			</div>
		</div>
	);
}

// ── Plugin activity section ───────────────────────────────────────────────────
// Groups plugins by category, shows event count + pass rate per plugin.

function PluginActivity({ allEvents }) {
	// Count events and pass rate per plugin
	const byPlugin = useMemo(() => {
		const map = {};
		for (const e of allEvents) {
			if (!map[e.plugin])
				map[e.plugin] = { total: 0, pass: 0, warn: 0, block: 0 };
			map[e.plugin].total++;
			if (e.status === "pass" || e.status === "allow") map[e.plugin].pass++;
			if (e.status === "warn" || e.status === "fail") map[e.plugin].warn++;
			if (e.status === "block") map[e.plugin].block++;
		}
		return map;
	}, [allEvents]);

	// Only show plugins that actually have events, grouped by category
	const activePlugins = Object.keys(byPlugin);
	if (activePlugins.length === 0) return null;

	const maxCount = Math.max(...activePlugins.map((id) => byPlugin[id].total));

	// Group by category, only showing categories with active plugins
	const categories = {};
	for (const id of activePlugins) {
		const cat = PLUGIN_REGISTRY[id]?.category ?? "Other";
		if (!categories[cat]) categories[cat] = [];
		categories[cat].push(id);
	}

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
					marginBottom: 14,
				}}
			>
				Plugin Activity
			</div>

			{Object.entries(categories).map(([cat, ids]) => (
				<div key={cat} style={{ marginBottom: 14 }}>
					<div
						style={{
							fontSize: 9,
							color: C.textMuted,
							letterSpacing: "0.06em",
							textTransform: "uppercase",
							fontFamily: "monospace",
							marginBottom: 8,
							paddingBottom: 4,
							borderBottom: `1px solid ${C.border}`,
						}}
					>
						{cat}
					</div>
					{ids.map((id) => {
						const stats = byPlugin[id];
						const color = pluginColor(id);
						const sub =
							stats.block > 0
								? `⊘ ${stats.block}`
								: stats.warn > 0
									? `⚑ ${stats.warn}`
									: null;
						return (
							<MiniBar
								key={id}
								label={
									PLUGIN_REGISTRY[id]?.desc
										? id.charAt(0).toUpperCase() + id.slice(1)
										: id
								}
								value={stats.total}
								max={maxCount}
								color={color}
								count={stats.total}
								sub={sub}
							/>
						);
					})}
				</div>
			))}
		</div>
	);
}

// ── Top flagged patterns ──────────────────────────────────────────────────────

function FlaggedPatterns({ allEvents }) {
	const patterns = useMemo(() => {
		const counts = {};
		for (const e of allEvents) {
			if (e.status === "warn" || e.status === "fail" || e.status === "block") {
				const key = `${e.plugin}:${e.label ?? e.type ?? "unknown"}`;
				if (!counts[key]) counts[key] = { count: 0, plugin: e.plugin };
				counts[key].count++;
			}
		}
		return Object.entries(counts)
			.sort(([, a], [, b]) => b.count - a.count)
			.slice(0, 8)
			.map(([key, v]) => ({ key, ...v }));
	}, [allEvents]);

	if (patterns.length === 0) return null;
	const maxCount = patterns[0].count;

	return (
		<div
			style={{
				background: C.bg2,
				borderRadius: 10,
				padding: "16px 18px",
				border: `1px solid ${C.border}`,
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
				Top Flagged Patterns
			</div>
			{patterns.map(({ key, count, plugin }) => (
				<MiniBar
					key={key}
					label={key}
					value={count}
					max={maxCount}
					color={pluginColor(plugin)}
					count={count}
				/>
			))}
		</div>
	);
}

// ── Cost helpers ─────────────────────────────────────────────────────────────

function fmtCost(n) {
	if (n == null || Number.isNaN(n)) return "—";
	if (n < 0.005) return "<$0.01";
	return `$${n.toFixed(2)}`;
}

function fmtTokens(n) {
	if (n == null) return "—";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
	return String(n);
}

// Filter raw cost records by the same range used for sessions.
function filterCostsByRange(records, range) {
	const now = new Date();
	const cutoff = {
		today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
		week: new Date(now - 7 * 86400000),
		month: new Date(now - 30 * 86400000),
		all: new Date(0),
	}[range];
	return records.filter((r) => new Date(r.ts) >= cutoff);
}

// Aggregate per-turn cost records into per-session summaries.
function aggregateBySessions(records) {
	const map = {};
	for (const r of records) {
		const sid = r.session_id || "unknown";
		if (!map[sid])
			map[sid] = {
				session_id: sid,
				total_cost: 0,
				input_tokens: 0,
				output_tokens: 0,
				cache_tokens: 0,
				turns: 0,
				last_ts: r.ts,
			};
		const s = map[sid];
		s.total_cost += r.estimated_cost_usd;
		s.input_tokens += r.input_tokens;
		s.output_tokens += r.output_tokens;
		s.cache_tokens += r.cache_read_tokens + r.cache_creation_tokens;
		s.turns += 1;
		if (r.ts > s.last_ts) s.last_ts = r.ts;
	}
	return Object.values(map).sort((a, b) => b.total_cost - a.total_cost);
}

// ── CostTrend ─────────────────────────────────────────────────────────────────
// Area chart of cost per day, using Ledger green.

function CostTrend({ records }) {
	const byDay = useMemo(() => {
		const map = {};
		for (const r of records) {
			const day = r.ts.slice(0, 10);
			if (!map[day]) map[day] = 0;
			map[day] += r.estimated_cost_usd;
		}
		return Object.entries(map)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([day, cost]) => ({ day, cost }));
	}, [records]);

	if (byDay.length < 2) return null;

	const w = 480,
		h = 64,
		px = 8,
		py = 8;
	const maxCost = Math.max(...byDay.map((d) => d.cost), 0.01);
	const xs = byDay.map((_, i) => px + (i / (byDay.length - 1)) * (w - px * 2));
	const ys = byDay.map((d) => h - py - (d.cost / maxCost) * (h - py * 2));
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
				Cost over time
			</div>
			<svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
				<title>Cost over time</title>
				<defs>
					<linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={C.green} stopOpacity="0.3" />
						<stop offset="100%" stopColor={C.green} stopOpacity="0" />
					</linearGradient>
				</defs>
				<path d={area} fill="url(#cg)" />
				<path
					d={line}
					fill="none"
					stroke={C.green}
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				{xs.map((x, i) => (
					<circle key={byDay[i].day} cx={x} cy={ys[i]} r={3} fill={C.green} />
				))}
			</svg>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					marginTop: 4,
				}}
			>
				{[byDay[0], byDay[byDay.length - 1]].map((p) => (
					<span
						key={p.day}
						style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}
					>
						{new Date(`${p.day}T12:00:00`).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
						})}
					</span>
				))}
			</div>
		</div>
	);
}

// ── TopSessionsByCost ─────────────────────────────────────────────────────────
// Horizontal bar list of most expensive sessions.

function TopSessionsByCost({ sessions }) {
	if (sessions.length === 0) return null;
	const top = sessions.slice(0, 8);
	const maxCost = top[0].total_cost;

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
					marginBottom: 14,
				}}
			>
				Top Sessions by Cost
			</div>
			{top.map((s) => {
				const pct = maxCost > 0 ? (s.total_cost / maxCost) * 100 : 0;
				const sid =
					s.session_id === "unknown"
						? "unknown"
						: `${s.session_id.slice(0, 8)}…`;
				const date = s.last_ts.slice(0, 10);
				const total = s.input_tokens + s.output_tokens + s.cache_tokens;
				return (
					<div key={s.session_id} style={{ marginBottom: 9 }}>
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								marginBottom: 3,
							}}
						>
							<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
								<span
									style={{
										fontSize: 10,
										color: C.textSecondary,
										fontFamily: "monospace",
									}}
								>
									{sid}
								</span>
								<span style={{ fontSize: 9, color: C.textMuted }}>{date}</span>
								{s.turns > 1 && (
									<span style={{ fontSize: 9, color: C.textMuted }}>
										{s.turns} turns
									</span>
								)}
							</div>
							<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
								<span
									style={{
										fontSize: 9,
										color: C.textMuted,
										fontFamily: "monospace",
									}}
								>
									{fmtTokens(total)} tok
								</span>
								<span
									style={{
										fontSize: 10,
										color: C.green,
										fontFamily: "'JetBrains Mono', monospace",
										fontWeight: 600,
									}}
								>
									{fmtCost(s.total_cost)}
								</span>
							</div>
						</div>
						<div style={{ height: 3, borderRadius: 2, background: C.bg3 }}>
							<div
								style={{
									width: `${pct}%`,
									height: "100%",
									borderRadius: 2,
									background: C.green,
									transition: "width 0.4s ease",
								}}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ── TokenBreakdown ────────────────────────────────────────────────────────────
// Shows the input / output / cache token split as labelled proportion bars.

function TokenBreakdown({ records }) {
	const totals = useMemo(() => {
		let input = 0,
			output = 0,
			cache = 0;
		for (const r of records) {
			input += r.input_tokens;
			output += r.output_tokens;
			cache += r.cache_read_tokens + r.cache_creation_tokens;
		}
		return { input, output, cache, total: input + output + cache };
	}, [records]);

	if (totals.total === 0) return null;

	const bars = [
		{ label: "Input", value: totals.input, color: C.cyan },
		{ label: "Output", value: totals.output, color: C.pink },
		{ label: "Cache", value: totals.cache, color: C.yellow },
	].filter((b) => b.value > 0);

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
					marginBottom: 14,
				}}
			>
				Token Breakdown
			</div>

			{/* Stacked proportion bar */}
			<div
				style={{
					display: "flex",
					height: 8,
					borderRadius: 4,
					overflow: "hidden",
					marginBottom: 12,
				}}
			>
				{bars.map((b) => (
					<div
						key={b.label}
						style={{
							flex: b.value,
							background: b.color,
							opacity: 0.8,
						}}
					/>
				))}
			</div>

			{/* Legend */}
			<div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
				{bars.map((b) => {
					const pct =
						totals.total > 0 ? ((b.value / totals.total) * 100).toFixed(0) : 0;
					return (
						<div
							key={b.label}
							style={{ display: "flex", alignItems: "center", gap: 6 }}
						>
							<div
								style={{
									width: 8,
									height: 8,
									borderRadius: 2,
									background: b.color,
									opacity: 0.8,
								}}
							/>
							<span style={{ fontSize: 10, color: C.textSecondary }}>
								{b.label}
							</span>
							<span
								style={{
									fontSize: 10,
									color: C.textMuted,
									fontFamily: "monospace",
								}}
							>
								{fmtTokens(b.value)} ({pct}%)
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ── Friction trend ──────────────────────────────────────────────────────────
// Area chart of friction score per day.

function frictionColor(s) {
	if (s == null) return C.textMuted;
	if (s < 0.3) return C.green;
	if (s < 0.6) return C.yellow;
	return C.red;
}

function FrictionTrend({ sessions: filtered }) {
	const byDay = {};
	for (const s of filtered) {
		if (!s.start || s.friction == null) continue;
		const day = s.start.slice(0, 10);
		if (!byDay[day]) byDay[day] = [];
		byDay[day].push(s.friction.score);
	}
	const points = Object.entries(byDay)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([day, scores]) => ({
			day,
			avg: scores.reduce((a, b) => a + b, 0) / scores.length,
		}));

	if (points.length < 2) return null;

	const w = 480,
		h = 64,
		px = 8,
		py = 8;
	const maxY = 1.0,
		minY = 0;
	const xs = points.map(
		(_, i) => px + (i / (points.length - 1)) * (w - px * 2),
	);
	const ys = points.map(
		(p) => h - py - ((p.avg - minY) / (maxY - minY)) * (h - py * 2),
	);
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
				Friction over time
			</div>
			<svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
				<title>Friction over time</title>
				<defs>
					<linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={C.yellow} stopOpacity="0.3" />
						<stop offset="100%" stopColor={C.yellow} stopOpacity="0" />
					</linearGradient>
				</defs>
				<path d={area} fill="url(#fg)" />
				<path
					d={line}
					fill="none"
					stroke={C.yellow}
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				{xs.map((x, i) => (
					<circle
						key={points[i].day}
						cx={x}
						cy={ys[i]}
						r={3}
						fill={frictionColor(points[i].avg)}
					/>
				))}
			</svg>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					marginTop: 4,
				}}
			>
				{[points[0], points[points.length - 1]].map((p) => (
					<span
						key={p.day}
						style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}
					>
						{new Date(`${p.day}T12:00:00`).toLocaleDateString("en-US", {
							month: "short",
							day: "numeric",
						})}
					</span>
				))}
			</div>
		</div>
	);
}

// ── Signal breakdown bar ────────────────────────────────────────────────────
// Stacked proportion bar showing which friction signals contribute most.

function SignalBreakdown({ sessions: filtered }) {
	const totals = useMemo(() => {
		let oracle = 0,
			guard = 0,
			tribunal = 0,
			retry = 0;
		for (const s of filtered) {
			if (!s.friction) continue;
			const sig = s.friction.signals;
			oracle += sig.oracle.count;
			guard += sig.guard.count;
			tribunal += sig.tribunal.count;
			retry += sig.retry.count;
		}
		return {
			oracle,
			guard,
			tribunal,
			retry,
			total: oracle + guard + tribunal + retry,
		};
	}, [filtered]);

	if (totals.total === 0) return null;

	const bars = [
		{ label: "Oracle", value: totals.oracle, color: "#818cf8" },
		{ label: "Guard", value: totals.guard, color: "#fb923c" },
		{ label: "Tribunal", value: totals.tribunal, color: C.pink },
		{ label: "Retries", value: totals.retry, color: C.cyan },
	].filter((b) => b.value > 0);

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
					marginBottom: 14,
				}}
			>
				Friction Signal Breakdown
			</div>
			<div
				style={{
					display: "flex",
					height: 8,
					borderRadius: 4,
					overflow: "hidden",
					marginBottom: 12,
				}}
			>
				{bars.map((b) => (
					<div
						key={b.label}
						style={{ flex: b.value, background: b.color, opacity: 0.8 }}
					/>
				))}
			</div>
			<div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
				{bars.map((b) => {
					const pct = ((b.value / totals.total) * 100).toFixed(0);
					return (
						<div
							key={b.label}
							style={{ display: "flex", alignItems: "center", gap: 6 }}
						>
							<div
								style={{
									width: 8,
									height: 8,
									borderRadius: 2,
									background: b.color,
									opacity: 0.8,
								}}
							/>
							<span style={{ fontSize: 10, color: C.textSecondary }}>
								{b.label}
							</span>
							<span
								style={{
									fontSize: 10,
									color: C.textMuted,
									fontFamily: "monospace",
								}}
							>
								{b.value} ({pct}%)
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ── Plugin Performance components ───────────────────────────────────────────

function computePluginCostShare(events, totalCost) {
	const counts = {};
	let total = 0;
	for (const e of events) {
		const p = e.plugin ?? "unknown";
		counts[p] = (counts[p] ?? 0) + 1;
		total++;
	}
	if (total === 0) return [];
	return Object.entries(counts)
		.map(([plugin, eventCount]) => ({
			plugin,
			eventCount,
			costShare: totalCost * (eventCount / total),
			percentage: (eventCount / total) * 100,
		}))
		.sort((a, b) => b.costShare - a.costShare);
}

function computePluginROI(events, totalCost) {
	const counts = {};
	let totalEvents = 0;
	for (const e of events) {
		const p = e.plugin ?? "unknown";
		if (!counts[p])
			counts[p] = { total: 0, catches: 0, warn: 0, fail: 0, block: 0 };
		counts[p].total++;
		totalEvents++;
		if (e.status === "warn") {
			counts[p].catches++;
			counts[p].warn++;
		}
		if (e.status === "fail") {
			counts[p].catches++;
			counts[p].fail++;
		}
		if (e.status === "block") {
			counts[p].catches++;
			counts[p].block++;
		}
	}
	return Object.entries(counts)
		.filter(([, v]) => v.catches > 0)
		.map(([plugin, v]) => {
			const pluginCost =
				totalEvents > 0 ? totalCost * (v.total / totalEvents) : 0;
			return {
				plugin,
				catches: v.catches,
				costPerCatch: v.catches > 0 ? pluginCost / v.catches : 0,
				catchTypes: { warn: v.warn, fail: v.fail, block: v.block },
			};
		})
		.sort((a, b) => b.catches - a.catches);
}

function PluginCostDonut({ shares, totalCost }) {
	if (shares.length === 0) return null;
	const r = 50,
		cx = 60,
		cy = 60,
		sw = 16;
	const circumference = 2 * Math.PI * r;
	let accumulated = 0;

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
					marginBottom: 12,
				}}
			>
				Cost Share by Plugin
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 24 }}>
				<svg viewBox="0 0 120 120" width={120} height={120}>
					<title>Cost share by plugin</title>
					{shares.map((s) => {
						const segLen = (s.percentage / 100) * circumference;
						const offset = -accumulated;
						accumulated += segLen;
						return (
							<circle
								key={s.plugin}
								cx={cx}
								cy={cy}
								r={r}
								fill="none"
								stroke={pluginColor(s.plugin)}
								strokeWidth={sw}
								strokeDasharray={`${segLen} ${circumference - segLen}`}
								strokeDashoffset={offset}
								transform={`rotate(-90 ${cx} ${cy})`}
								style={{ transition: "all 0.4s" }}
							/>
						);
					})}
					<text
						x={cx}
						y={cy - 4}
						textAnchor="middle"
						fill={C.textPrimary}
						fontSize="14"
						fontWeight="700"
						fontFamily="'JetBrains Mono', monospace"
					>
						{fmtCost(totalCost)}
					</text>
					<text
						x={cx}
						y={cy + 10}
						textAnchor="middle"
						fill={C.textMuted}
						fontSize="8"
						fontFamily="monospace"
					>
						estimated
					</text>
				</svg>
				<div
					style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}
				>
					{shares.slice(0, 8).map((s) => (
						<div
							key={s.plugin}
							style={{ display: "flex", alignItems: "center", gap: 6 }}
						>
							<div
								style={{
									width: 8,
									height: 8,
									borderRadius: 2,
									background: pluginColor(s.plugin),
									flexShrink: 0,
								}}
							/>
							<span style={{ fontSize: 10, color: C.textSecondary, flex: 1 }}>
								{s.plugin}
							</span>
							<span
								style={{
									fontSize: 10,
									color: C.textMuted,
									fontFamily: "monospace",
								}}
							>
								{fmtCost(s.costShare)} ({s.percentage.toFixed(0)}%)
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function PluginROICards({ roi }) {
	if (roi.length === 0) return null;

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
					marginBottom: 12,
				}}
			>
				Quality ROI
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{roi.slice(0, 6).map((r) => (
					<div
						key={r.plugin}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							padding: "8px 10px",
							borderRadius: 6,
							background: C.bg3,
						}}
					>
						<div
							style={{
								width: 8,
								height: 8,
								borderRadius: 2,
								background: pluginColor(r.plugin),
								flexShrink: 0,
							}}
						/>
						<span style={{ fontSize: 11, color: C.textPrimary, flex: 1 }}>
							<strong>{r.plugin}</strong> caught {r.catches} issue
							{r.catches !== 1 ? "s" : ""}
							{r.costPerCatch > 0
								? ` at ~${fmtCost(r.costPerCatch)} per catch`
								: ""}
						</span>
						<div
							style={{
								display: "flex",
								gap: 6,
								fontSize: 9,
								color: C.textMuted,
							}}
						>
							{r.catchTypes.block > 0 && (
								<span style={{ color: C.red }}>{r.catchTypes.block} block</span>
							)}
							{r.catchTypes.fail > 0 && (
								<span style={{ color: C.red }}>{r.catchTypes.fail} fail</span>
							)}
							{r.catchTypes.warn > 0 && (
								<span style={{ color: C.yellow }}>
									{r.catchTypes.warn} warn
								</span>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Budget Forecasting ──────────────────────────────────────────────────────
// Weekly/monthly cost projection and time-of-day heatmap.

function CostProjection({ records }) {
	const projection = useMemo(() => {
		if (records.length < 2) return null;

		// Group by day
		const byDay = {};
		for (const r of records) {
			const day = r.ts.slice(0, 10);
			byDay[day] = (byDay[day] ?? 0) + r.estimated_cost_usd;
		}
		const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
		if (days.length < 2) return null;

		// Last 7 days average daily cost
		const last7 = days.slice(-7);
		const avgDaily = last7.reduce((s, [, c]) => s + c, 0) / last7.length;
		const weekProjection = avgDaily * 7;
		const monthProjection = avgDaily * 30;

		return { avgDaily, weekProjection, monthProjection, dayCount: days.length };
	}, [records]);

	if (!projection) return null;

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
					marginBottom: 12,
				}}
			>
				Cost Projection
			</div>
			<div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
				<div>
					<div style={{ fontSize: 9, color: C.textMuted, marginBottom: 2 }}>
						Avg / Day
					</div>
					<div
						style={{
							fontSize: 16,
							fontWeight: 700,
							color: C.green,
							fontFamily: "'JetBrains Mono', monospace",
						}}
					>
						{fmtCost(projection.avgDaily)}
					</div>
				</div>
				<div>
					<div style={{ fontSize: 9, color: C.textMuted, marginBottom: 2 }}>
						Week Projection
					</div>
					<div
						style={{
							fontSize: 16,
							fontWeight: 700,
							color: C.textPrimary,
							fontFamily: "'JetBrains Mono', monospace",
						}}
					>
						{fmtCost(projection.weekProjection)}
					</div>
				</div>
				<div>
					<div style={{ fontSize: 9, color: C.textMuted, marginBottom: 2 }}>
						Month Projection
					</div>
					<div
						style={{
							fontSize: 16,
							fontWeight: 700,
							color: C.textPrimary,
							fontFamily: "'JetBrains Mono', monospace",
						}}
					>
						{fmtCost(projection.monthProjection)}
					</div>
				</div>
			</div>
			<div
				style={{
					fontSize: 9,
					color: C.textMuted,
					marginTop: 8,
					fontFamily: "monospace",
				}}
			>
				Based on {projection.dayCount}-day average
			</div>
		</div>
	);
}

function CostByHour({ records }) {
	const heatmap = useMemo(() => {
		const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
		const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

		for (const r of records) {
			const d = new Date(r.ts);
			const dow = d.getDay(); // 0=Sun
			const hour = d.getHours();
			grid[dow][hour] += r.estimated_cost_usd;
			counts[dow][hour]++;
		}
		return { grid, counts };
	}, [records]);

	if (records.length < 5) return null;

	const maxCost = Math.max(...heatmap.grid.flat(), 0.001);
	const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
					marginBottom: 12,
				}}
			>
				Cost by Time of Day
			</div>

			{/* Hour labels */}
			<div style={{ display: "flex", marginLeft: 32, marginBottom: 2 }}>
				{[
					0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
					20, 21, 22, 23,
				].map((h) => (
					<div
						key={`hour-label-${h}`}
						style={{
							flex: 1,
							fontSize: 7,
							color: C.textMuted,
							textAlign: "center",
							fontFamily: "monospace",
						}}
					>
						{h % 6 === 0 ? h : ""}
					</div>
				))}
			</div>

			{/* Grid */}
			{days.map((day, dow) => (
				<div
					key={day}
					style={{ display: "flex", alignItems: "center", marginBottom: 1 }}
				>
					<span
						style={{
							width: 28,
							fontSize: 8,
							color: C.textMuted,
							fontFamily: "monospace",
							textAlign: "right",
							marginRight: 4,
						}}
					>
						{day}
					</span>
					<div style={{ display: "flex", flex: 1, gap: 1 }}>
						{[
							0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
							19, 20, 21, 22, 23,
						].map((hour) => {
							const cost = heatmap.grid[dow][hour];
							const intensity = maxCost > 0 ? cost / maxCost : 0;
							const bg =
								intensity === 0
									? C.bg3
									: `rgba(74, 222, 128, ${0.15 + intensity * 0.75})`;
							return (
								<div
									key={`${day}-${hour}`}
									title={`${day} ${hour}:00 — ${fmtCost(cost)} (${heatmap.counts[dow][hour]} sessions)`}
									style={{
										flex: 1,
										height: 12,
										borderRadius: 2,
										background: bg,
										cursor: "default",
									}}
								/>
							);
						})}
					</div>
				</div>
			))}

			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					marginTop: 8,
					fontSize: 9,
					color: C.textMuted,
				}}
			>
				<span>Darker = higher cost</span>
				<span>Hover cells for details</span>
			</div>
		</div>
	);
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function Metrics({ sessions }) {
	const [range, setRange] = useState("week");
	const { records: allCostRecords } = useCostData();

	const filtered = useMemo(
		() => filterByRange(sessions, range),
		[sessions, range],
	);
	const allEvents = useMemo(
		() => filtered.flatMap((s) => s.events ?? []),
		[filtered],
	);

	const avgScore = useMemo(() => {
		const scores = filtered
			.filter((s) => s.avgScore != null)
			.map((s) => s.avgScore);
		return scores.length
			? scores.reduce((a, b) => a + b, 0) / scores.length
			: null;
	}, [filtered]);

	const totalBlocks = useMemo(
		() => allEvents.filter((e) => e.status === "block").length,
		[allEvents],
	);

	const _totalWarns = useMemo(
		() =>
			allEvents.filter((e) => e.status === "warn" || e.status === "fail")
				.length,
		[allEvents],
	);

	// Cost data filtered to the same range
	const costRecords = useMemo(
		() => filterCostsByRange(allCostRecords, range),
		[allCostRecords, range],
	);
	const costSessions = useMemo(
		() => aggregateBySessions(costRecords),
		[costRecords],
	);
	const totalCost = useMemo(
		() => costRecords.reduce((s, r) => s + r.estimated_cost_usd, 0),
		[costRecords],
	);
	const avgCostPerSes =
		costSessions.length > 0 ? totalCost / costSessions.length : null;

	return (
		<div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
			{/* Header + range selector */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 18,
				}}
			>
				<span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
					Metrics
				</span>
				<div style={{ display: "flex", gap: 2 }}>
					{RANGES.map((r) => (
						<button
							type="button"
							key={r.id}
							onClick={() => setRange(r.id)}
							style={{
								fontSize: 10,
								padding: "4px 10px",
								borderRadius: 5,
								cursor: "pointer",
								border: `1px solid ${range === r.id ? C.pink : C.border}`,
								background: range === r.id ? `${C.pink}15` : "transparent",
								color: range === r.id ? C.pink : C.textMuted,
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
				<StatCard
					label="Avg Score"
					value={avgScore?.toFixed(2) ?? "—"}
					color={scoreColor(avgScore)}
				/>
				<StatCard label="Sessions" value={filtered.length} />
				<StatCard label="Total Events" value={allEvents.length} />
				<StatCard
					label="Blocks"
					value={totalBlocks}
					color={totalBlocks > 0 ? C.red : C.green}
				/>
			</div>

			{/* Score sparkline */}
			<ScoreSparkline sessions={filtered} />

			{/* ── Cost section ──────────────────────────────────────────────────── */}
			{costRecords.length > 0 && (
				<>
					{/* Cost summary divider */}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							marginBottom: 14,
						}}
					>
						<div
							style={{
								fontSize: 10,
								color: C.textMuted,
								letterSpacing: "0.07em",
								textTransform: "uppercase",
								fontFamily: "monospace",
								whiteSpace: "nowrap",
							}}
						>
							Cost
						</div>
						<div style={{ flex: 1, height: 1, background: C.border }} />
						<span
							style={{
								fontSize: 9,
								color: C.textMuted,
								fontFamily: "monospace",
							}}
						>
							via Ledger
						</span>
					</div>

					{/* Cost summary cards */}
					<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
						<StatCard
							label="Total Cost"
							value={fmtCost(totalCost)}
							color={totalCost > 5 ? C.red : totalCost > 1 ? C.yellow : C.green}
						/>
						<StatCard
							label="Avg / Session"
							value={fmtCost(avgCostPerSes)}
							color={C.green}
						/>
						<StatCard
							label="Most Expensive"
							value={fmtCost(costSessions[0]?.total_cost)}
							color={C.textSecondary}
						/>
						<StatCard label="Sessions w/ Cost" value={costSessions.length} />
					</div>

					{/* Cost trend */}
					<CostTrend records={costRecords} />

					{/* Budget forecasting */}
					<CostProjection records={costRecords} />
					<CostByHour records={costRecords} />

					{/* Token breakdown */}
					<TokenBreakdown records={costRecords} />

					{/* Top sessions by cost */}
					<TopSessionsByCost sessions={costSessions} />
				</>
			)}

			{/* ── Friction section ──────────────────────────────────────────────── */}
			{filtered.some((s) => s.friction != null) &&
				(() => {
					const frictionSessions = filtered.filter((s) => s.friction != null);
					const avgFriction =
						frictionSessions.length > 0
							? frictionSessions.reduce((s, f) => s + f.friction.score, 0) /
								frictionSessions.length
							: null;
					const maxFriction =
						frictionSessions.length > 0
							? Math.max(...frictionSessions.map((s) => s.friction.score))
							: null;
					const highFriction = frictionSessions.filter(
						(s) => s.friction.score > 0.5,
					).length;

					return (
						<>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									marginBottom: 14,
								}}
							>
								<div
									style={{
										fontSize: 10,
										color: C.textMuted,
										letterSpacing: "0.07em",
										textTransform: "uppercase",
										fontFamily: "monospace",
										whiteSpace: "nowrap",
									}}
								>
									Friction
								</div>
								<div style={{ flex: 1, height: 1, background: C.border }} />
							</div>

							<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
								<StatCard
									label="Avg Friction"
									value={avgFriction?.toFixed(2) ?? "—"}
									color={frictionColor(avgFriction)}
								/>
								<StatCard
									label="Peak Friction"
									value={maxFriction?.toFixed(2) ?? "—"}
									color={frictionColor(maxFriction)}
								/>
								<StatCard
									label="Sessions > 0.5"
									value={highFriction}
									color={highFriction > 0 ? C.red : C.green}
								/>
							</div>

							<FrictionTrend sessions={filtered} />
							<SignalBreakdown sessions={filtered} />
						</>
					);
				})()}

			{/* ── Plugin Performance section ────────────────────────────────────── */}
			{allEvents.length > 0 &&
				totalCost > 0 &&
				(() => {
					const shares = computePluginCostShare(allEvents, totalCost);
					const roi = computePluginROI(allEvents, totalCost);

					return (
						<>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									marginBottom: 14,
								}}
							>
								<div
									style={{
										fontSize: 10,
										color: C.textMuted,
										letterSpacing: "0.07em",
										textTransform: "uppercase",
										fontFamily: "monospace",
										whiteSpace: "nowrap",
									}}
								>
									Plugin Performance
								</div>
								<div style={{ flex: 1, height: 1, background: C.border }} />
								<span
									style={{
										fontSize: 9,
										color: C.textMuted,
										fontFamily: "monospace",
									}}
								>
									estimated
								</span>
							</div>

							<PluginCostDonut shares={shares} totalCost={totalCost} />
							<PluginROICards roi={roi} />
						</>
					);
				})()}

			{/* ── Quality section ───────────────────────────────────────────────── */}
			{allEvents.length > 0 && (
				<>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							marginBottom: 14,
						}}
					>
						<div
							style={{
								fontSize: 10,
								color: C.textMuted,
								letterSpacing: "0.07em",
								textTransform: "uppercase",
								fontFamily: "monospace",
								whiteSpace: "nowrap",
							}}
						>
							Quality
						</div>
						<div style={{ flex: 1, height: 1, background: C.border }} />
					</div>

					{/* Plugin activity grouped by category */}
					<PluginActivity allEvents={allEvents} />

					{/* Top flagged patterns */}
					<FlaggedPatterns allEvents={allEvents} />
				</>
			)}

			{filtered.length === 0 && costRecords.length === 0 && (
				<div
					style={{
						textAlign: "center",
						padding: "40px 0",
						color: C.textMuted,
						fontSize: 12,
					}}
				>
					No sessions in this time range
				</div>
			)}
		</div>
	);
}
