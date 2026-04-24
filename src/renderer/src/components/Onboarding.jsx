// First-launch onboarding screen.
// Shown instead of the main UI when no JSONL logs are found.
// Four states: fresh | no_plugins | no_logs | (done = not shown)

// biome-ignore lint/correctness/noUnusedImports: required for @vitejs/plugin-react HMR (file has no other imports)
import React from "react";

const C = {
	bg0: "#0b0d14",
	bg1: "#12151f",
	bg2: "#181c2a",
	border: "#252a3d",
	borderAccent: "#2e3555",
	pink: "#f472b6",
	cyan: "#22d3ee",
	yellow: "#fbbf24",
	green: "#4ade80",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

function Step({ n, label, done }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				marginBottom: 10,
			}}
		>
			<div
				style={{
					width: 22,
					height: 22,
					borderRadius: "50%",
					flexShrink: 0,
					background: done ? C.green : C.bg2,
					border: `1px solid ${done ? C.green : C.border}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: 10,
					fontWeight: 700,
					fontFamily: "monospace",
					color: done ? "#000" : C.textMuted,
				}}
			>
				{done ? "✓" : n}
			</div>
			<span
				style={{
					fontSize: 13,
					color: done ? C.textMuted : C.textPrimary,
					textDecoration: done ? "line-through" : "none",
				}}
			>
				{label}
			</span>
		</div>
	);
}

function LinkBtn({ label, href, accent }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			style={{
				display: "inline-block",
				fontSize: 12,
				padding: "8px 16px",
				borderRadius: 7,
				border: `1px solid ${accent ? C.pink : C.border}`,
				background: accent ? `${C.pink}15` : "transparent",
				color: accent ? C.pink : C.textSecondary,
				textDecoration: "none",
				cursor: "pointer",
				transition: "all 0.15s",
			}}
			onMouseEnter={(e) =>
				(e.currentTarget.style.background = accent ? `${C.pink}25` : C.bg2)
			}
			onMouseLeave={(e) =>
				(e.currentTarget.style.background = accent
					? `${C.pink}15`
					: "transparent")
			}
		>
			{label} →
		</a>
	);
}

function DismissBtn({ label, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				fontSize: 12,
				padding: "8px 16px",
				borderRadius: 7,
				border: `1px solid ${C.border}`,
				background: "transparent",
				color: C.textMuted,
				cursor: "pointer",
				transition: "all 0.15s",
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
			{label}
		</button>
	);
}

export default function Onboarding({ state, onDismiss }) {
	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: C.bg0,
				padding: 40,
			}}
		>
			<div
				style={{
					maxWidth: 480,
					width: "100%",
					background: C.bg1,
					border: `1px solid ${C.borderAccent}`,
					borderRadius: 14,
					padding: 36,
					boxShadow: `0 0 80px ${C.pink}0a, 0 24px 48px #0006`,
				}}
			>
				{/* Logo */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						marginBottom: 28,
					}}
				>
					<div
						style={{
							width: 36,
							height: 36,
							borderRadius: "50%",
							background: `${C.pink}18`,
							border: `1px solid ${C.pink}44`,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: 18,
							color: C.pink,
						}}
					>
						✦
					</div>
					<div>
						<div
							style={{
								fontSize: 14,
								fontWeight: 700,
								color: C.textPrimary,
								letterSpacing: "0.05em",
							}}
						>
							Onlooker
						</div>
						<div style={{ fontSize: 11, color: C.textMuted }}>
							Claude Code observability
						</div>
					</div>
				</div>

				{/* State: fresh — nothing installed */}
				{state === "fresh" && (
					<>
						<div
							style={{
								fontSize: 16,
								fontWeight: 600,
								color: C.textPrimary,
								marginBottom: 8,
							}}
						>
							Welcome to Onlooker Desktop
						</div>
						<div
							style={{
								fontSize: 13,
								color: C.textSecondary,
								lineHeight: 1.6,
								marginBottom: 24,
							}}
						>
							Onlooker visualises your Claude Code sessions — live event feeds,
							quality scores, and weekly reviews. It reads the logs your plugins
							write while Claude Code runs.
						</div>

						<div style={{ marginBottom: 24 }}>
							<div
								style={{
									fontSize: 11,
									color: C.textMuted,
									letterSpacing: "0.08em",
									textTransform: "uppercase",
									fontFamily: "monospace",
									marginBottom: 12,
								}}
							>
								To get started
							</div>
							<Step n={1} label="Install Claude Code" done={false} />
							<Step n={2} label="Configure Onlooker plugins" done={false} />
							<Step n={3} label="Start a Claude Code session" done={false} />
						</div>

						<div style={{ display: "flex", gap: 8 }}>
							<LinkBtn
								label="View setup guide"
								href="https://onlooker.dev/docs/setup"
								accent
							/>
							<DismissBtn label="I'll do this later" onClick={onDismiss} />
						</div>
					</>
				)}

				{/* State: no_plugins — Claude Code present but no Onlooker plugins */}
				{state === "no_plugins" && (
					<>
						<div
							style={{
								fontSize: 16,
								fontWeight: 600,
								color: C.textPrimary,
								marginBottom: 8,
							}}
						>
							Claude Code detected
						</div>
						<div
							style={{
								fontSize: 13,
								color: C.textSecondary,
								lineHeight: 1.6,
								marginBottom: 24,
							}}
						>
							Claude Code is installed, but Onlooker plugins aren't set up yet.
							The plugins write the event logs that Onlooker displays.
						</div>

						<div style={{ marginBottom: 24 }}>
							<Step n={1} label="Install Claude Code" done={true} />
							<Step n={2} label="Configure Onlooker plugins" done={false} />
							<Step n={3} label="Start a Claude Code session" done={false} />
						</div>

						<div style={{ display: "flex", gap: 8 }}>
							<LinkBtn
								label="Plugin setup guide"
								href="https://onlooker.dev/docs/plugins"
								accent
							/>
							<DismissBtn label="Continue anyway" onClick={onDismiss} />
						</div>
					</>
				)}

				{/* State: no_logs — plugins installed but no sessions run yet */}
				{state === "no_logs" && (
					<>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 8,
							}}
						>
							<div
								style={{
									width: 8,
									height: 8,
									borderRadius: "50%",
									background: C.yellow,
									boxShadow: `0 0 6px ${C.yellow}`,
								}}
							/>
							<div
								style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary }}
							>
								Ready and waiting
							</div>
						</div>
						<div
							style={{
								fontSize: 13,
								color: C.textSecondary,
								lineHeight: 1.6,
								marginBottom: 24,
							}}
						>
							Onlooker plugins are installed. Start a Claude Code session and
							events will appear in the Live Feed automatically.
						</div>

						<div style={{ marginBottom: 24 }}>
							<Step n={1} label="Install Claude Code" done={true} />
							<Step n={2} label="Configure Onlooker plugins" done={true} />
							<Step n={3} label="Start a Claude Code session" done={false} />
						</div>

						<div
							style={{
								padding: "10px 14px",
								background: C.bg2,
								border: `1px solid ${C.border}`,
								borderRadius: 8,
								fontSize: 11,
								fontFamily: "monospace",
								color: C.textMuted,
								marginBottom: 20,
							}}
						>
							<span style={{ color: C.pink }}>$</span> claude
						</div>

						<DismissBtn label="Open Live Feed" onClick={onDismiss} />
					</>
				)}
			</div>
		</div>
	);
}
