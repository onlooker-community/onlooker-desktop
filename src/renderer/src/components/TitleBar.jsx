// Custom title bar with an Electron drag region in the centre.
// On macOS, titleBarStyle: "hiddenInset" in main/index.js places the native
// traffic lights at (14, 14), so we leave 80px of left padding clear.
// On Windows/Linux the window controls are native and this bar just provides
// the drag surface and Onlooker-specific controls.

const C = {
	bg: "#0b0d14",
	border: "#1f2335",
	pink: "#f472b6",
	pinkDim: "#9d346b",
	cyan: "#22d3ee",
	green: "#4ade80",
	textMuted: "#475569",
	textSecondary: "#94a3b8",
	textPrimary: "#e2e8f0",
	bg3: "#1f2335",
};

export default function TitleBar({
	onWeeklyReview,
	onSettings,
	debugMode,
	onToggleDebug,
}) {
	return (
		<div
			className="titlebar-drag"
			style={{
				height: 44,
				background: C.bg,
				borderBottom: `1px solid ${C.border}`,
				display: "flex",
				alignItems: "center",
				paddingLeft: 80, // clear macOS traffic lights
				paddingRight: 12,
				flexShrink: 0,
			}}
		>
			{/* Left: branding + live session indicator */}
			<div
				className="titlebar-no-drag"
				style={{ display: "flex", alignItems: "center", gap: 10 }}
			>
				<span
					style={{
						fontSize: 11,
						fontWeight: 700,
						letterSpacing: "0.14em",
						color: C.pink,
						fontFamily: "'JetBrains Mono', monospace",
						textTransform: "uppercase",
					}}
				>
					Onlooker
				</span>
				<span style={{ color: C.border, fontSize: 14 }}>·</span>
				<div style={{ display: "flex", alignItems: "center", gap: 5 }}>
					<div
						style={{
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: C.green,
							boxShadow: `0 0 6px ${C.green}`,
							animation: "pulse 2.4s infinite",
						}}
					/>
					<span style={{ fontSize: 11, color: C.textSecondary }}>
						Session active
					</span>
				</div>
			</div>

			{/* Centre: drag region */}
			<div style={{ flex: 1 }} />

			{/* Right: action buttons — must be no-drag so clicks register */}
			<div
				className="titlebar-no-drag"
				style={{ display: "flex", gap: 5, alignItems: "center" }}
			>
				<TitleBtn
					label="DEBUG"
					active={debugMode}
					activeColor={C.cyan}
					onClick={onToggleDebug}
				/>
				<TitleBtn
					label="WEEKLY REVIEW"
					active={false}
					activeColor={C.pink}
					onClick={onWeeklyReview}
					accent
				/>
				<TitleBtn
					label="⚙"
					active={false}
					activeColor={C.textSecondary}
					onClick={onSettings}
					icon
				/>
			</div>
		</div>
	);
}

function TitleBtn({ label, active, activeColor, onClick, accent, icon }) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				fontSize: icon ? 14 : 9,
				padding: icon ? "3px 7px" : "3px 9px",
				borderRadius: 5,
				border: `1px solid ${active ? activeColor : accent ? "#9d346b" : "#252a3d"}`,
				background: active
					? `${activeColor}18`
					: accent
						? "#f472b615"
						: "transparent",
				color: active ? activeColor : accent ? "#f472b6" : "#475569",
				cursor: "pointer",
				fontFamily: icon ? "inherit" : "'JetBrains Mono', monospace",
				letterSpacing: icon ? 0 : "0.07em",
				transition: "all 0.15s",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.color = activeColor;
				e.currentTarget.style.borderColor = activeColor;
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.color = active
					? activeColor
					: accent
						? "#f472b6"
						: "#475569";
				e.currentTarget.style.borderColor = active
					? activeColor
					: accent
						? "#9d346b"
						: "#252a3d";
			}}
		>
			{label}
		</button>
	);
}
