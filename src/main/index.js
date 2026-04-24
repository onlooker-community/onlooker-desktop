// Main process entry point.
// Owns: BrowserWindow lifecycle, system tray, IPC handler registration.
// All Node/filesystem/shell work is delegated to the other main/ modules.

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	Notification,
	nativeImage,
	Tray,
} from "electron";
import Store from "electron-store";

import { DEFAULT_SETTINGS, IPC } from "../shared/ipc-channels.js";
import { registerChatHandlers } from "./claude-client.js";
import { registerKeyHandlers } from "./key-manager.js";
import { registerLogHandlers, stopAllWatchers } from "./log-watcher.js";
import { registerPluginHandlers } from "./plugin-bridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

// Persistent settings written to Electron's userData dir (not ~/.claude/onlooker)
export const store = new Store({ defaults: DEFAULT_SETTINGS });

let mainWindow = null;
let tray = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 900,
		minHeight: 600,
		titleBarStyle: "hiddenInset", // macOS: inset traffic lights
		trafficLightPosition: { x: 14, y: 14 },
		backgroundColor: "#0b0d14",
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"), // CJS because contextBridge uses require()
			contextIsolation: true, // renderer never gets Node access
			nodeIntegration: false,
			sandbox: false, // preload needs require()
		},
		icon: path.join(__dirname, "../../assets/icon.png"),
	});

	if (isDev) {
		mainWindow.loadURL("http://localhost:5173");
		mainWindow.webContents.openDevTools({ mode: "detach" });
	} else {
		mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

// ── System tray intelligence ────────────────────────────────────────────────
// Live session data in the menu bar: cost, friction, Warden alerts.
// Updates dynamically as events flow in.

const trayState = {
	sessionCost: 0,
	friction: null, // null | "green" | "amber" | "red"
	wardenRecent: false, // block in last 5 minutes
	lastWardenTs: 0,
	sessionId: null,
};

function updateTrayMenu() {
	if (!tray) return;

	const frictionLabel =
		trayState.friction === "red"
			? "High"
			: trayState.friction === "amber"
				? "Medium"
				: "Low";
	const costLabel =
		trayState.sessionCost < 0.005
			? "<$0.01"
			: `$${trayState.sessionCost.toFixed(2)}`;

	const template = [
		{ label: `Session Cost: ${costLabel}`, enabled: false },
		{ label: `Friction: ${frictionLabel}`, enabled: false },
		...(trayState.wardenRecent
			? [{ label: "⚠ Recent Warden Block", enabled: false }]
			: []),
		{ type: "separator" },
		{
			label: "Open Onlooker",
			click: () => mainWindow?.show() ?? createWindow(),
		},
		{
			label: "Weekly Review",
			click: () => mainWindow?.webContents.send(IPC.REVIEW_REQUEST, {}),
		},
		{ type: "separator" },
		{ label: "Quit", click: () => app.quit() },
	];

	tray.setContextMenu(Menu.buildFromTemplate(template));

	// Update tooltip
	const tooltip = `Onlooker · ${costLabel} · Friction: ${frictionLabel}`;
	tray.setToolTip(tooltip);
}

function updateTrayFromEvent(event) {
	// Track current session
	if (event.session && event.session !== trayState.sessionId) {
		trayState.sessionId = event.session;
		trayState.sessionCost = 0;
	}

	// Accumulate cost
	if (event.meta?.estimated_cost_usd) {
		trayState.sessionCost += event.meta.estimated_cost_usd;
	}

	// Track friction from session-level data
	if (
		event.plugin === "oracle" &&
		(event.status === "warn" || event.status === "block")
	) {
		trayState.friction = "amber";
	}
	if (event.plugin === "warden" && event.status === "block") {
		trayState.friction = "red";
		trayState.wardenRecent = true;
		trayState.lastWardenTs = Date.now();
	}
	if (event.plugin === "tribunal" && event.status === "fail") {
		trayState.friction = "red";
	}

	// Clear Warden recent after 5 minutes
	if (
		trayState.wardenRecent &&
		Date.now() - trayState.lastWardenTs > 5 * 60 * 1000
	) {
		trayState.wardenRecent = false;
	}

	updateTrayMenu();
}

function createTray() {
	const iconPath = path.join(__dirname, "../../assets/tray-icon.png");
	try {
		const icon = nativeImage
			.createFromPath(iconPath)
			.resize({ width: 16, height: 16 });
		tray = new Tray(icon);
		tray.setToolTip("Onlooker");
		updateTrayMenu();
		tray.on("click", () => mainWindow?.show());
	} catch {
		// Tray icon asset missing during dev — non-fatal
		console.warn("Tray icon not found, skipping tray");
	}
}

function registerWindowHandlers() {
	ipcMain.on(IPC.WINDOW_MINIMIZE, () => mainWindow?.minimize());
	ipcMain.on(IPC.WINDOW_MAXIMIZE, () => {
		mainWindow?.isMaximized()
			? mainWindow.unmaximize()
			: mainWindow?.maximize();
	});
	ipcMain.on(IPC.WINDOW_CLOSE, () => mainWindow?.close());
}

// ── Native notifications for high-severity events ───────────────────────────
// Listens for forwarded log events and fires native notifications for blocks,
// tribunal failures, budget alerts, and instruction health degradation.
// Rate-limited: max 1 notification per type per 30 seconds.
const notifTimestamps = {};

function maybeNotify(event) {
	if (!Notification.isSupported()) return;

	let title = null;
	let body = null;
	let key = null;

	// Warden block
	if (event.plugin === "warden" && event.status === "block") {
		key = "warden-block";
		title = "Warden blocked an injection attempt";
		const target = event.meta?.target ?? event.meta?.file ?? "";
		const category = event.meta?.pattern_matched ?? "prompt injection";
		body = `Category: ${category}${target ? ` | File: ${target.split("/").pop()}` : ""}`;
	}

	// Tribunal failure
	if (
		event.plugin === "tribunal" &&
		(event.status === "fail" || event.status === "warn")
	) {
		const score = event.meta?.score;
		if (score != null && score < 0.7) {
			key = "tribunal-fail";
			title = "Tribunal: quality gate failed";
			const target = event.meta?.target ?? "";
			body = `Score ${score.toFixed(2)}${target ? ` on ${target.split("/").pop()}` : ""}`;
		}
	}

	// Sentinel block
	if (event.plugin === "sentinel" && event.status === "block") {
		key = "sentinel-block";
		title = "Sentinel blocked a destructive operation";
		body = event.detail ?? event.label ?? "Safety gate triggered";
	}

	if (!title || !key) return;

	// Rate limit: 30s per key
	const now = Date.now();
	if (notifTimestamps[key] && now - notifTimestamps[key] < 30000) return;
	notifTimestamps[key] = now;

	const notif = new Notification({ title, body, silent: false });
	notif.on("click", () => mainWindow?.show());
	notif.show();
}

// Register notification listener after log handlers are set up
function registerNotificationListener() {
	ipcMain.on(IPC.LOGS_EVENT, (_e, _event) => {
		// This fires when log-watcher forwards events — piggyback on it
	});

	// Hook into the mainWindow webContents send to intercept events
	const origSend = mainWindow?.webContents?.send?.bind(mainWindow.webContents);
	if (origSend) {
		mainWindow.webContents.send = (channel, ...args) => {
			origSend(channel, ...args);
			if (channel === IPC.LOGS_EVENT && args[0]) {
				maybeNotify(args[0]);
				updateTrayFromEvent(args[0]);
			}
		};
	}
}

// ── Morning digest notification ─────────────────────────────────────────────
// Fires a summary notification of yesterday's activity at a configurable time.
// Fully local — aggregates JSONL data without any API calls.

let digestTimer = null;

function scheduleDigest() {
	if (digestTimer) clearTimeout(digestTimer);

	const digestHour = 8; // 8 AM — could be configurable
	const now = new Date();
	const next = new Date(now);
	next.setHours(digestHour, 0, 0, 0);
	if (next <= now) next.setDate(next.getDate() + 1);

	const delay = next.getTime() - now.getTime();
	digestTimer = setTimeout(async () => {
		await sendDigestNotification();
		scheduleDigest(); // schedule next day
	}, delay);
}

async function sendDigestNotification() {
	if (!Notification.isSupported()) return;

	try {
		// Import queryLogs and queryCosts dynamically to avoid circular deps
		const { queryLogs, queryCosts } = await import("./log-watcher.js");
		const logDir = store.get("logDir");

		// Yesterday's window
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		const events = await queryLogs(logDir, {
			from: yesterday.toISOString(),
			to: today.toISOString(),
		});
		const costs = await queryCosts(logDir, {
			from: yesterday.toISOString(),
			to: today.toISOString(),
		});

		if (events.length === 0) return; // no activity yesterday

		// Aggregate
		const sessionIds = new Set(events.map((e) => e.session).filter(Boolean));
		const totalCost = costs.reduce((s, r) => s + r.estimated_cost_usd, 0);
		const wardenBlocks = events.filter(
			(e) => e.plugin === "warden" && e.status === "block",
		).length;
		const tribunalScores = events
			.filter((e) => e.plugin === "tribunal" && e.meta?.score != null)
			.map((e) => e.meta.score);
		const avgTribunal =
			tribunalScores.length > 0
				? (
						tribunalScores.reduce((a, b) => a + b, 0) / tribunalScores.length
					).toFixed(2)
				: "—";

		const costStr = totalCost < 0.005 ? "<$0.01" : `$${totalCost.toFixed(2)}`;

		const title = "Onlooker: Yesterday's summary";
		const body = [
			`${sessionIds.size} session${sessionIds.size !== 1 ? "s" : ""} · ${costStr}`,
			wardenBlocks > 0
				? `${wardenBlocks} Warden block${wardenBlocks !== 1 ? "s" : ""}`
				: null,
			`Tribunal avg: ${avgTribunal}`,
		]
			.filter(Boolean)
			.join(" · ");

		const notif = new Notification({ title, body, silent: false });
		notif.on("click", () => mainWindow?.show());
		notif.show();
	} catch {
		// Digest is best-effort — don't crash on failures
	}
}

function registerSettingsHandlers() {
	ipcMain.handle(IPC.SETTINGS_GET, () => store.store);
	ipcMain.handle(IPC.SETTINGS_SET, (_e, partial) => {
		for (const [k, v] of Object.entries(partial)) store.set(k, v);
	});
}

app.whenReady().then(() => {
	createWindow();
	createTray();
	registerWindowHandlers();
	registerSettingsHandlers();
	registerKeyHandlers(ipcMain);
	registerChatHandlers(ipcMain, mainWindow, store);
	registerLogHandlers(ipcMain, mainWindow, store);
	registerPluginHandlers(ipcMain, store);
	registerNotificationListener();
	scheduleDigest();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => stopAllWatchers());
