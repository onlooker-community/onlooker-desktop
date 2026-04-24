// Session Replay — scrubber-based timeline replay of complete sessions.
// Step through turns and tool calls chronologically with playback controls.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLUGIN_LABELS, pluginColor, STATUS_COLORS } from "../plugins.js";

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

function scoreColor(s) {
	if (s == null) return C.textMuted;
	if (s >= 0.85) return C.green;
	if (s >= 0.7) return C.yellow;
	return C.red;
}

function fmtCost(n) {
	if (n == null || Number.isNaN(n)) return "—";
	if (n < 0.005) return "<$0.01";
	return `$${n.toFixed(2)}`;
}

function formatTime(ts) {
	return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

function formatDuration(startTs, endTs) {
	if (!startTs || !endTs) return "—";
	const ms = new Date(endTs) - new Date(startTs);
	const mins = Math.floor(ms / 60000);
	const secs = Math.round((ms % 60000) / 1000);
	return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ── Session picker ──────────────────────────────────────────────────────────

function SessionPicker({ sessions, selected, onSelect }) {
	return (
		<div
			style={{
				width: 220,
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
				Select Session
			</div>
			<div style={{ flex: 1, overflowY: "auto" }}>
				{sessions.slice(0, 50).map((s) => {
					const isSelected = selected === s.id;
					return (
						<button
							key={s.id}
							type="button"
							onClick={() => onSelect(s.id)}
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
									fontSize: 9,
									color: C.textMuted,
									fontFamily: "monospace",
									marginBottom: 3,
								}}
							>
								{s.id?.slice(0, 14)}…
							</div>
							<div style={{ fontSize: 10, color: C.textSecondary }}>
								{s.start
									? new Date(s.start).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
										})
									: ""}{" "}
								· {s.events?.length ?? 0} events
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ── Playback controls ───────────────────────────────────────────────────────

function PlaybackControls({
	position,
	total,
	playing,
	speed,
	onSeek,
	onToggle,
	onSpeed,
	onStep,
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "10px 16px",
				background: C.bg2,
				borderBottom: `1px solid ${C.border}`,
			}}
		>
			{/* Step back */}
			<button
				type="button"
				onClick={() => onStep(-1)}
				title="Previous event"
				style={{
					fontSize: 12,
					border: "none",
					background: "transparent",
					color: C.textSecondary,
					cursor: "pointer",
					padding: "2px 6px",
				}}
			>
				⏮
			</button>

			{/* Play/pause */}
			<button
				onClick={onToggle}
				type="button"
				title={playing ? "Pause" : "Play"}
				style={{
					fontSize: 14,
					border: `1px solid ${C.border}`,
					borderRadius: 6,
					background: playing ? `${C.pink}22` : "transparent",
					color: playing ? C.pink : C.textSecondary,
					cursor: "pointer",
					padding: "4px 10px",
					width: 36,
				}}
			>
				{playing ? "⏸" : "▶"}
			</button>

			{/* Step forward */}
			<button
				onClick={() => onStep(1)}
				type="button"
				title="Next event"
				style={{
					fontSize: 12,
					border: "none",
					background: "transparent",
					color: C.textSecondary,
					cursor: "pointer",
					padding: "2px 6px",
				}}
			>
				⏭
			</button>

			{/* Scrubber */}
			<input
				type="range"
				min={0}
				max={Math.max(total - 1, 0)}
				value={position}
				onChange={(e) => onSeek(Number(e.target.value))}
				style={{ flex: 1, accentColor: C.pink }}
			/>

			{/* Position indicator */}
			<span
				style={{
					fontSize: 10,
					color: C.textMuted,
					fontFamily: "monospace",
					width: 60,
					textAlign: "center",
				}}
			>
				{position + 1} / {total}
			</span>

			{/* Speed control */}
			<div
				style={{
					display: "inline-flex",
					borderRadius: 4,
					overflow: "hidden",
					border: `1px solid ${C.border}`,
				}}
			>
				{[1, 2, 5].map((s) => (
					<button
						key={s}
						onClick={() => onSpeed(s)}
						type="button"
						style={{
							fontSize: 9,
							padding: "2px 6px",
							border: "none",
							borderRight: s !== 5 ? `1px solid ${C.border}` : "none",
							background: speed === s ? `${C.pink}20` : "transparent",
							color: speed === s ? C.pink : C.textMuted,
							cursor: "pointer",
							fontFamily: "monospace",
						}}
					>
						{s}x
					</button>
				))}
			</div>
		</div>
	);
}

// ── Timeline visualization ──────────────────────────────────────────────────

function TimelineBar({ events, position }) {
	if (events.length === 0) return null;

	const w = "100%";
	const h = 24;

	return (
		<div
			style={{
				padding: "0 16px",
				background: C.bg1,
				borderBottom: `1px solid ${C.border}`,
			}}
		>
			<svg
				width={w}
				height={h}
				style={{ display: "block" }}
				viewBox={`0 0 1000 ${h}`}
			>
				<title>Session event timeline</title>
				{events.map((e, i) => {
					const x = (i / events.length) * 1000;
					const color = STATUS_COLORS[e.status] ?? C.textMuted;
					const isCurrent = i === position;
					return (
						<rect
							key={`${e.ts ?? ""}-${e.plugin ?? ""}-${x.toFixed(0)}`}
							x={x}
							y={isCurrent ? 0 : 6}
							width={Math.max(1000 / events.length - 0.5, 1)}
							height={isCurrent ? h : h - 12}
							fill={isCurrent ? C.pink : color}
							opacity={i <= position ? 0.8 : 0.2}
							rx={1}
						/>
					);
				})}
				{/* Playhead */}
				<rect
					x={(position / Math.max(events.length - 1, 1)) * 1000 - 1}
					y={0}
					width={2}
					height={h}
					fill={C.pink}
				/>
			</svg>
		</div>
	);
}

// ── Event detail panel ──────────────────────────────────────────────────────

function EventDetail({ event, cumCost, filesThisTurn }) {
	if (!event) return null;

	const statusColor = STATUS_COLORS[event.status] ?? C.textMuted;
	const plugColor = pluginColor(event.plugin);

	return (
		<div style={{ padding: "16px 20px" }}>
			{/* Current event header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 12,
				}}
			>
				<div
					style={{
						width: 8,
						height: 8,
						borderRadius: "50%",
						background: statusColor,
						boxShadow: `0 0 6px ${statusColor}88`,
						flexShrink: 0,
					}}
				/>
				<span
					style={{
						fontSize: 9,
						fontWeight: 700,
						fontFamily: "monospace",
						padding: "1px 5px",
						borderRadius: 3,
						border: `1px solid ${plugColor}44`,
						color: plugColor,
						background: `${plugColor}11`,
					}}
				>
					{PLUGIN_LABELS[event.plugin] ?? event.plugin?.toUpperCase()}
				</span>
				<span style={{ fontSize: 11, color: C.textPrimary, flex: 1 }}>
					{event.label}
				</span>
				<span
					style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}
				>
					{formatTime(event.ts)}
				</span>
			</div>

			{/* Detail */}
			{event.detail && (
				<div
					style={{
						fontSize: 10,
						color: C.textSecondary,
						fontFamily: "monospace",
						padding: "8px 10px",
						background: C.bg0,
						borderRadius: 5,
						border: `1px solid ${C.border}`,
						marginBottom: 12,
						maxHeight: 80,
						overflowY: "auto",
					}}
				>
					{event.detail}
				</div>
			)}

			{/* Stats bar */}
			<div
				style={{
					display: "flex",
					gap: 16,
					fontSize: 10,
					color: C.textMuted,
					padding: "8px 10px",
					background: C.bg2,
					borderRadius: 6,
					border: `1px solid ${C.border}`,
					marginBottom: 16,
				}}
			>
				<span>
					Status: <span style={{ color: statusColor }}>{event.status}</span>
				</span>
				{event.tool_name && (
					<span>
						Tool: <span style={{ color: C.cyan }}>{event.tool_name}</span>
					</span>
				)}
				{cumCost > 0 && (
					<span>
						Cum. Cost:{" "}
						<span style={{ color: C.green }}>{fmtCost(cumCost)}</span>
					</span>
				)}
			</div>

			{/* Files touched so far */}
			{filesThisTurn.length > 0 && (
				<div>
					<div
						style={{
							fontSize: 10,
							color: C.textMuted,
							letterSpacing: "0.06em",
							textTransform: "uppercase",
							fontFamily: "monospace",
							marginBottom: 8,
						}}
					>
						Files Touched (this session so far)
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 3,
							maxHeight: 200,
							overflowY: "auto",
						}}
					>
						{filesThisTurn.slice(0, 20).map((f) => (
							<div
								key={f.path}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									fontSize: 10,
									fontFamily: "monospace",
								}}
							>
								<span
									style={{
										color: f.type === "write" ? C.pink : C.cyan,
										width: 10,
										textAlign: "center",
									}}
								>
									{f.type === "write" ? "W" : "R"}
								</span>
								<span
									style={{
										color: C.textSecondary,
										flex: 1,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{f.path.length > 50 ? `...${f.path.slice(-47)}` : f.path}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Metadata */}
			{event.meta && Object.keys(event.meta).length > 0 && (
				<div style={{ marginTop: 16 }}>
					<div
						style={{
							fontSize: 10,
							color: C.textMuted,
							letterSpacing: "0.06em",
							textTransform: "uppercase",
							fontFamily: "monospace",
							marginBottom: 8,
						}}
					>
						Event Metadata
					</div>
					<div
						style={{
							fontSize: 10,
							fontFamily: "monospace",
							color: C.cyan,
							padding: "8px 10px",
							background: C.bg0,
							borderRadius: 5,
							border: `1px solid ${C.border}`,
							maxHeight: 160,
							overflowY: "auto",
							whiteSpace: "pre-wrap",
							wordBreak: "break-all",
						}}
					>
						{JSON.stringify(event.meta, null, 2)}
					</div>
				</div>
			)}
		</div>
	);
}

// ── Main view ───────────────────────────────────────────────────────────────

export default function SessionReplay({ sessions }) {
	const [selectedId, setSelectedId] = useState(null);
	const [position, setPosition] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const intervalRef = useRef(null);

	const session = sessions.find((s) => s.id === selectedId) ?? null;
	const events = session?.events ?? [];

	// Compute cumulative cost up to current position
	const { cumCost, filesThisTurn } = useMemo(() => {
		let cost = 0;
		const fileSet = new Map(); // path → type
		for (let i = 0; i <= position && i < events.length; i++) {
			const e = events[i];
			if (e.meta?.estimated_cost_usd) cost += e.meta.estimated_cost_usd;

			// Track files
			const filePath = e.meta?.target ?? e.meta?.file ?? null;
			const toolName = e.tool_name ?? e.meta?.tool ?? null;
			if (filePath) {
				const type =
					toolName === "Write" || toolName === "Edit" ? "write" : "read";
				fileSet.set(filePath, type);
			}
		}
		return {
			cumCost: cost,
			filesThisTurn: [...fileSet.entries()]
				.map(([path, type]) => ({ path, type }))
				.reverse(),
		};
	}, [events, position]);

	// Reset position when session changes
	useEffect(() => {
		setPosition(0);
		setPlaying(false);
	}, []);

	// Playback timer
	useEffect(() => {
		if (playing && events.length > 0) {
			intervalRef.current = setInterval(() => {
				setPosition((prev) => {
					if (prev >= events.length - 1) {
						setPlaying(false);
						return prev;
					}
					return prev + 1;
				});
			}, 500 / speed);
		}
		return () => clearInterval(intervalRef.current);
	}, [playing, speed, events.length]);

	const step = useCallback(
		(dir) => {
			setPosition((prev) =>
				Math.max(0, Math.min(events.length - 1, prev + dir)),
			);
		},
		[events.length],
	);

	const currentEvent = events[position] ?? null;

	return (
		<div style={{ display: "flex", height: "100%", minHeight: 0 }}>
			{/* Session picker */}
			<SessionPicker
				sessions={sessions}
				selected={selectedId}
				onSelect={setSelectedId}
			/>

			{/* Replay area */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					minWidth: 0,
				}}
			>
				{!session ? (
					<div
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: C.textMuted,
							fontSize: 13,
						}}
					>
						Select a session to replay it
					</div>
				) : events.length === 0 ? (
					<div
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: C.textMuted,
							fontSize: 12,
						}}
					>
						This session has no events to replay
					</div>
				) : (
					<>
						{/* Session header */}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "10px 16px",
								borderBottom: `1px solid ${C.border}`,
								background: C.bg1,
							}}
						>
							<span
								style={{
									fontSize: 10,
									color: C.textMuted,
									fontFamily: "monospace",
								}}
							>
								{session.id?.slice(0, 16)}…
							</span>
							<span style={{ fontSize: 10, color: C.textSecondary }}>
								{formatDuration(session.start, session.end)}
							</span>
							<span style={{ fontSize: 10, color: C.textMuted }}>
								{events.length} events
							</span>
							{session.avgScore != null && (
								<span
									style={{
										fontSize: 10,
										fontFamily: "monospace",
										color: scoreColor(session.avgScore),
									}}
								>
									score {session.avgScore.toFixed(2)}
								</span>
							)}
						</div>

						{/* Timeline bar */}
						<TimelineBar events={events} position={position} />

						{/* Playback controls */}
						<PlaybackControls
							position={position}
							total={events.length}
							playing={playing}
							speed={speed}
							onSeek={setPosition}
							onToggle={() => setPlaying((p) => !p)}
							onSpeed={setSpeed}
							onStep={step}
						/>

						{/* Event detail */}
						<div style={{ flex: 1, overflowY: "auto" }}>
							<EventDetail
								event={currentEvent}
								cumCost={cumCost}
								filesThisTurn={filesThisTurn}
							/>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
