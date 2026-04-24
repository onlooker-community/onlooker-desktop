// The main chat interface: message thread on top, input at the bottom.
//
// Streaming is visualised as a "live bubble" that shows the partial response
// as it arrives token-by-token, with a blinking cursor. Once the stream ends
// the bubble is replaced by a stable message in the list.

import { useEffect, useRef, useState } from "react";

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
	purple: "#a78bfa",
	green: "#4ade80",
	textPrimary: "#e2e8f0",
	textSecondary: "#94a3b8",
	textMuted: "#475569",
};

const PLUGIN_COLORS = {
	sentinel: C.yellow,
	tribunal: C.pink,
	archivist: C.cyan,
	scribe: C.purple,
};

function PluginBadge({ plugin }) {
	const labels = {
		sentinel: "SEN",
		tribunal: "TRB",
		archivist: "ARC",
		scribe: "SCR",
	};
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
			}}
		>
			{labels[plugin] ?? plugin?.toUpperCase()}
		</span>
	);
}

function Message({ msg, showDebug }) {
	const isUser = msg.role === "user";
	return (
		<div
			style={{
				display: "flex",
				gap: 10,
				marginBottom: 16,
				flexDirection: isUser ? "row-reverse" : "row",
				animation: "fadeSlideIn 0.25s ease",
			}}
		>
			{/* Avatar */}
			<div
				style={{
					width: 28,
					height: 28,
					borderRadius: "50%",
					flexShrink: 0,
					background: isUser ? C.bg3 : `${C.pink}22`,
					border: `1px solid ${isUser ? C.border : C.pinkDim}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: 11,
					color: isUser ? C.textMuted : C.pink,
				}}
			>
				{isUser ? "M" : "✦"}
			</div>

			<div style={{ maxWidth: "74%", minWidth: 0 }}>
				{/* Bubble */}
				<div
					style={{
						background: isUser ? C.bg3 : C.bg2,
						border: `1px solid ${isUser ? C.border : C.borderAccent}`,
						borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
						padding: "10px 14px",
						fontSize: 13,
						lineHeight: 1.65,
						color: msg.error ? "#f87171" : C.textPrimary,
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						// Allow text selection inside bubbles
						userSelect: "text",
					}}
				>
					{msg.content}
				</div>

				{/* Debug meta panel — shows which plugins fired on this turn */}
				{showDebug && msg.meta?.length > 0 && (
					<div
						style={{
							marginTop: 4,
							padding: "6px 10px",
							background: C.bg0,
							border: `1px solid ${C.border}`,
							borderRadius: 6,
							fontSize: 10,
							color: C.textMuted,
							fontFamily: "monospace",
						}}
					>
						{msg.meta.map((m) => (
							<div
								key={m.plugin}
								style={{
									display: "flex",
									gap: 7,
									alignItems: "center",
									marginBottom: 2,
								}}
							>
								<PluginBadge plugin={m.plugin} />
								<span>{m.detail}</span>
							</div>
						))}
					</div>
				)}

				<div
					style={{
						fontSize: 9,
						color: C.textMuted,
						marginTop: 3,
						textAlign: isUser ? "right" : "left",
						fontFamily: "monospace",
					}}
				>
					{new Date(msg.ts).toLocaleTimeString("en-US", { hour12: false })}
				</div>
			</div>
		</div>
	);
}

// The live streaming bubble — shows partial text + blinking cursor while
// tokens are arriving. Replaced by a stable Message once the stream ends.
function StreamingBubble({ text }) {
	return (
		<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
			<div
				style={{
					width: 28,
					height: 28,
					borderRadius: "50%",
					flexShrink: 0,
					background: `${C.pink}22`,
					border: `1px solid ${C.pinkDim}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: 11,
					color: C.pink,
				}}
			>
				✦
			</div>
			<div
				style={{
					maxWidth: "74%",
					background: C.bg2,
					border: `1px solid ${C.borderAccent}`,
					borderRadius: "4px 12px 12px 12px",
					padding: "10px 14px",
					fontSize: 13,
					color: C.textPrimary,
					lineHeight: 1.65,
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
					userSelect: "text",
				}}
			>
				{/* While waiting for first token, show the pulsing dots */}
				{!text && (
					<span style={{ display: "flex", gap: 4, alignItems: "center" }}>
						{[0, 0.2, 0.4].map((delay) => (
							<span
								key={delay}
								style={{
									width: 5,
									height: 5,
									borderRadius: "50%",
									background: C.textMuted,
									display: "inline-block",
									animation: `pulse 1.2s ${delay}s infinite`,
								}}
							/>
						))}
					</span>
				)}
				{text}
				{/* Blinking cursor at the end of streamed text */}
				{text && (
					<span
						style={{
							display: "inline-block",
							width: 2,
							height: 13,
							background: C.pink,
							marginLeft: 1,
							verticalAlign: "text-bottom",
							animation: "pulse 0.8s infinite",
						}}
					/>
				)}
			</div>
		</div>
	);
}

export default function ChatPane({
	messages,
	send,
	streaming,
	streamBuffer,
	debugMode,
}) {
	const [input, setInput] = useState("");
	const endRef = useRef(null);
	const textRef = useRef(null);

	// Scroll to bottom whenever messages or the streaming buffer updates
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// Auto-resize textarea up to 120px
	useEffect(() => {
		if (textRef.current) {
			textRef.current.style.height = "auto";
			textRef.current.style.height = `${Math.min(textRef.current.scrollHeight, 120)}px`;
		}
	}, []);

	function handleSend() {
		const trimmed = input.trim();
		if (!trimmed || streaming) return;
		setInput("");
		send(trimmed);
	}

	function handleKeyDown(e) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				minWidth: 0,
				borderRight: `1px solid ${C.border}`,
			}}
		>
			{/* Message thread */}
			<div style={{ flex: 1, overflowY: "auto", padding: "20px 18px" }}>
				{messages.length === 0 && (
					<div
						style={{ textAlign: "center", marginTop: 60, color: C.textMuted }}
					>
						<div style={{ fontSize: 28, marginBottom: 8 }}>✦</div>
						<div style={{ fontSize: 13 }}>
							Session started — Onlooker is watching.
						</div>
					</div>
				)}
				{messages.map((msg) => (
					<Message key={msg.ts} msg={msg} showDebug={debugMode} />
				))}
				{/* Live streaming bubble — only shown while a response is in flight */}
				{streaming && <StreamingBubble text={streamBuffer} />}
				<div ref={endRef} />
			</div>

			{/* Input area */}
			<div
				style={{
					padding: "12px 18px",
					borderTop: `1px solid ${C.border}`,
					background: C.bg1,
				}}
			>
				<div
					style={{
						display: "flex",
						gap: 8,
						alignItems: "flex-end",
						background: C.bg2,
						border: `1px solid ${C.border}`,
						borderRadius: 10,
						padding: "8px 12px",
						transition: "border-color 0.15s",
					}}
					onFocusCapture={(e) =>
						(e.currentTarget.style.borderColor = C.borderAccent)
					}
					onBlurCapture={(e) => (e.currentTarget.style.borderColor = C.border)}
				>
					<textarea
						ref={textRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Message Claude · Onlooker is watching…"
						rows={1}
						style={{
							flex: 1,
							background: "none",
							border: "none",
							resize: "none",
							color: C.textPrimary,
							fontSize: 13,
							lineHeight: 1.5,
							fontFamily: "'DM Sans', sans-serif",
							maxHeight: 120,
							outline: "none",
							userSelect: "text",
						}}
					/>
					<button
						type="button"
						onClick={handleSend}
						disabled={!input.trim() || streaming}
						style={{
							width: 32,
							height: 32,
							borderRadius: 7,
							border: "none",
							background: input.trim() && !streaming ? C.pink : C.bg3,
							color: input.trim() && !streaming ? "#fff" : C.textMuted,
							cursor: input.trim() && !streaming ? "pointer" : "default",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							fontSize: 15,
							transition: "all 0.15s",
							flexShrink: 0,
						}}
					>
						{streaming ? (
							<span
								style={{
									width: 12,
									height: 12,
									borderRadius: "50%",
									border: `2px solid ${C.textMuted}`,
									borderTopColor: "transparent",
									animation: "spin 0.7s linear infinite",
									display: "block",
								}}
							/>
						) : (
							"↑"
						)}
					</button>
				</div>

				{/* Active plugin dots */}
				<div
					style={{
						marginTop: 6,
						display: "flex",
						gap: 10,
						fontSize: 10,
						color: C.textMuted,
					}}
				>
					{Object.entries(PLUGIN_COLORS).map(([plugin, color]) => (
						<span key={plugin} style={{ color }}>
							● {plugin.charAt(0).toUpperCase() + plugin.slice(1)}
						</span>
					))}
					<span style={{ marginLeft: "auto", fontFamily: "monospace" }}>
						⏎ send · ⇧⏎ newline
					</span>
				</div>
			</div>
		</div>
	);
}
