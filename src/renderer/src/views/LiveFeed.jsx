// Live Feed view — real-time event stream from ~/.claude/onlooker/**/*.jsonl

import { useEffect, useMemo, useRef, useState } from "react";
import TurnCard from "../components/TurnCard.jsx";
import { groupIntoTurns } from "../hooks/useOnlooker.js";
import {
	PLUGIN_COLORS,
	PLUGIN_IDS,
	PLUGIN_LABELS,
	STATUS_COLORS,
	STATUSES,
} from "../plugins.js";

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

const PLUGINS = PLUGIN_IDS;

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
				flexShrink: 0,
			}}
		>
			{PLUGIN_LABELS[plugin] ?? plugin?.toUpperCase()}
		</span>
	);
}

function EventRow({ event, expanded, onToggle }) {
	const statusColor = STATUS_COLORS[event.status] ?? C.textMuted;
	const hasMeta = event.meta && Object.keys(event.meta).length > 0;

	const inner = (
		<>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				{/* Status dot */}
				<div
					style={{
						width: 6,
						height: 6,
						borderRadius: "50%",
						flexShrink: 0,
						background: statusColor,
						boxShadow: `0 0 5px ${statusColor}88`,
					}}
				/>

				<PluginBadge plugin={event.plugin} />

				<span
					style={{
						fontSize: 11,
						color: C.textSecondary,
						fontWeight: 500,
						flex: 1,
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{event.label}
				</span>

				<span
					style={{
						fontSize: 10,
						color: C.textMuted,
						fontFamily: "monospace",
						flexShrink: 0,
					}}
				>
					{formatTime(event.ts)}
				</span>

				{hasMeta && (
					<span style={{ fontSize: 9, color: C.textMuted, flexShrink: 0 }}>
						{expanded ? "▲" : "▼"}
					</span>
				)}
			</div>

			{event.detail && (
				<div
					style={{
						fontSize: 10,
						fontFamily: "monospace",
						marginTop: 2,
						marginLeft: 14,
						paddingLeft: 20,
						color:
							event.status === "fail" || event.status === "block"
								? C.red
								: C.textMuted,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{event.detail}
				</div>
			)}

			{/* Expanded raw meta */}
			{expanded && hasMeta && (
				<div
					style={{
						marginTop: 8,
						marginLeft: 14,
						paddingLeft: 20,
						padding: "8px 10px",
						background: C.bg0,
						borderRadius: 6,
						border: `1px solid ${C.border}`,
						fontSize: 10,
						fontFamily: "monospace",
						color: C.cyan,
						lineHeight: 1.6,
					}}
				>
					{JSON.stringify(event.meta, null, 2)}
				</div>
			)}
		</>
	);

	const sharedStyle = {
		padding: "6px 20px",
		transition: "background 0.1s",
		borderBottom: expanded ? `1px solid ${C.border}` : "none",
	};

	if (hasMeta) {
		return (
			<button
				type="button"
				onClick={onToggle}
				style={{
					display: "block",
					width: "100%",
					textAlign: "left",
					border: "none",
					background: "none",
					font: "inherit",
					color: "inherit",
					cursor: "pointer",
					...sharedStyle,
				}}
				onMouseEnter={(e) => (e.currentTarget.style.background = C.bg2)}
				onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
			>
				{inner}
			</button>
		);
	}

	return <div style={{ cursor: "default", ...sharedStyle }}>{inner}</div>;
}

function SessionDivider({ sessionId, ts }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "8px 20px",
				margin: "4px 0",
			}}
		>
			<div style={{ flex: 1, height: 1, background: C.border }} />
			<span
				style={{
					fontSize: 9,
					color: C.textMuted,
					fontFamily: "monospace",
					flexShrink: 0,
					letterSpacing: "0.05em",
				}}
			>
				{sessionId} · {formatTime(ts)}
			</span>
			<div style={{ flex: 1, height: 1, background: C.border }} />
		</div>
	);
}

function EmptyState() {
	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				color: C.textMuted,
				gap: 12,
			}}
		>
			<div style={{ fontSize: 32 }}>⚡</div>
			<div style={{ fontSize: 14, color: C.textSecondary }}>
				Waiting for events
			</div>
			<div
				style={{
					fontSize: 12,
					textAlign: "center",
					lineHeight: 1.6,
					maxWidth: 260,
				}}
			>
				Start a Claude Code session to see live hook events here.
			</div>
			<a
				href="https://onlooker.dev/docs/setup"
				target="_blank"
				rel="noopener noreferrer"
				style={{ fontSize: 11, color: C.pink, textDecoration: "none" }}
			>
				View setup guide →
			</a>
		</div>
	);
}

export default function LiveFeed({ events, active }) {
	const [paused, setPaused] = useState(false);
	const [viewMode, setViewMode] = useState("flat"); // "flat" | "turns"
	const [pluginFilter, setPluginFilter] = useState(new Set(PLUGINS));
	const [statusFilter, setStatusFilter] = useState(new Set(STATUSES));
	const [search, setSearch] = useState("");
	const [expandedIndex, setExpandedIndex] = useState(null);
	const [displayEvents, setDisplayEvents] = useState([]);
	const endRef = useRef(null);
	const scrollRef = useRef(null);
	const pauseRef = useRef(false);

	// Keep a stable display list when paused
	useEffect(() => {
		pauseRef.current = paused;
	}, [paused]);

	useEffect(() => {
		if (!paused) setDisplayEvents(events);
	}, [events, paused]);

	// Auto-scroll unless paused
	useEffect(() => {
		if (!paused) endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [paused]);

	// Filter — unknown plugin/status values pass through so events are never
	// silently dropped just because a new plugin name isn't in our hardcoded list.
	// If the plugin isn't in our known set we treat it as active (show it).
	const filtered = displayEvents.filter((e) => {
		const knownPlugin = PLUGINS.includes(e.plugin);
		if (knownPlugin && !pluginFilter.has(e.plugin)) return false;
		const knownStatus = STATUSES.includes(e.status);
		if (knownStatus && !statusFilter.has(e.status)) return false;
		if (
			search &&
			!`${e.label ?? ""} ${e.detail ?? ""}`
				.toLowerCase()
				.includes(search.toLowerCase())
		)
			return false;
		return true;
	});

	// Build turn structure from filtered events (memoised)
	const turns = useMemo(
		() => (viewMode === "turns" ? groupIntoTurns(filtered) : []),
		[filtered, viewMode],
	);

	// Insert session boundary markers (flat view)
	const rows = [];
	let lastSession = null;
	for (const [i, e] of filtered.entries()) {
		if (e.session && e.session !== lastSession) {
			rows.push({
				type: "divider",
				sessionId: e.session,
				ts: e.ts,
				key: `div_${e.session}_${i}`,
			});
			lastSession = e.session;
		}
		// Use index as tiebreaker so key is always unique even if ts/plugin/label are missing
		rows.push({
			type: "event",
			event: e,
			key: `evt_${i}_${e.ts ?? ""}_${e.plugin ?? ""}`,
		});
	}

	function togglePlugin(p) {
		setPluginFilter((prev) => {
			const next = new Set(prev);
			next.has(p) ? next.delete(p) : next.add(p);
			return next;
		});
	}

	function toggleStatus(s) {
		setStatusFilter((prev) => {
			const next = new Set(prev);
			next.has(s) ? next.delete(s) : next.add(s);
			return next;
		});
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				minHeight: 0,
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: "14px 20px 10px",
					borderBottom: `1px solid ${C.border}`,
					background: C.bg1,
					flexShrink: 0,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginBottom: 10,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<div
							style={{
								width: 7,
								height: 7,
								borderRadius: "50%",
								background: active ? C.green : C.textMuted,
								boxShadow: active ? `0 0 7px ${C.green}` : "none",
								animation: active ? "pulse 2s infinite" : "none",
							}}
						/>
						<span
							style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}
						>
							Live Feed
						</span>
					</div>
					<span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4 }}>
						{events.length} events
					</span>
					<div style={{ flex: 1 }} />
					<div
						style={{
							display: "inline-flex",
							borderRadius: 5,
							overflow: "hidden",
							border: `1px solid ${C.border}`,
						}}
					>
						{[
							["flat", "Flat"],
							["turns", "Turns"],
						].map(([mode, label]) => (
							<button
								type="button"
								key={mode}
								onClick={() => setViewMode(mode)}
								style={{
									fontSize: 10,
									padding: "3px 9px",
									border: "none",
									borderRight:
										mode === "flat" ? `1px solid ${C.border}` : "none",
									background: viewMode === mode ? `${C.pink}20` : "transparent",
									color: viewMode === mode ? C.pink : C.textMuted,
									cursor: "pointer",
									fontFamily: "monospace",
									transition: "all 0.15s",
								}}
							>
								{label}
							</button>
						))}
					</div>
					<button
						type="button"
						onClick={() => setPaused((p) => !p)}
						style={{
							fontSize: 10,
							padding: "3px 9px",
							borderRadius: 5,
							border: `1px solid ${paused ? C.yellow : C.border}`,
							background: paused ? `${C.yellow}18` : "transparent",
							color: paused ? C.yellow : C.textMuted,
							cursor: "pointer",
							fontFamily: "monospace",
							transition: "all 0.15s",
						}}
					>
						{paused ? "▶ Resume" : "⏸ Pause"}
					</button>
				</div>

				{/* Filter row */}
				<div
					style={{
						display: "flex",
						gap: 6,
						flexWrap: "wrap",
						alignItems: "center",
					}}
				>
					{PLUGINS.map((p) => (
						<FilterChip
							key={p}
							label={PLUGIN_LABELS[p]}
							active={pluginFilter.has(p)}
							color={PLUGIN_COLORS[p]}
							onClick={() => togglePlugin(p)}
						/>
					))}
					<div
						style={{
							width: 1,
							height: 14,
							background: C.border,
							margin: "0 2px",
						}}
					/>
					{STATUSES.map((s) => (
						<FilterChip
							key={s}
							label={s}
							active={statusFilter.has(s)}
							color={STATUS_COLORS[s]}
							onClick={() => toggleStatus(s)}
						/>
					))}
					<div style={{ flex: 1 }} />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search events…"
						style={{
							fontSize: 11,
							padding: "3px 8px",
							borderRadius: 5,
							border: `1px solid ${C.border}`,
							background: C.bg2,
							color: C.textPrimary,
							outline: "none",
							fontFamily: "inherit",
							width: 140,
						}}
					/>
				</div>
			</div>

			{/* Event list */}
			{displayEvents.length === 0 ? (
				<EmptyState />
			) : filtered.length === 0 ? (
				<div
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						color: "#475569",
						gap: 8,
					}}
				>
					<div style={{ fontSize: 13, color: "#94a3b8" }}>
						No events match the current filters
					</div>
					<div style={{ fontSize: 11 }}>
						{displayEvents.length} events hidden by filters
					</div>
				</div>
			) : (
				<div style={{ flex: 1, minHeight: 0, position: "relative" }}>
					{viewMode === "turns" ? (
						<div
							ref={scrollRef}
							style={{
								position: "absolute",
								inset: 0,
								overflowY: "auto",
								padding: "8px 12px",
							}}
						>
							{turns.map((t) => (
								<TurnCard
									key={`turn-${t.turn}-${t.start}`}
									turn={t}
									defaultExpanded={t.inProgress}
								/>
							))}
							{turns.length === 0 && (
								<div
									style={{
										padding: 20,
										textAlign: "center",
										color: C.textMuted,
										fontSize: 12,
									}}
								>
									No turn structure detected — events may lack turn data
								</div>
							)}
							<div ref={endRef} />
						</div>
					) : (
						<div
							ref={scrollRef}
							style={{
								position: "absolute",
								inset: 0,
								overflowY: "auto",
								paddingBottom: 8,
							}}
						>
							{rows.map((row, i) =>
								row.type === "divider" ? (
									<SessionDivider
										key={row.key}
										sessionId={row.sessionId}
										ts={row.ts}
									/>
								) : (
									<EventRow
										key={row.key}
										event={row.event}
										expanded={expandedIndex === i}
										onToggle={() =>
											setExpandedIndex(expandedIndex === i ? null : i)
										}
									/>
								),
							)}
							<div ref={endRef} />
						</div>
					)}
					<ScrollJumpButtons scrollRef={scrollRef} />
				</div>
			)}
		</div>
	);
}

function ScrollJumpButtons({ scrollRef }) {
	return (
		<div
			style={{
				position: "absolute",
				bottom: 14,
				right: 14,
				zIndex: 10,
				display: "flex",
				flexDirection: "column",
				gap: 3,
				pointerEvents: "none", // let children handle clicks
			}}
		>
			{[
				["↑", 0, "Jump to top"],
				["↓", null, "Jump to bottom"],
			].map(([arrow, top, title]) => (
				<button
					type="button"
					key={title}
					title={title}
					onClick={() =>
						scrollRef.current?.scrollTo({
							top: top ?? scrollRef.current.scrollHeight,
							behavior: "smooth",
						})
					}
					style={{
						width: 24,
						height: 24,
						pointerEvents: "auto",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 5,
						border: `1px solid ${C.border}`,
						background: `${C.bg2}e8`,
						color: C.textMuted,
						fontSize: 11,
						cursor: "pointer",
						transition: "color 0.15s, border-color 0.15s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = C.textPrimary;
						e.currentTarget.style.borderColor = C.borderAccent;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = C.textMuted;
						e.currentTarget.style.borderColor = C.border;
					}}
				>
					{arrow}
				</button>
			))}
		</div>
	);
}

function FilterChip({ label, active, color, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				fontSize: 9,
				padding: "2px 7px",
				borderRadius: 4,
				cursor: "pointer",
				border: `1px solid ${active ? `${color}66` : C.border}`,
				background: active ? `${color}15` : "transparent",
				color: active ? color : C.textMuted,
				fontFamily: "'JetBrains Mono', monospace",
				letterSpacing: "0.05em",
				transition: "all 0.15s",
			}}
		>
			{label}
		</button>
	);
}

function formatTime(ts) {
	if (!ts) return "";
	return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}
