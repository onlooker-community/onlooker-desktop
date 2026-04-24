// Quick Open (⌘K) — keyboard-driven search across sessions, events, and views.

import { useEffect, useMemo, useRef, useState } from "react";
import { PLUGIN_LABELS, STATUS_COLORS } from "../plugins.js";

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

const VIEWS = [
	{ id: "feed", label: "Live Feed", icon: "⚡", category: "Views" },
	{ id: "sessions", label: "Sessions", icon: "◎", category: "Views" },
	{ id: "replay", label: "Session Replay", icon: "▶", category: "Views" },
	{ id: "project", label: "Project Dashboard", icon: "◫", category: "Views" },
	{ id: "metrics", label: "Metrics", icon: "▦", category: "Views" },
	{ id: "heatmap", label: "Attention Heatmap", icon: "▧", category: "Views" },
	{ id: "security", label: "Security", icon: "⊘", category: "Views" },
	{ id: "anomalies", label: "Anomalies", icon: "◇", category: "Views" },
	{ id: "deadends", label: "Dead Ends", icon: "⊗", category: "Views" },
	{ id: "instgraph", label: "Instruction Graph", icon: "⬡", category: "Views" },
	{ id: "diffing", label: "Prompt Diffs", icon: "⇄", category: "Views" },
	{ id: "handoffs", label: "Handoff Quality", icon: "⤻", category: "Views" },
	{ id: "review", label: "Weekly Review", icon: "☆", category: "Views" },
	{ id: "settings", label: "Settings", icon: "⚙", category: "Views" },
];

export default function QuickOpen({ sessions, onNavigate, onClose }) {
	const [query, setQuery] = useState("");
	const [selectedIdx, setSelectedIdx] = useState(0);
	const inputRef = useRef(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Build searchable items
	const results = useMemo(() => {
		const q = query.toLowerCase().trim();
		const items = [];

		// Views — always searchable
		for (const v of VIEWS) {
			if (!q || v.label.toLowerCase().includes(q) || v.id.includes(q)) {
				items.push({ type: "view", ...v, action: () => onNavigate(v.id) });
			}
		}

		if (!q) return items.slice(0, 20);

		// Sessions matching query
		for (const s of sessions.slice(0, 100)) {
			if (s.id?.toLowerCase().includes(q)) {
				items.push({
					type: "session",
					label: `${s.id.slice(0, 24)}…`,
					icon: "◎",
					category: "Sessions",
					detail: s.start
						? `${new Date(s.start).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
							})} · ${s.events?.length ?? 0} events`
						: "",
					action: () => onNavigate("sessions"),
				});
			}
		}

		// Events matching query (search labels)
		const matchedEvents = [];
		for (const s of sessions.slice(0, 50)) {
			for (const e of (s.events ?? []).slice(0, 200)) {
				if (matchedEvents.length >= 10) break;
				if (
					e.label?.toLowerCase().includes(q) ||
					e.detail?.toLowerCase().includes(q)
				) {
					matchedEvents.push({
						type: "event",
						label: e.label,
						icon: PLUGIN_LABELS[e.plugin] ?? "?",
						category: "Events",
						detail: `${e.plugin} · ${e.status}`,
						color: STATUS_COLORS[e.status] ?? C.textMuted,
						action: () => onNavigate("feed"),
					});
				}
			}
		}
		items.push(...matchedEvents);

		return items.slice(0, 25);
	}, [query, sessions, onNavigate]);

	// Keyboard navigation
	useEffect(() => {
		const handler = (e) => {
			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIdx((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter" && results[selectedIdx]) {
				e.preventDefault();
				results[selectedIdx].action();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [results, selectedIdx, onClose]);

	// Reset selection on query change
	useEffect(() => setSelectedIdx(0), []);

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 200,
				background: "rgba(0,0,0,0.5)",
				display: "flex",
				justifyContent: "center",
				paddingTop: 80,
			}}
		>
			<div
				style={{
					width: 520,
					maxHeight: 440,
					background: C.bg1,
					borderRadius: 12,
					border: `1px solid ${C.border}`,
					boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Search input */}
				<div
					style={{
						padding: "12px 16px",
						borderBottom: `1px solid ${C.border}`,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<span style={{ fontSize: 14, color: C.textMuted }}>⌘</span>
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search views, sessions, events..."
						style={{
							flex: 1,
							fontSize: 13,
							padding: 0,
							border: "none",
							background: "transparent",
							color: C.textPrimary,
							outline: "none",
							fontFamily: "inherit",
						}}
					/>
					<span
						style={{
							fontSize: 9,
							color: C.textMuted,
							fontFamily: "monospace",
							padding: "2px 6px",
							borderRadius: 3,
							border: `1px solid ${C.border}`,
						}}
					>
						ESC
					</span>
				</div>

				{/* Results */}
				<div style={{ flex: 1, overflowY: "auto" }}>
					{results.length === 0 ? (
						<div
							style={{
								padding: "20px",
								textAlign: "center",
								color: C.textMuted,
								fontSize: 12,
							}}
						>
							No results for "{query}"
						</div>
					) : (
						(() => {
							let lastCategory = "";
							return results.map((item, i) => {
								const showCategory = item.category !== lastCategory;
								lastCategory = item.category;
								const isSelected = i === selectedIdx;

								return (
									<div key={`${item.type}-${item.id ?? item.label}`}>
										{showCategory && (
											<div
												style={{
													padding: "6px 16px 4px",
													fontSize: 9,
													color: C.textMuted,
													fontFamily: "monospace",
													letterSpacing: "0.06em",
													textTransform: "uppercase",
												}}
											>
												{item.category}
											</div>
										)}
										<button
											type="button"
											onClick={() => item.action()}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 10,
												padding: "7px 16px",
												cursor: "pointer",
												background: isSelected ? `${C.pink}15` : "transparent",
												borderLeft: `2px solid ${isSelected ? C.pink : "transparent"}`,
												width: "100%",
												border: "none",
												textAlign: "left",
											}}
											onMouseEnter={() => setSelectedIdx(i)}
										>
											<span
												style={{
													fontSize: 13,
													width: 20,
													textAlign: "center",
													color: item.color ?? C.textMuted,
												}}
											>
												{item.icon}
											</span>
											<span
												style={{
													fontSize: 12,
													color: C.textPrimary,
													flex: 1,
												}}
											>
												{item.label}
											</span>
											{item.detail && (
												<span
													style={{
														fontSize: 10,
														color: C.textMuted,
													}}
												>
													{item.detail}
												</span>
											)}
										</button>
									</div>
								);
							});
						})()
					)}
				</div>

				{/* Footer */}
				<div
					style={{
						padding: "6px 16px",
						borderTop: `1px solid ${C.border}`,
						display: "flex",
						gap: 12,
						fontSize: 9,
						color: C.textMuted,
						fontFamily: "monospace",
					}}
				>
					<span>↑↓ navigate</span>
					<span>↵ open</span>
					<span>esc close</span>
				</div>
			</div>
		</div>
	);
}
