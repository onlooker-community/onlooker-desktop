// Instruction Graph — force-directed visualization of CLAUDE.md and rules file hierarchy.
// Shows files as nodes, cross-references as edges, contradictions in red.
// Includes file system watcher integration for live instruction changes.

import { useEffect, useMemo, useRef, useState } from "react";
import {
	useInstructionGraph,
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
	sky: "#38bdf8",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

function sevColor(severity) {
	if (severity === "high") return C.red;
	if (severity === "medium") return C.yellow;
	return C.textMuted;
}

// Simple force-directed layout using velocity Verlet integration.
// Runs in a requestAnimationFrame loop for ~60 iterations then stabilizes.
function useForceLayout(nodes, edges, width, height) {
	const [positions, setPositions] = useState([]);

	useEffect(() => {
		if (!nodes || nodes.length === 0) {
			setPositions([]);
			return;
		}

		// Initialize positions in a circle
		const pos = nodes.map((_, i) => ({
			x: width / 2 + width * 0.35 * Math.cos((2 * Math.PI * i) / nodes.length),
			y:
				height / 2 + height * 0.35 * Math.sin((2 * Math.PI * i) / nodes.length),
			vx: 0,
			vy: 0,
		}));

		const nodeIndex = {};
		nodes.forEach((n, i) => {
			nodeIndex[n.id] = i;
		});

		let frame = 0;
		const maxFrames = 80;
		const alpha = 0.3;

		function tick() {
			// Repulsion between all nodes
			for (let i = 0; i < pos.length; i++) {
				for (let j = i + 1; j < pos.length; j++) {
					const dx = pos[j].x - pos[i].x;
					const dy = pos[j].y - pos[i].y;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					const force = 800 / (dist * dist);
					const fx = (dx / dist) * force;
					const fy = (dy / dist) * force;
					pos[i].vx -= fx;
					pos[i].vy -= fy;
					pos[j].vx += fx;
					pos[j].vy += fy;
				}
			}

			// Attraction along edges
			for (const edge of edges) {
				const si = nodeIndex[edge.source];
				const ti = nodeIndex[edge.target];
				if (si == null || ti == null) continue;
				const dx = pos[ti].x - pos[si].x;
				const dy = pos[ti].y - pos[si].y;
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;
				const force = (dist - 100) * 0.01;
				const fx = (dx / dist) * force;
				const fy = (dy / dist) * force;
				pos[si].vx += fx;
				pos[si].vy += fy;
				pos[ti].vx -= fx;
				pos[ti].vy -= fy;
			}

			// Center gravity
			for (const p of pos) {
				p.vx += (width / 2 - p.x) * 0.005;
				p.vy += (height / 2 - p.y) * 0.005;
			}

			// Apply velocities with damping
			const cooling = 1 - frame / maxFrames;
			for (const p of pos) {
				p.vx *= 0.6;
				p.vy *= 0.6;
				p.x += p.vx * alpha * cooling;
				p.y += p.vy * alpha * cooling;
				// Clamp to bounds
				p.x = Math.max(40, Math.min(width - 40, p.x));
				p.y = Math.max(40, Math.min(height - 40, p.y));
			}

			frame++;
			setPositions(pos.map((p) => ({ x: p.x, y: p.y })));

			if (frame < maxFrames) requestAnimationFrame(tick);
		}

		requestAnimationFrame(tick);
	}, [
		nodes?.length,
		edges?.length,
		width,
		height,
		edges,
		nodes.forEach,
		nodes.map,
		nodes,
	]);

	return positions;
}

function GraphView({ graph }) {
	const [selected, setSelected] = useState(null);
	const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
	const containerRef = useRef(null);

	useEffect(() => {
		if (!containerRef.current) return;
		const obs = new ResizeObserver((entries) => {
			const { width, height } = entries[0].contentRect;
			if (width > 0 && height > 0) setDimensions({ width, height });
		});
		obs.observe(containerRef.current);
		return () => obs.disconnect();
	}, []);

	const { nodes, edges } = graph;
	const positions = useForceLayout(
		nodes,
		edges,
		dimensions.width,
		dimensions.height,
	);

	const nodeIndex = useMemo(() => {
		const idx = {};
		nodes.forEach((n, i) => {
			idx[n.id] = i;
		});
		return idx;
	}, [nodes]);

	const selectedNode =
		selected != null ? nodes.find((n) => n.id === selected) : null;

	return (
		<div
			style={{
				background: C.bg2,
				borderRadius: 10,
				border: `1px solid ${C.border}`,
				marginBottom: 16,
				display: "flex",
				overflow: "hidden",
			}}
		>
			{/* Graph canvas */}
			<div
				ref={containerRef}
				style={{ flex: 1, minHeight: 400, position: "relative" }}
			>
				<svg
					width={dimensions.width}
					height={dimensions.height}
					style={{ display: "block" }}
				>
					<title>Instruction Graph</title>
					{/* Edges */}
					{edges.map((edge) => {
						const si = nodeIndex[edge.source];
						const ti = nodeIndex[edge.target];
						if (si == null || ti == null || !positions[si] || !positions[ti])
							return null;
						const color =
							edge.type === "contradiction" ? C.red : `${C.textMuted}44`;
						return (
							<line
								key={`${edge.source}-${edge.target}`}
								x1={positions[si].x}
								y1={positions[si].y}
								x2={positions[ti].x}
								y2={positions[ti].y}
								stroke={color}
								strokeWidth={edge.type === "contradiction" ? 2 : 1}
								strokeDasharray={edge.type === "reference" ? "4,3" : "none"}
							/>
						);
					})}

					{/* Nodes */}
					{nodes.map((node, i) => {
						if (!positions[i]) return null;
						const isFile = node.type === "file";
						const isSelected = selected === node.id;
						const hasIssues = (node.issues ?? 0) > 0;
						const color = isFile
							? hasIssues
								? C.yellow
								: C.sky
							: sevColor(node.severity);
						const r = isFile ? 18 : 10;

						return (
							<g key={node.id} style={{ cursor: "pointer" }}>
								<circle
									cx={positions[i].x}
									cy={positions[i].y}
									r={r}
									fill={isSelected ? color : `${color}33`}
									stroke={color}
									strokeWidth={isSelected ? 2.5 : 1.5}
								/>
								{isFile && (
									<text
										x={positions[i].x}
										y={positions[i].y + r + 12}
										textAnchor="middle"
										fill={C.textSecondary}
										fontSize="9"
										fontFamily="monospace"
									>
										{node.label}
									</text>
								)}
								{hasIssues && isFile && (
									<text
										x={positions[i].x}
										y={positions[i].y + 4}
										textAnchor="middle"
										fill={C.bg0}
										fontSize="10"
										fontWeight="700"
									>
										{node.issues}
									</text>
								)}
								{/* Transparent hit area for click/keyboard interaction */}
								{/* biome-ignore lint/a11y/noStaticElementInteractions: SVG g elements cannot be native buttons */}
								<circle
									cx={positions[i].x}
									cy={positions[i].y}
									r={r}
									fill="transparent"
									onClick={() => setSelected(node.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											setSelected(node.id);
										}
									}}
								/>
							</g>
						);
					})}
				</svg>
			</div>

			{/* Detail panel */}
			{selectedNode && (
				<div
					style={{
						width: 240,
						padding: "14px 16px",
						borderLeft: `1px solid ${C.border}`,
						overflowY: "auto",
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 10,
						}}
					>
						<span
							style={{
								fontSize: 11,
								fontWeight: 600,
								color: C.textPrimary,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{selectedNode.label}
						</span>
						<button
							type="button"
							onClick={() => setSelected(null)}
							style={{
								border: "none",
								background: "none",
								font: "inherit",
								padding: 0,
								fontSize: 10,
								color: C.textMuted,
								cursor: "pointer",
							}}
						>
							✕
						</button>
					</div>

					<div
						style={{
							fontSize: 9,
							color: C.textMuted,
							fontFamily: "monospace",
							marginBottom: 8,
						}}
					>
						Type: {selectedNode.type}
					</div>
					{selectedNode.file && (
						<div
							style={{
								fontSize: 9,
								color: C.textMuted,
								fontFamily: "monospace",
								marginBottom: 8,
							}}
						>
							{selectedNode.file}
						</div>
					)}
					{selectedNode.severity && (
						<div
							style={{
								fontSize: 9,
								fontWeight: 700,
								fontFamily: "monospace",
								padding: "2px 6px",
								borderRadius: 3,
								display: "inline-block",
								color: sevColor(selectedNode.severity),
								background: `${sevColor(selectedNode.severity)}22`,
								marginBottom: 8,
							}}
						>
							{selectedNode.severity}
						</div>
					)}
					{selectedNode.category && (
						<div
							style={{ fontSize: 10, color: C.textSecondary, marginBottom: 4 }}
						>
							Category: {selectedNode.category}
						</div>
					)}
					{selectedNode.issues > 0 && (
						<div style={{ fontSize: 10, color: C.yellow }}>
							{selectedNode.issues} issue{selectedNode.issues !== 1 ? "s" : ""}{" "}
							found
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ── Recent changes panel (from file watcher) ────────────────────────────────

function ChangesList({ changes }) {
	if (changes.length === 0) return null;

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
				Recent Instruction Changes
			</div>
			{changes.slice(0, 10).map((ch) => (
				<div
					key={`${ch.file}-${ch.ts}`}
					style={{
						padding: "6px 0",
						borderBottom:
							i < changes.length - 1 ? `1px solid ${C.border}` : "none",
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<span
						style={{
							fontSize: 9,
							fontFamily: "monospace",
							color: ch.type === "add" ? C.green : C.cyan,
							width: 40,
							flexShrink: 0,
						}}
					>
						{ch.type === "add" ? "NEW" : "EDIT"}
					</span>
					<span
						style={{
							fontSize: 10,
							color: C.textSecondary,
							fontFamily: "monospace",
							flex: 1,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{ch.file}
					</span>
					<span
						style={{ fontSize: 9, color: C.green, fontFamily: "monospace" }}
					>
						+{ch.added}
					</span>
					{ch.removed > 0 && (
						<span
							style={{ fontSize: 9, color: C.red, fontFamily: "monospace" }}
						>
							-{ch.removed}
						</span>
					)}
					<span
						style={{ fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}
					>
						{new Date(ch.ts).toLocaleTimeString("en-US", { hour12: false })}
					</span>
				</div>
			))}
		</div>
	);
}

export default function InstructionGraph() {
	const { graph, loading } = useInstructionGraph();
	const { changes } = useInstructionWatcher(
		graph?.nodes?.filter((n) => n.type === "file").length > 0
			? [graph?.nodes?.[0]?.file?.split("/").slice(0, -1).join("/") || "."]
			: [],
	);

	const healthPct =
		graph?.health_score != null
			? `${Math.round(graph.health_score * 100)}%`
			: "—";
	const healthColor =
		graph?.health_score != null
			? graph.health_score >= 0.85
				? C.green
				: graph.health_score >= 0.7
					? C.yellow
					: C.red
			: C.textMuted;

	const totalIssues = graph?.issue_count
		? (graph.issue_count.high ?? 0) +
			(graph.issue_count.medium ?? 0) +
			(graph.issue_count.low ?? 0)
		: 0;

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
						Instruction Graph
					</span>
					<span
						style={{
							fontSize: 9,
							fontWeight: 700,
							letterSpacing: "0.08em",
							padding: "1px 5px",
							borderRadius: 3,
							border: `1px solid ${C.sky}44`,
							color: C.sky,
							background: `${C.sky}11`,
							fontFamily: "'JetBrains Mono', monospace",
						}}
					>
						CAR
					</span>
				</div>
				{graph && (
					<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
						{totalIssues > 0 && (
							<span style={{ fontSize: 10, color: C.textMuted }}>
								{totalIssues} issue{totalIssues !== 1 ? "s" : ""}
							</span>
						)}
					</div>
				)}
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
					Loading instruction graph...
				</div>
			) : !graph || graph.nodes.length === 0 ? (
				<div
					style={{
						textAlign: "center",
						padding: "60px 20px",
						color: C.textMuted,
					}}
				>
					<div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>⬡</div>
					<div style={{ fontSize: 13, marginBottom: 8 }}>
						No instruction files found
					</div>
					<div style={{ fontSize: 11 }}>
						The instruction graph appears once Cartographer has audited your
						CLAUDE.md and rules files. Run a Claude Code session with
						Cartographer installed to generate the data.
					</div>
				</div>
			) : (
				<>
					{/* Legend */}
					<div
						style={{
							display: "flex",
							gap: 16,
							marginBottom: 14,
							fontSize: 9,
							color: C.textMuted,
							padding: "6px 10px",
							background: C.bg2,
							borderRadius: 6,
							border: `1px solid ${C.border}`,
						}}
					>
						<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<svg width="12" height="12">
								<title>File node</title>
								<circle
									cx="6"
									cy="6"
									r="5"
									fill={`${C.sky}33`}
									stroke={C.sky}
								/>
							</svg>
							File
						</span>
						<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<svg width="12" height="12">
								<title>Issue node</title>
								<circle
									cx="6"
									cy="6"
									r="4"
									fill={`${C.red}33`}
									stroke={C.red}
								/>
							</svg>
							Issue
						</span>
						<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<svg width="20" height="12">
								<title>Contradiction edge</title>
								<line
									x1="0"
									y1="6"
									x2="20"
									y2="6"
									stroke={C.red}
									strokeWidth="2"
								/>
							</svg>
							Contradiction
						</span>
						<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
							<svg width="20" height="12">
								<title>Reference edge</title>
								<line
									x1="0"
									y1="6"
									x2="20"
									y2="6"
									stroke={C.textMuted}
									strokeDasharray="4,3"
								/>
							</svg>
							Reference
						</span>
						<span style={{ marginLeft: "auto" }}>Click nodes for details</span>
					</div>

					<GraphView graph={graph} />
					<ChangesList changes={changes} />
				</>
			)}
		</div>
	);
}
