// Context Window Pressure Gauge — sidebar widget showing estimated context
// utilization during active sessions. Mirrors the HealthIndicator pattern.

import { useState } from "react";

const C = {
	bg: "#12151f",
	border: "#252a3d",
	textMuted: "#475569",
	green: "#4ade80",
	yellow: "#fbbf24",
	orange: "#fb923c",
	red: "#f87171",
};

function pressureColor(p) {
	if (p == null) return C.textMuted;
	if (p < 0.6) return C.green;
	if (p < 0.8) return C.yellow;
	if (p < 0.95) return C.orange;
	return C.red;
}

function fmtTokens(n) {
	if (n == null) return "—";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
	return String(n);
}

export default function PressureGauge({ pressure, active }) {
	const [open, setOpen] = useState(false);

	const hasPressure = pressure != null && active;
	const pct = hasPressure ? pressure.pressure : 0;
	const color = pressureColor(hasPressure ? pct : null);
	const pctLabel = hasPressure ? `${Math.round(pct * 100)}%` : "—";

	const tooltip = open
		? undefined
		: [
				`Context: ${pctLabel}`,
				hasPressure
					? `${fmtTokens(pressure.inputTokens)} / ${fmtTokens(pressure.maxTokens)} tokens`
					: null,
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
					opacity: hasPressure ? 1 : 0.35,
					background: "none",
					border: "none",
					padding: 0,
				}}
			>
				{/* Vertical pressure bar */}
				<div
					style={{
						width: 8,
						height: 40,
						borderRadius: 4,
						background: "#1f2335",
						overflow: "hidden",
						display: "flex",
						flexDirection: "column",
						justifyContent: "flex-end",
					}}
				>
					<div
						style={{
							width: "100%",
							height: `${Math.round(pct * 100)}%`,
							background: color,
							borderRadius: 4,
							transition: "height 0.5s ease, background 0.3s",
							boxShadow: pct > 0.8 ? `0 0 6px ${color}bb` : "none",
						}}
					/>
				</div>
				<span
					style={{
						fontSize: 7,
						fontFamily: "monospace",
						color,
						letterSpacing: "0.03em",
					}}
				>
					CTX
				</span>
			</button>

			{open && (
				<PressurePanel
					pressure={pressure}
					active={active}
					color={color}
					pctLabel={pctLabel}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

function PressurePanel({ pressure, active, color, pctLabel, onClose }) {
	const hasPressure = pressure != null && active;
	const pct = hasPressure ? pressure.pressure : 0;

	return (
		<div
			style={{
				position: "fixed",
				left: 64,
				bottom: 90,
				width: 280,
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
					marginBottom: 8,
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
					Context Pressure
				</span>
				<span
					style={{
						fontSize: 13,
						fontWeight: 700,
						color,
						fontFamily: "monospace",
					}}
				>
					{pctLabel}
				</span>
			</div>

			{!hasPressure ? (
				<div style={{ fontSize: 10, color: "#475569", padding: "8px 0" }}>
					No active session data
				</div>
			) : (
				<>
					{/* Progress bar */}
					<div
						style={{
							position: "relative",
							height: 10,
							borderRadius: 5,
							background: "#1f2335",
							overflow: "visible",
							marginBottom: 12,
						}}
					>
						<div
							style={{
								width: `${Math.round(pct * 100)}%`,
								height: "100%",
								borderRadius: 5,
								background: color,
								transition: "width 0.5s ease",
							}}
						/>
						{/* PreCompact marker at 80% */}
						<div
							style={{
								position: "absolute",
								left: "80%",
								top: -2,
								bottom: -2,
								width: 1,
								borderLeft: "1px dashed #475569",
							}}
						/>
						<div
							style={{
								position: "absolute",
								left: "80%",
								top: -14,
								fontSize: 8,
								color: "#475569",
								fontFamily: "monospace",
								transform: "translateX(-50%)",
								whiteSpace: "nowrap",
							}}
						>
							PreCompact
						</div>
					</div>

					{/* Token readout */}
					<div
						style={{
							fontSize: 11,
							color: "#e2e8f0",
							fontFamily: "monospace",
							marginBottom: 8,
						}}
					>
						{fmtTokens(pressure.inputTokens)} / {fmtTokens(pressure.maxTokens)}{" "}
						tokens
					</div>

					{/* Breakdown */}
					<div
						style={{
							display: "flex",
							gap: 16,
							fontSize: 10,
							color: "#94a3b8",
							paddingTop: 8,
							borderTop: "1px solid #1f2335",
							marginBottom: 8,
						}}
					>
						<span>Input: {fmtTokens(pressure.inputTokens)}</span>
						<span>Output: {fmtTokens(pressure.outputTokens)}</span>
					</div>

					{/* Last updated */}
					{pressure.lastUpdate && (
						<div
							style={{ fontSize: 9, color: "#475569", fontFamily: "monospace" }}
						>
							updated{" "}
							{new Date(pressure.lastUpdate).toLocaleTimeString("en-US", {
								hour12: false,
							})}
						</div>
					)}
				</>
			)}

			{/* Close */}
			<div
				style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}
			>
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
