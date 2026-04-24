// Settings modal — API key, model selection, log directory, Tribunal threshold,
// Sentinel strict mode, and installed plugin inventory.
//
// The API key flow is a bit subtle: the renderer never sees the real key.
// When a key is stored, the main process returns a masked version
// ("sk-ant-api03-…abcd") which we display as a confirmation. When the user
// wants to replace it, we clear the masked display and show a password input.

import { useEffect, useState } from "react";

const C = {
	bg0: "#0b0d14",
	bg1: "#12151f",
	bg2: "#181c2a",
	bg3: "#1f2335",
	border: "#252a3d",
	borderAccent: "#2e3555",
	pink: "#f472b6",
	pinkDim: "#9d346b",
	cyan: "#22d3ee",
	yellow: "#fbbf24",
	green: "#4ade80",
	red: "#f87171",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

// ── Small reusable primitives ────────────────────────────────────────────────

function SectionTitle({ children }) {
	return (
		<div
			style={{
				fontSize: 9,
				fontWeight: 700,
				letterSpacing: "0.12em",
				color: C.textMuted,
				textTransform: "uppercase",
				fontFamily: "monospace",
				marginBottom: 12,
				marginTop: 22,
				paddingBottom: 6,
				borderBottom: `1px solid ${C.border}`,
			}}
		>
			{children}
		</div>
	);
}

function FieldLabel({ label, hint, htmlFor }) {
	return (
		<>
			<label
				htmlFor={htmlFor}
				style={{
					display: "block",
					fontSize: 11,
					fontWeight: 600,
					color: C.textSecondary,
					marginBottom: 5,
					letterSpacing: "0.03em",
				}}
			>
				{label}
			</label>
			{hint && (
				<div
					style={{
						fontSize: 10,
						color: C.textMuted,
						marginTop: 4,
						lineHeight: 1.5,
					}}
				>
					{hint}
				</div>
			)}
		</>
	);
}

function TextInput({
	id,
	value,
	onChange,
	type = "text",
	placeholder,
	monospace,
}) {
	return (
		<input
			id={id}
			type={type}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			style={{
				width: "100%",
				padding: "8px 10px",
				background: C.bg2,
				border: `1px solid ${C.border}`,
				borderRadius: 6,
				color: C.textPrimary,
				fontSize: 12,
				fontFamily: monospace
					? "'JetBrains Mono', monospace"
					: "'DM Sans', sans-serif",
				outline: "none",
				transition: "border-color 0.15s",
				userSelect: "text",
			}}
			onFocus={(e) => (e.target.style.borderColor = C.borderAccent)}
			onBlur={(e) => (e.target.style.borderColor = C.border)}
		/>
	);
}

function Toggle({ value, onChange, label }) {
	return (
		<button
			type="button"
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "8px 10px",
				background: C.bg2,
				borderRadius: 6,
				border: `1px solid ${C.border}`,
				cursor: "pointer",
				width: "100%",
				textAlign: "left",
			}}
			onClick={() => onChange(!value)}
		>
			<span style={{ fontSize: 12, color: C.textSecondary }}>{label}</span>
			<div
				style={{
					width: 32,
					height: 18,
					borderRadius: 9,
					position: "relative",
					background: value ? C.pink : C.bg3,
					border: `1px solid ${value ? C.pinkDim : C.border}`,
					transition: "all 0.2s",
				}}
			>
				<div
					style={{
						position: "absolute",
						top: 2,
						left: value ? 15 : 2,
						width: 12,
						height: 12,
						borderRadius: "50%",
						background: value ? "#fff" : C.textMuted,
						transition: "left 0.2s, background 0.2s",
					}}
				/>
			</div>
		</button>
	);
}

function ActionBtn({ label, color, onClick, primary }) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				fontSize: 11,
				padding: "7px 14px",
				borderRadius: 6,
				border: `1px solid ${primary ? color : `${color}44`}`,
				background: primary ? `${color}22` : "transparent",
				color,
				cursor: "pointer",
				fontFamily: "'DM Sans', sans-serif",
				transition: "all 0.15s",
			}}
			onMouseEnter={(e) => (e.currentTarget.style.background = `${color}30`)}
			onMouseLeave={(e) =>
				(e.currentTarget.style.background = primary
					? `${color}22`
					: "transparent")
			}
		>
			{label}
		</button>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

const MODELS = [
	"claude-sonnet-4-20250514",
	"claude-opus-4-20250514",
	"claude-haiku-4-5-20251001",
];

export default function SettingsModal({ settings, onSave, onClose }) {
	// Local form state — changes are only committed when the user clicks Save
	const [form, setForm] = useState(settings ?? {});
	const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

	// API key state
	const [keyMasked, setKeyMasked] = useState(null); // "sk-ant-api03-…abcd"
	const [newKey, setNewKey] = useState("");
	const [keyStatus, setKeyStatus] = useState(null); // null | "saved" | "error"

	const [plugins, setPlugins] = useState([]);

	useEffect(() => {
		// Load the masked key and plugin list on mount
		window.onlooker.key.get().then(setKeyMasked);
		window.onlooker.plugins.list().then(setPlugins);
	}, []);

	async function handleSaveKey() {
		if (!newKey.trim()) return;
		const res = await window.onlooker.key.set(newKey.trim());
		if (res?.ok) {
			setKeyStatus("saved");
			setNewKey("");
			// Re-fetch the masked form so the UI reflects the new key
			const masked = await window.onlooker.key.get();
			setKeyMasked(masked);
			setTimeout(() => setKeyStatus(null), 2000);
		} else {
			setKeyStatus("error");
		}
	}

	async function handleSave() {
		await onSave(form);
		onClose();
	}

	return (
		<button
			type="button"
			style={{
				position: "fixed",
				inset: 0,
				background: `${C.bg0}ee`,
				backdropFilter: "blur(8px)",
				zIndex: 200,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				animation: "fadeIn 0.2s ease",
				border: "none",
				padding: 0,
				cursor: "default",
			}}
			onClick={onClose}
		>
			<div
				role="dialog"
				style={{
					background: C.bg1,
					border: `1px solid ${C.borderAccent}`,
					borderRadius: 14,
					width: 480,
					maxWidth: "90vw",
					maxHeight: "80vh",
					display: "flex",
					flexDirection: "column",
					boxShadow: `0 0 60px ${C.pink}18, 0 24px 48px #0009`,
				}}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					style={{
						padding: "20px 24px 0",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>
						Settings
					</div>
					<button
						type="button"
						onClick={onClose}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							color: C.textMuted,
							fontSize: 18,
							padding: "2px 8px",
							transition: "color 0.15s",
						}}
						onMouseEnter={(e) => (e.target.style.color = C.textPrimary)}
						onMouseLeave={(e) => (e.target.style.color = C.textMuted)}
					>
						✕
					</button>
				</div>

				{/* Scrollable body */}
				<div style={{ flex: 1, overflowY: "auto", padding: "4px 24px 20px" }}>
					{/* ── API Key section ── */}
					<SectionTitle>API Key</SectionTitle>
					<div style={{ marginBottom: 18 }}>
						<FieldLabel
							label="Anthropic API Key"
							htmlFor="api-key-input"
							hint="Stored in your OS keychain — never written to disk. The key never leaves the main process."
						/>
						<div style={{ display: "flex", gap: 8, marginTop: 5 }}>
							{keyMasked ? (
								// Show the masked key as a read-only display
								<div
									id="api-key-input"
									style={{
										flex: 1,
										padding: "8px 10px",
										background: C.bg2,
										border: `1px solid ${C.border}`,
										borderRadius: 6,
										fontSize: 12,
										fontFamily: "monospace",
										color: C.textMuted,
									}}
								>
									{keyMasked}
								</div>
							) : (
								<TextInput
									id="api-key-input"
									value={newKey}
									onChange={setNewKey}
									type="password"
									placeholder="sk-ant-api03-…"
									monospace
								/>
							)}
							{keyMasked ? (
								<ActionBtn
									label="Replace"
									color={C.yellow}
									onClick={() => {
										setKeyMasked(null);
										setNewKey("");
									}}
								/>
							) : (
								<ActionBtn
									label={
										keyStatus === "saved"
											? "✓ Saved"
											: keyStatus === "error"
												? "Error"
												: "Save"
									}
									color={
										keyStatus === "saved"
											? C.green
											: keyStatus === "error"
												? C.red
												: C.pink
									}
									onClick={handleSaveKey}
									primary
								/>
							)}
						</div>
					</div>

					{/* ── Model section ── */}
					<SectionTitle>Model</SectionTitle>
					<div style={{ marginBottom: 18 }}>
						<FieldLabel label="Model" />
						<select
							value={form.model ?? MODELS[0]}
							onChange={(e) => set("model", e.target.value)}
							style={{
								width: "100%",
								padding: "8px 10px",
								background: C.bg2,
								border: `1px solid ${C.border}`,
								borderRadius: 6,
								color: C.textPrimary,
								fontSize: 12,
								fontFamily: "'JetBrains Mono', monospace",
								outline: "none",
								marginTop: 5,
							}}
						>
							{MODELS.map((m) => (
								<option key={m} value={m}>
									{m}
								</option>
							))}
						</select>
					</div>
					<div style={{ marginBottom: 18 }}>
						<FieldLabel label="Max Tokens" />
						<div style={{ marginTop: 5 }}>
							<TextInput
								value={String(form.maxTokens ?? 8096)}
								onChange={(v) => set("maxTokens", parseInt(v, 10) || 8096)}
								monospace
							/>
						</div>
					</div>

					{/* ── Observability section ── */}
					<SectionTitle>Observability</SectionTitle>
					<div style={{ marginBottom: 18 }}>
						<FieldLabel
							label="Log Directory"
							hint="Where Onlooker plugin hooks write JSONL event files. Subdirectories per plugin are supported (e.g. ~/.claude/onlooker/tribunal/*.jsonl)."
						/>
						<div style={{ marginTop: 5 }}>
							<TextInput
								value={form.logDir ?? "~/.claude/onlooker"}
								onChange={(v) => set("logDir", v)}
								monospace
							/>
						</div>
					</div>
					<div style={{ marginBottom: 18 }}>
						<FieldLabel
							label="Tribunal Quality Threshold"
							hint="Events with Tribunal scores below this value are shown as warnings in the feed."
						/>
						<div
							style={{
								display: "flex",
								gap: 10,
								alignItems: "center",
								marginTop: 8,
							}}
						>
							<input
								type="range"
								min={0}
								max={1}
								step={0.01}
								value={form.tribunalThreshold ?? 0.75}
								onChange={(e) =>
									set("tribunalThreshold", parseFloat(e.target.value))
								}
								style={{ flex: 1, accentColor: C.pink }}
							/>
							<span
								style={{
									fontFamily: "monospace",
									fontSize: 12,
									color: C.textPrimary,
									width: 32,
									textAlign: "right",
								}}
							>
								{(form.tribunalThreshold ?? 0.75).toFixed(2)}
							</span>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 8,
							marginBottom: 18,
						}}
					>
						<Toggle
							value={form.sentinelStrict ?? true}
							onChange={(v) => set("sentinelStrict", v)}
							label="Sentinel strict mode (block destructive bash ops)"
						/>
						<Toggle
							value={form.debugMode ?? false}
							onChange={(v) => set("debugMode", v)}
							label="Show hook metadata on chat messages"
						/>
					</div>

					{/* ── Installed plugins ── */}
					{plugins.length > 0 && (
						<>
							<SectionTitle>Installed Plugins</SectionTitle>
							{plugins.map((p) => (
								<div
									key={p.id}
									style={{
										display: "flex",
										alignItems: "center",
										padding: "7px 10px",
										background: C.bg2,
										borderRadius: 6,
										border: `1px solid ${C.border}`,
										marginBottom: 6,
									}}
								>
									<span style={{ fontSize: 11, color: C.textSecondary }}>
										{p.name ?? p.id}
									</span>
									{p.version && (
										<span
											style={{
												marginLeft: "auto",
												fontSize: 9,
												color: C.textMuted,
												fontFamily: "monospace",
											}}
										>
											v{p.version}
										</span>
									)}
									<div
										style={{
											width: 6,
											height: 6,
											borderRadius: "50%",
											background: C.green,
											marginLeft: 8,
										}}
									/>
								</div>
							))}
						</>
					)}
				</div>

				{/* Footer */}
				<div
					style={{
						padding: "14px 24px",
						borderTop: `1px solid ${C.border}`,
						display: "flex",
						justifyContent: "flex-end",
						gap: 8,
					}}
				>
					<ActionBtn label="Cancel" color={C.textMuted} onClick={onClose} />
					<ActionBtn
						label="Save Settings"
						color={C.pink}
						onClick={handleSave}
						primary
					/>
				</div>
			</div>
		</button>
	);
}
