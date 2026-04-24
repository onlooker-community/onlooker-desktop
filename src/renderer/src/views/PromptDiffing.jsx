// Prompt Diffing — side-by-side diff connecting CLAUDE.md changes to Echo scores.
// Uses instruction watcher data for diffs and correlates with session scores.

import { useMemo, useState } from "react";
import {
	useInstructionHealth,
	useInstructionWatcher,
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

// Simple line-level diff: returns [{type: "same"|"add"|"remove", text}]
function diffLines(oldText, newText) {
	const oldLines = (oldText ?? "").split("\n");
	const newLines = (newText ?? "").split("\n");
	const result = [];
	const oldSet = new Set(oldLines);
	const newSet = new Set(newLines);

	// Removed lines
	for (const line of oldLines) {
		if (!newSet.has(line)) result.push({ type: "remove", text: line });
	}
	// Added lines
	for (const line of newLines) {
		if (!oldSet.has(line)) result.push({ type: "add", text: line });
	}
	// Context (unchanged)
	const unchanged = oldLines.filter((l) => newSet.has(l)).length;

	return {
		changes: result,
		unchanged,
		added: result.filter((r) => r.type === "add").length,
		removed: result.filter((r) => r.type === "remove").length,
	};
}

function DiffView({ change }) {
	const [expanded, setExpanded] = useState(false);
	const diff = useMemo(
		() => diffLines(change.oldContent, change.newContent),
		[change],
	);

	return (
		<div
			style={{
				background: C.bg2,
				borderRadius: 10,
				border: `1px solid ${C.border}`,
				marginBottom: 12,
				overflow: "hidden",
			}}
		>
			{/* Header */}
			<button
				type="button"
				onClick={() => setExpanded((e) => !e)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					padding: "10px 14px",
					cursor: "pointer",
					borderBottom: expanded ? `1px solid ${C.border}` : "none",
					width: "100%",
					background: "none",
					borderTop: "none",
					borderLeft: "none",
					borderRight: "none",
					font: "inherit",
					color: "inherit",
					textAlign: "left",
				}}
			>
				<span
					style={{
						fontSize: 9,
						fontFamily: "monospace",
						padding: "1px 5px",
						borderRadius: 3,
						color: change.type === "add" ? C.green : C.cyan,
						background: change.type === "add" ? `${C.green}15` : `${C.cyan}15`,
						border: `1px solid ${change.type === "add" ? C.green : C.cyan}44`,
					}}
				>
					{change.type === "add" ? "NEW" : "EDIT"}
				</span>
				<span
					style={{
						fontSize: 11,
						color: C.textPrimary,
						fontFamily: "monospace",
						flex: 1,
					}}
				>
					{change.file}
				</span>
				<span style={{ fontSize: 9, color: C.green, fontFamily: "monospace" }}>
					+{change.added}
				</span>
				{change.removed > 0 && (
					<span style={{ fontSize: 9, color: C.red, fontFamily: "monospace" }}>
						-{change.removed}
					</span>
				)}
				<span
					style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}
				>
					{new Date(change.ts).toLocaleString("en-US", {
						month: "short",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					})}
				</span>
				<span
					style={{
						fontSize: 10,
						color: C.textMuted,
						transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
						transition: "transform 0.15s",
					}}
				>
					▼
				</span>
			</button>

			{/* Diff content */}
			{expanded && (
				<div
					style={{
						padding: "8px 0",
						maxHeight: 400,
						overflowY: "auto",
						fontFamily: "monospace",
						fontSize: 10,
					}}
				>
					{diff.changes.length === 0 ? (
						<div style={{ padding: "12px 14px", color: C.textMuted }}>
							No visible line changes (whitespace or formatting only)
						</div>
					) : (
						diff.changes.map((line) => (
							<div
								key={`${line.type}-${line.text}`}
								style={{
									padding: "1px 14px",
									background:
										line.type === "add"
											? `${C.green}0a`
											: line.type === "remove"
												? `${C.red}0a`
												: "transparent",
									color:
										line.type === "add"
											? C.green
											: line.type === "remove"
												? C.red
												: C.textSecondary,
								}}
							>
								<span
									style={{
										color: C.textMuted,
										width: 14,
										display: "inline-block",
									}}
								>
									{line.type === "add"
										? "+"
										: line.type === "remove"
											? "-"
											: " "}
								</span>
								{line.text}
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
}

export default function PromptDiffing() {
	const health = useInstructionHealth();
	const { changes } = useInstructionWatcher(health?.cwd ? [health.cwd] : []);

	const healthPct =
		health?.health_score != null
			? `${Math.round(health.health_score * 100)}%`
			: "—";
	const healthColor =
		health?.health_score != null
			? health.health_score >= 0.85
				? C.green
				: health.health_score >= 0.7
					? C.yellow
					: C.red
			: C.textMuted;

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
						Prompt Diffing
					</span>
					<span
						style={{
							fontSize: 9,
							fontWeight: 700,
							letterSpacing: "0.08em",
							padding: "1px 5px",
							borderRadius: 3,
							border: `1px solid ${C.pink}44`,
							color: C.pink,
							background: `${C.pink}11`,
							fontFamily: "'JetBrains Mono', monospace",
						}}
					>
						LIVE
					</span>
				</div>
				<span
					style={{
						fontSize: 11,
						fontWeight: 700,
						color: healthColor,
						fontFamily: "monospace",
					}}
				>
					Health: {healthPct}
				</span>
			</div>

			{changes.length === 0 ? (
				<div
					style={{
						textAlign: "center",
						padding: "60px 20px",
						color: C.textMuted,
					}}
				>
					<div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>⇄</div>
					<div style={{ fontSize: 13, marginBottom: 8 }}>
						No instruction changes detected
					</div>
					<div style={{ fontSize: 11 }}>
						This view shows real-time diffs of CLAUDE.md and rules file changes.
						Edit an instruction file while Onlooker is running to see changes
						appear here.
					</div>
					{health?.cwd && (
						<div
							style={{
								fontSize: 10,
								color: C.textMuted,
								marginTop: 12,
								fontFamily: "monospace",
							}}
						>
							Watching: {health.cwd}
						</div>
					)}
				</div>
			) : (
				<>
					<div
						style={{
							fontSize: 10,
							color: C.textMuted,
							marginBottom: 14,
							fontFamily: "monospace",
						}}
					>
						{changes.length} change{changes.length !== 1 ? "s" : ""} detected
						{health?.cwd && ` · ${health.cwd}`}
					</div>

					{changes.map((ch) => (
						<DiffView key={`${ch.file}-${ch.ts}`} change={ch} />
					))}
				</>
			)}
		</div>
	);
}
