// Watches ~/.claude/onlooker/core/logs/*.jsonl using chokidar.
//
// The key insight is "tail" behaviour: we track a byte cursor per file so
// that when chokidar fires a "change" event we only read the bytes appended
// since the last read — not the entire file. This keeps the feed fast even
// in long sessions with thousands of events.
//
// Expected JSONL event shape (written by hook scripts):
// {
//   "ts":      "2026-04-20T14:32:01.000Z",   // ISO 8601
//   "plugin":  "tribunal",                    // which plugin fired
//   "type":    "PostToolUse",                 // hook type
//   "label":   "Quality check",               // short display label
//   "detail":  "Score 0.87 · no bias flags",  // one-line description
//   "status":  "pass",                        // pass|warn|fail|info|block
//   "session": "sess_abc123",                 // groups events by session
//   "meta":    { "score": 0.87 }              // plugin-specific payload
// }

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import chokidar from "chokidar";
import { IPC } from "../shared/ipc-channels.js";

// Map from absolute log dir path → chokidar FSWatcher
const watchers = new Map();

// Map from absolute file path → byte offset (how far we've read)
const cursors = new Map();

// JSONL files that are internal tracking data, not user-facing events.
// These are excluded from the live feed and historical queries.
const EXCLUDED_PATTERNS = [
	/hook-health\.jsonl$/,
	/session-summaries\//,
	/session-trackers\//,
	/compact-trackers\//,
	/metrics\/costs\.jsonl$/,
];

function isExcludedFile(filePath) {
	return EXCLUDED_PATTERNS.some((re) => re.test(filePath));
}

// Normalise plugin name: the marketplace plugin emits "onlooker" but
// the desktop registry uses "core" for the core observability plugin.
const PLUGIN_ALIASES = { onlooker: "core" };

function resolveDir(logDir) {
	return logDir.replace(/^~/, os.homedir());
}

// Infer plugin name from file path when the event doesn't include one.
// ~/.claude/onlooker/tribunal/session-abc.jsonl → "tribunal"
function inferPlugin(filePath, rootDir) {
	const rel = path.relative(rootDir, filePath);
	const parts = rel.split(path.sep);
	// If file is one level deep (plugin/file.jsonl), use the dir name
	if (parts.length >= 2) return parts[0];
	return null;
}

// Normalise an event from whatever schema the plugin wrote into the canonical
// shape the UI expects. Handles both the original spec shape and the actual
// Onlooker plugin schema observed in the wild.
//
// Canonical shape:
//   { ts, plugin, type, label, detail, status, session, meta,
//     hook_type?, turn?, tool_call_seq?, tool_name? }
//
// Actual plugin shape (e.g. warden, oracle):
//   { timestamp, plugin, session_id, trigger|event, tool, decision, detail, ... }
//
// Enriched envelope shape (onlooker core ≥ v0.5):
//   { timestamp, session_id, plugin, event_type, hook_type, turn, tool_call_seq,
//     tool_name, payload }
function normalise(event, inferredPlugin) {
	// Already in canonical form — has ts and label
	if (event.ts && event.label) return event;

	const rawPlugin = event.plugin ?? inferredPlugin ?? "unknown";
	const plugin = PLUGIN_ALIASES[rawPlugin] ?? rawPlugin;

	// Timestamp: prefer ts, fall back to timestamp
	const ts = event.ts ?? event.timestamp ?? new Date().toISOString();

	// Session: prefer session, fall back to session_id, then payload.session_id
	// (enriched envelope events may have empty top-level session_id with real value in payload)
	const rawSession = event.session ?? event.session_id ?? null;
	const session =
		rawSession && rawSession !== ""
			? rawSession
			: (event.payload?.session_id ?? null);

	// Status: map decision/status values to canonical set
	let status = event.status;
	// tool_outcome events: map result field to status
	const p = event.payload;
	if (!status && p?.result) {
		status = p.result === "failure" ? "fail" : "pass";
	}
	if (!status && event.decision) {
		status =
			event.decision === "block"
				? "block"
				: event.decision === "allow"
					? "pass"
					: "info";
	}
	// Oracle three-state calibration → canonical status
	if (!status && event.state) {
		status =
			event.state === "confident"
				? "pass"
				: event.state === "uncertain_recoverable"
					? "warn"
					: event.state === "uncertain_high_stakes"
						? "block"
						: "info";
	}
	status = status ?? "info";

	// Type: prefer type, fall back to event_type (enriched envelope), trigger, or event field
	const type =
		event.type ?? event.event_type ?? event.trigger ?? event.event ?? "unknown";

	// Label: build human-readable label from event data.
	let label = event.label;

	// tool_outcome: "Tool: target"
	if (!label && type === "tool_outcome" && p) {
		const tool = p.tool ?? "unknown";
		const target = p.target;
		if (target) {
			const short = target.length > 60 ? `…${target.slice(-55)}` : target;
			label = `${tool}: ${short}`;
		} else {
			label = tool;
		}
	}

	// Enriched envelope events with hook_type + tool_name: "HookType: ToolName"
	const tn = event.tool_name ?? event.payload?.tool_name ?? p?.tool ?? null;
	if (!label && tn) {
		const hookLabel = event.hook_type ?? type.replace(/_/g, " ");
		label = `${hookLabel}: ${tn}`;
	}

	// Named event types → human-readable
	if (!label && type !== "unknown") {
		const EVENT_LABELS = {
			turn_start: "Turn started",
			cost_tracked: "Cost tracked",
			session_start: "Session started",
			session_end: "Session ended",
			session_duration: "Session duration",
			tool_activity: "Tool activity",
			agent_spawn: p?.subagent_type
				? `Agent: ${p.subagent_type}`
				: "Agent spawned",
			context_compact: "Context compacted",
			skill_invoked: p?.skill ? `Skill: ${p.skill}` : "Skill invoked",
			file_read: p?.file ? `Read: ${p.file}` : "File read",
			pre_compact: "Pre-compact snapshot",
			"state-triggers": "State trigger",
			"task-gate": "Task gate",
			"context-threshold": "Context threshold",
			instruction_health: "Instruction health",
		};
		label = EVENT_LABELS[type] ?? null;
	}

	// Fallback: raw type with tool if available
	if (!label) {
		const stateHint = event.state ? ` · ${event.state.replace(/_/g, " ")}` : "";
		label = event.tool
			? `${type}: ${event.tool}${stateHint}`
			: `${type}${stateHint}`;
	}

	// Detail: for tool_outcome, show output_summary or error.
	// Otherwise fall back to standard fields.
	let detail = event.detail;
	if (!detail && type === "tool_outcome" && p) {
		detail = p.error || p.output_summary || null;
	}
	if (!detail) {
		detail =
			event.reason ?? event.pattern_matched ?? event.input_summary ?? null;
	}

	// Turn-level fields (enriched envelope, optional)
	const hook_type = event.hook_type ?? null;
	const turn = event.turn ?? null;
	const tool_call_seq = event.tool_call_seq ?? null;
	// tool_name: prefer top-level (enriched envelope), fall back to payload
	const toolName = event.tool_name ?? event.payload?.tool_name ?? null;

	// Meta: everything not in the canonical/turn fields goes into meta
	const {
		ts: _ts,
		timestamp: _timestamp,
		plugin: _plugin,
		session: _session,
		session_id: _session_id,
		status: _status,
		decision: _decision,
		type: _type,
		event_type: _et,
		trigger: _trigger,
		event: _event,
		label: _label,
		detail: _detail,
		pattern_matched: _pm,
		input_summary: _is,
		tool: _tool,
		tool_name: _tn,
		hook_type: _ht,
		turn: _turn,
		tool_call_seq: _tcs,
		payload: _payload,
		...rest
	} = event;

	const meta = {
		...(event.tool ? { tool: event.tool } : {}),
		...(event.tool_name ? { tool_name: event.tool_name } : {}),
		...(event.decision ? { decision: event.decision } : {}),
		...(event.pattern_matched
			? { pattern_matched: event.pattern_matched }
			: {}),
		// Merge payload fields into meta (enriched envelope nests plugin data here)
		...(event.payload && typeof event.payload === "object"
			? event.payload
			: {}),
		...rest,
	};

	return {
		ts,
		plugin,
		type,
		label,
		detail,
		status,
		session,
		meta,
		// Turn-level fields — null when absent (legacy events)
		...(hook_type != null ? { hook_type } : {}),
		...(turn != null ? { turn } : {}),
		...(tool_call_seq != null ? { tool_call_seq } : {}),
		...(toolName != null ? { tool_name: toolName } : {}),
	};
}

// Read only the lines appended since the last cursor position.
// Calls callback once per valid JSON line.
// filePath and rootDir are used to infer the plugin name if absent from the event.
function tailNewLines(filePath, rootDir, callback) {
	const cursor = cursors.get(filePath) ?? 0;
	const stat = fs.statSync(filePath, { throwIfNoEntry: false });
	if (!stat || stat.size <= cursor) return; // nothing new

	const stream = fs.createReadStream(filePath, {
		start: cursor,
		encoding: "utf8",
	});

	const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

	rl.on("line", (line) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		try {
			const raw = JSON.parse(trimmed);
			const inferred = inferPlugin(filePath, rootDir);
			callback(normalise(raw, inferred));
		} catch {
			// Malformed line — skip silently. Hook scripts occasionally write
			// partial lines if they're interrupted.
		}
	});

	rl.on("close", () => {
		// Advance cursor to end of file so next read starts here
		cursors.set(filePath, stat.size);
	});
}

// Recursively collect all .jsonl files under a directory.
function collectJsonlFiles(dir) {
	const results = [];
	if (!fs.existsSync(dir)) return results;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectJsonlFiles(full));
		} else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
			results.push(full);
		}
	}
	return results;
}

// Full historical scan for Weekly Review / LOGS_QUERY
export async function queryLogs(logDir, { from, to, plugins, limit } = {}) {
	const resolved = resolveDir(logDir);
	const events = [];

	const files = collectJsonlFiles(resolved).filter((f) => !isExcludedFile(f));

	for (const file of files) {
		await new Promise((resolve) => {
			const stream = fs.createReadStream(file, { encoding: "utf8" });
			const rl = readline.createInterface({
				input: stream,
				crlfDelay: Infinity,
			});

			rl.on("line", (line) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				try {
					const raw = JSON.parse(trimmed);
					const inferred = inferPlugin(file, resolved);
					const event = normalise(raw, inferred);
					const ts = new Date(event.ts);
					if (from && ts < new Date(from)) return;
					if (to && ts > new Date(to)) return;
					if (plugins && !plugins.includes(event.plugin)) return;
					events.push(event);
				} catch {
					/* skip */
				}
			});

			rl.on("close", resolve);
		});
	}

	const sorted = events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
	return limit ? sorted.slice(-limit) : sorted;
}

// Read Cartographer instruction health from state.json + latest audit file.
// Returns null when no audit has run yet (safe for first-launch).
//
// Return shape:
//   { last_audit_at, cwd, health_score, issue_count: {high,medium,low},
//     issues?: [{id,category,severity,description,files,evidence,suggestion}],
//     summary?: string }
function readInstructionHealth(logDir) {
	const resolved = resolveDir(logDir);
	const stateFile = path.join(resolved, "cartographer", "state.json");

	if (!fs.existsSync(stateFile)) return null;

	let state;
	try {
		state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
	} catch {
		return null;
	}

	const result = {
		last_audit_at: state.last_audit_at ?? null,
		cwd: state.cwd ?? null,
		health_score:
			typeof state.health_score === "number" ? state.health_score : null,
		issue_count: state.issue_count ?? { high: 0, medium: 0, low: 0 },
	};

	// Enrich with full issue list from the referenced audit file
	const auditFile = state.audit_file ?? null;
	if (auditFile && fs.existsSync(auditFile)) {
		try {
			const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
			result.issues = audit.issues ?? [];
			result.summary = audit.summary ?? null;
			result.instruction_files = audit.instruction_files ?? [];
		} catch {
			/* state.json is still valid without the audit detail */
		}
	}

	return result;
}

// Query all **/costs.jsonl files — these are excluded from the event stream
// because they're internal tracking files, but the Metrics view reads them
// directly to surface cost data as a first-class metric.
//
// Each record shape:
//   { ts, session_id, model, input_tokens, output_tokens,
//     cache_read_tokens, cache_creation_tokens, estimated_cost_usd }
//
// Multiple records per session are normal (one per Stop hook / turn).
// Caller sums them to get per-session totals.
export async function queryCosts(logDir, { from, to } = {}) {
	const resolved = resolveDir(logDir);
	const records = [];

	const costFiles = collectJsonlFiles(resolved).filter((f) =>
		/costs\.jsonl$/.test(f),
	);

	for (const file of costFiles) {
		await new Promise((resolve) => {
			const stream = fs.createReadStream(file, { encoding: "utf8" });
			const rl = readline.createInterface({
				input: stream,
				crlfDelay: Infinity,
			});

			rl.on("line", (line) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				try {
					const raw = JSON.parse(trimmed);
					const ts = raw.timestamp ?? raw.ts;
					if (!ts) return;
					if (from && new Date(ts) < new Date(from)) return;
					if (to && new Date(ts) > new Date(to)) return;
					const cost = raw.estimated_cost_usd ?? 0;
					// Skip zero-cost, zero-token records (session stubs with no activity)
					if (cost === 0 && (raw.input_tokens ?? 0) === 0) return;
					records.push({
						ts,
						session_id: raw.session_id ?? "",
						model: raw.model ?? "default",
						input_tokens: raw.input_tokens ?? 0,
						output_tokens: raw.output_tokens ?? 0,
						cache_read_tokens: raw.cache_read_tokens ?? 0,
						cache_creation_tokens: raw.cache_creation_tokens ?? 0,
						estimated_cost_usd: cost,
					});
				} catch {
					/* skip malformed lines */
				}
			});

			rl.on("close", resolve);
		});
	}

	// Deduplicate: the same turn can appear in both the old flat costs.jsonl
	// and the newer core/metrics/costs.jsonl path.
	const seen = new Set();
	const deduped = records.filter((r) => {
		const key = `${r.session_id}:${r.ts}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	return deduped.sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

// Query file attention patterns from tool events across all sessions.
// Returns [{filePath, reads, writes, total, sessionCount}] sorted by total desc.
async function queryFileAttention(logDir, { from, to } = {}) {
	const resolved = resolveDir(logDir);
	const fileMap = new Map(); // filePath → { reads, writes, sessions: Set }

	const files = collectJsonlFiles(resolved).filter((f) => !isExcludedFile(f));

	for (const file of files) {
		await new Promise((resolve) => {
			const stream = fs.createReadStream(file, { encoding: "utf8" });
			const rl = readline.createInterface({
				input: stream,
				crlfDelay: Infinity,
			});

			rl.on("line", (line) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				try {
					const raw = JSON.parse(trimmed);
					const inferred = inferPlugin(file, resolved);
					const event = normalise(raw, inferred);
					const ts = new Date(event.ts);
					if (from && ts < new Date(from)) return;
					if (to && ts > new Date(to)) return;

					// Extract file path from event
					let filePath = null;
					const toolName = event.tool_name ?? event.meta?.tool ?? null;

					if (event.meta?.target) {
						filePath = event.meta.target;
					} else if (event.meta?.file) {
						filePath = event.meta.file;
					} else if (event.label && toolName) {
						// Parse "Read: /path/to/file" style labels
						const match = event.label.match(
							/^(?:Read|Write|Edit|Glob|Grep):\s+(.+)/,
						);
						if (match) filePath = match[1].replace(/^…/, "");
					}

					if (!filePath || filePath.length < 2) return;

					const isWrite = toolName === "Write" || toolName === "Edit";
					const isRead =
						toolName === "Read" || toolName === "Grep" || toolName === "Glob";
					if (!isWrite && !isRead && event.type !== "tool_outcome") return;

					if (!fileMap.has(filePath)) {
						fileMap.set(filePath, { reads: 0, writes: 0, sessions: new Set() });
					}
					const entry = fileMap.get(filePath);
					if (isWrite) entry.writes++;
					else entry.reads++;
					if (event.session) entry.sessions.add(event.session);
				} catch {
					/* skip */
				}
			});

			rl.on("close", resolve);
		});
	}

	return Array.from(fileMap.entries())
		.map(([filePath, { reads, writes, sessions }]) => ({
			filePath,
			reads,
			writes,
			total: reads + writes,
			sessionCount: sessions.size,
		}))
		.sort((a, b) => b.total - a.total)
		.slice(0, 200);
}

// Query dead ends from Archivist dead-ends.jsonl files and archivist event logs.
async function queryDeadEnds(logDir, { from, to } = {}) {
	const resolved = resolveDir(logDir);
	const records = [];

	// Collect dead-ends.jsonl files + archivist log files
	const allFiles = collectJsonlFiles(resolved);
	const deadEndFiles = allFiles.filter((f) => /dead-ends\.jsonl$/.test(f));
	const archivistFiles = allFiles.filter(
		(f) =>
			/archivist[/\\]/.test(f) &&
			!isExcludedFile(f) &&
			!deadEndFiles.includes(f),
	);

	const filesToScan = [...deadEndFiles, ...archivistFiles];

	for (const file of filesToScan) {
		await new Promise((resolve) => {
			const stream = fs.createReadStream(file, { encoding: "utf8" });
			const rl = readline.createInterface({
				input: stream,
				crlfDelay: Infinity,
			});

			rl.on("line", (line) => {
				const trimmed = line.trim();
				if (!trimmed) return;
				try {
					const raw = JSON.parse(trimmed);
					const ts = raw.ts ?? raw.timestamp;

					if (from && ts && new Date(ts) < new Date(from)) return;
					if (to && ts && new Date(ts) > new Date(to)) return;

					// Direct dead-end record format
					if (raw.approach) {
						records.push({
							ts: ts ?? new Date().toISOString(),
							session_id: raw.session_id ?? raw.session ?? "",
							cwd: raw.cwd ?? null,
							approach: raw.approach,
							context: raw.context ?? null,
							outcome: raw.outcome ?? null,
							category: raw.category ?? null,
							tools_involved: raw.tools_involved ?? [],
							resolved: raw.resolved ?? false,
						});
						return;
					}

					// Archivist events that contain dead_ends in payload/meta
					const deadEnds =
						raw.payload?.dead_ends ?? raw.meta?.dead_ends ?? raw.dead_ends;
					if (Array.isArray(deadEnds)) {
						for (const de of deadEnds) {
							records.push({
								ts: ts ?? new Date().toISOString(),
								session_id: raw.session_id ?? raw.session ?? "",
								cwd: raw.cwd ?? raw.payload?.cwd ?? null,
								approach: de.approach ?? de.description ?? de,
								context: de.context ?? null,
								outcome: de.outcome ?? de.reason ?? null,
								category: de.category ?? null,
								tools_involved: de.tools_involved ?? de.tools ?? [],
								resolved: de.resolved ?? false,
							});
						}
					}
				} catch {
					/* skip */
				}
			});

			rl.on("close", resolve);
		});
	}

	// Deduplicate by session_id + approach
	const seen = new Set();
	const deduped = records.filter((r) => {
		const key = `${r.session_id}:${r.approach}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	return deduped.sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

// Query handoff quality by comparing Relay handoff docs with next-session Archivist data.
// Returns [{handoff_ts, cwd, score, resolved, persisted, reintroduced, next_session_id}]
async function queryHandoffQuality(logDir) {
	const resolved = resolveDir(logDir);
	const results = [];

	// Find Relay handoff files
	const allFiles = collectJsonlFiles(resolved);
	const relayFiles = allFiles.filter(
		(f) => /relay[/\\]/.test(f) && !isExcludedFile(f),
	);
	const archivistFiles = allFiles.filter(
		(f) => /archivist[/\\]/.test(f) && !isExcludedFile(f),
	);

	// Parse relay handoff events
	const handoffs = [];
	for (const file of relayFiles) {
		await new Promise((resolve) => {
			const stream = fs.createReadStream(file, { encoding: "utf8" });
			const rl = readline.createInterface({
				input: stream,
				crlfDelay: Infinity,
			});
			rl.on("line", (line) => {
				try {
					const raw = JSON.parse(line.trim());
					// Look for handoff-capture events
					if (
						raw.payload?.blocking_questions ||
						raw.blocking_questions ||
						raw.type === "handoff-capture" ||
						raw.event_type === "handoff-capture"
					) {
						const ts = raw.ts ?? raw.timestamp;
						handoffs.push({
							ts,
							cwd: raw.cwd ?? raw.payload?.cwd ?? null,
							session_id: raw.session_id ?? raw.session ?? "",
							blocking_questions:
								raw.payload?.blocking_questions ?? raw.blocking_questions ?? [],
							open_questions:
								raw.payload?.open_questions ?? raw.open_questions ?? [],
							next_action: raw.payload?.next_action ?? raw.next_action ?? null,
						});
					}
				} catch {
					/* skip */
				}
			});
			rl.on("close", resolve);
		});
	}

	// Parse archivist session extracts for open_questions
	const sessionQuestions = new Map(); // session_id → [questions]
	for (const file of archivistFiles) {
		await new Promise((resolve) => {
			const stream = fs.createReadStream(file, { encoding: "utf8" });
			const rl = readline.createInterface({
				input: stream,
				crlfDelay: Infinity,
			});
			rl.on("line", (line) => {
				try {
					const raw = JSON.parse(line.trim());
					const sid = raw.session_id ?? raw.session ?? "";
					const questions =
						raw.payload?.open_questions ?? raw.open_questions ?? [];
					if (questions.length > 0 && sid) {
						if (!sessionQuestions.has(sid)) sessionQuestions.set(sid, []);
						sessionQuestions.get(sid).push(...questions);
					}
				} catch {
					/* skip */
				}
			});
			rl.on("close", resolve);
		});
	}

	// Sort handoffs by time and score each one
	handoffs.sort((a, b) => new Date(a.ts) - new Date(b.ts));

	for (let i = 0; i < handoffs.length; i++) {
		const h = handoffs[i];
		const nextHandoff = handoffs[i + 1];
		const allQuestions = [
			...(h.blocking_questions ?? []),
			...(h.open_questions ?? []),
		];

		if (allQuestions.length === 0) {
			results.push({
				handoff_ts: h.ts,
				cwd: h.cwd,
				session_id: h.session_id,
				score: 100,
				total_questions: 0,
				resolved: 0,
				persisted: 0,
				reintroduced: 0,
				next_session_id: nextHandoff?.session_id ?? null,
			});
			continue;
		}

		// Check if questions from this handoff appear in the next session's archivist data
		const nextSid = nextHandoff?.session_id;
		const nextQuestions = nextSid ? (sessionQuestions.get(nextSid) ?? []) : [];
		const nextQuestionsLower = nextQuestions.map((q) =>
			(typeof q === "string"
				? q
				: (q.question ?? q.description ?? "")
			).toLowerCase(),
		);

		let resolved = 0;
		let persisted = 0;
		for (const q of allQuestions) {
			const qText = (
				typeof q === "string" ? q : (q.question ?? q.description ?? "")
			).toLowerCase();
			// Fuzzy match: check if any next-session question contains similar words
			const reappears = nextQuestionsLower.some((nq) => {
				const words = qText.split(/\s+/).filter((w) => w.length > 3);
				return (
					words.length > 0 &&
					words.filter((w) => nq.includes(w)).length >= words.length * 0.5
				);
			});
			if (reappears) persisted++;
			else resolved++;
		}

		const score = Math.round((resolved / allQuestions.length) * 100);

		results.push({
			handoff_ts: h.ts,
			cwd: h.cwd,
			session_id: h.session_id,
			score,
			total_questions: allQuestions.length,
			resolved,
			persisted,
			reintroduced: 0,
			next_session_id: nextSid ?? null,
		});
	}

	return results.sort(
		(a, b) => new Date(b.handoff_ts) - new Date(a.handoff_ts),
	);
}

// Build an instruction graph from Cartographer audit data and instruction files.
// Returns { nodes: [{id, type, label, file, issues}], edges: [{source, target, type}] }
function queryInstructionGraph(logDir) {
	const _resolved = resolveDir(logDir);
	const health = readInstructionHealth(logDir);
	const nodes = [];
	const edges = [];
	const nodeMap = new Map();

	// Helper to add a node if not already present
	function addNode(id, props) {
		if (nodeMap.has(id)) return;
		nodeMap.set(id, nodes.length);
		nodes.push({ id, ...props });
	}

	// Parse instruction files from Cartographer data
	const instructionFiles = health?.instruction_files ?? [];
	const issues = health?.issues ?? [];
	const cwd = health?.cwd ?? "";

	// If we have instruction files from the audit, use those
	if (instructionFiles.length > 0) {
		for (const f of instructionFiles) {
			const relPath = cwd ? f.replace(`${cwd}/`, "") : f;
			const name = relPath.split("/").pop();
			addNode(f, {
				type: "file",
				label: name,
				file: relPath,
				issues: issues.filter(
					(iss) => iss.files?.includes(f) || iss.files?.includes(relPath),
				).length,
			});
		}
	} else {
		// Fallback: try to discover instruction files from known paths
		const tryPaths = [
			path.join(cwd || os.homedir(), "CLAUDE.md"),
			path.join(cwd || os.homedir(), ".claude", "CLAUDE.md"),
		];
		// Also check .claude/rules/
		const rulesDir = path.join(cwd || os.homedir(), ".claude", "rules");
		if (fs.existsSync(rulesDir)) {
			try {
				for (const entry of fs.readdirSync(rulesDir, { withFileTypes: true })) {
					if (entry.isFile() && entry.name.endsWith(".md")) {
						tryPaths.push(path.join(rulesDir, entry.name));
					}
				}
			} catch {
				/* skip */
			}
		}

		for (const f of tryPaths) {
			if (fs.existsSync(f)) {
				const relPath = cwd ? f.replace(`${cwd}/`, "") : f;
				const name = relPath.split("/").pop();
				addNode(f, { type: "file", label: name, file: relPath, issues: 0 });
			}
		}
	}

	// Add issue nodes and edges from Cartographer findings
	for (const iss of issues) {
		const issId = `issue:${iss.id ?? iss.description?.slice(0, 40)}`;
		addNode(issId, {
			type:
				iss.severity === "high" ? "contradiction" : (iss.category ?? "issue"),
			label: iss.description?.slice(0, 60) ?? "Issue",
			severity: iss.severity,
			category: iss.category,
		});

		// Link issue to relevant files
		for (const f of iss.files ?? []) {
			const fileId = nodeMap.has(f)
				? f
				: [...nodeMap.keys()].find((k) => k.endsWith(f));
			if (fileId) {
				edges.push({
					source: fileId,
					target: issId,
					type: iss.severity === "high" ? "contradiction" : "reference",
				});
			}
		}
	}

	// Add cross-reference edges between instruction files (if content available)
	const fileNodes = nodes.filter((n) => n.type === "file");
	for (const fn of fileNodes) {
		const fullPath = instructionFiles.find((f) => f === fn.id) ?? fn.id;
		try {
			const content = fs.readFileSync(fullPath, "utf8");
			for (const other of fileNodes) {
				if (other.id === fn.id) continue;
				if (content.includes(other.label) || content.includes(other.file)) {
					edges.push({ source: fn.id, target: other.id, type: "reference" });
				}
			}
		} catch {
			/* file may not be accessible */
		}
	}

	return {
		nodes,
		edges,
		health_score: health?.health_score ?? null,
		issue_count: health?.issue_count ?? { high: 0, medium: 0, low: 0 },
	};
}

// Instruction file watcher — watches CLAUDE.md and .claude/rules/*.md for changes.
// Sends diffs to the renderer when changes are detected.
const instructionWatchers = new Map();

function watchInstructionFiles(mainWindow, paths) {
	// Stop any existing instruction watchers
	stopInstructionWatchers();

	for (const dir of paths) {
		const resolved = resolveDir(dir);
		const patterns = [
			path.join(resolved, "CLAUDE.md"),
			path.join(resolved, ".claude", "CLAUDE.md"),
			path.join(resolved, ".claude", "rules", "*.md"),
		];

		// Read initial file contents for diffing
		const fileContents = new Map();
		for (const pattern of patterns) {
			// For glob patterns, resolve them
			const base = pattern.replace(/\*\.md$/, "");
			if (pattern.includes("*")) {
				if (fs.existsSync(base)) {
					try {
						for (const entry of fs.readdirSync(base)) {
							if (entry.endsWith(".md")) {
								const full = path.join(base, entry);
								try {
									fileContents.set(full, fs.readFileSync(full, "utf8"));
								} catch {}
							}
						}
					} catch {}
				}
			} else if (fs.existsSync(pattern)) {
				try {
					fileContents.set(pattern, fs.readFileSync(pattern, "utf8"));
				} catch {}
			}
		}

		const watcher = chokidar.watch(patterns, {
			persistent: true,
			ignoreInitial: true,
			awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
		});

		watcher.on("change", (filePath) => {
			try {
				const newContent = fs.readFileSync(filePath, "utf8");
				const oldContent = fileContents.get(filePath) ?? "";
				fileContents.set(filePath, newContent);

				const relPath = filePath.replace(`${resolved}/`, "");

				// Compute simple line-level diff
				const oldLines = oldContent.split("\n");
				const newLines = newContent.split("\n");
				const added = newLines.filter((l) => !oldLines.includes(l)).length;
				const removed = oldLines.filter((l) => !newLines.includes(l)).length;

				mainWindow?.webContents.send(IPC.WATCH_INSTRUCTIONS_EVENT, {
					type: "change",
					file: relPath,
					fullPath: filePath,
					dir: resolved,
					ts: new Date().toISOString(),
					added,
					removed,
					oldContent,
					newContent,
				});
			} catch {
				/* skip */
			}
		});

		watcher.on("add", (filePath) => {
			try {
				const content = fs.readFileSync(filePath, "utf8");
				fileContents.set(filePath, content);
				const relPath = filePath.replace(`${resolved}/`, "");

				mainWindow?.webContents.send(IPC.WATCH_INSTRUCTIONS_EVENT, {
					type: "add",
					file: relPath,
					fullPath: filePath,
					dir: resolved,
					ts: new Date().toISOString(),
					added: content.split("\n").length,
					removed: 0,
					oldContent: "",
					newContent: content,
				});
			} catch {
				/* skip */
			}
		});

		instructionWatchers.set(resolved, watcher);
	}
}

function stopInstructionWatchers() {
	for (const w of instructionWatchers.values()) w.close();
	instructionWatchers.clear();
}

export function registerLogHandlers(ipcMain, mainWindow, store) {
	const forward = (event) =>
		mainWindow?.webContents.send(IPC.LOGS_EVENT, event);

	ipcMain.handle(IPC.LOGS_SUBSCRIBE, async (_e, { logDir }) => {
		const dir = resolveDir(logDir ?? store.get("logDir"));

		// Create the directory if it doesn't exist yet
		fs.mkdirSync(dir, { recursive: true });

		// Stop any existing watcher for this directory before creating a new one
		watchers.get(dir)?.close();
		cursors.clear();

		// Pre-set cursors to EOF for all existing JSONL files. Without this, the
		// first "change" event on any pre-existing file (counsel, warden, oracle…)
		// would replay its *entire* history from byte 0 — because tailNewLines
		// starts from cursor 0 when a file hasn't been seen yet. Pre-setting to
		// EOF means only content written *after* this subscribe call is forwarded
		// as live events.
		//
		// Cartographer writes a new file per audit (never appends), so its most
		// recent event file would have been skipped entirely by ignoreInitial:true
		// and never received a change event. The initial hydration below fills
		// this gap for Cartographer and any other plugin in the same situation.
		const existingFiles = collectJsonlFiles(dir).filter(
			(f) => !isExcludedFile(f),
		);
		for (const file of existingFiles) {
			const stat = fs.statSync(file, { throwIfNoEntry: false });
			if (stat) cursors.set(file, stat.size);
		}

		// Use **/*.jsonl to watch files at any subdirectory depth:
		//   ~/.claude/onlooker/tribunal/session-abc.jsonl  ✓
		//   ~/.claude/onlooker/sentinel/session-abc.jsonl  ✓
		//   ~/.claude/onlooker/session-abc.jsonl           ✓ (flat layout also works)
		const watcher = chokidar.watch(path.join(dir, "**", "*.jsonl"), {
			persistent: true,
			ignoreInitial: true, // don't replay past events on startup
			awaitWriteFinish: {
				stabilityThreshold: 50,
				pollInterval: 50,
			},
		});

		watcher.on("change", (filePath) => {
			if (!isExcludedFile(filePath)) tailNewLines(filePath, dir, forward);
		});

		watcher.on("add", (filePath) => {
			// New file created while the app is running (e.g. a fresh Cartographer
			// audit). Read from byte 0 — cursor was never set for this path.
			if (!isExcludedFile(filePath)) tailNewLines(filePath, dir, forward);
		});

		watchers.set(dir, watcher);

		// Hydrate the live feed with recent history (last 2 hours) so the feed
		// isn't empty on first open and shows context from recent sessions.
		// This surfaces events from Cartographer, Oracle, Cues, and other plugins
		// whose files existed before the watcher started.
		const from = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
		const initial = await queryLogs(dir, { from, limit: 500 });

		return { ok: true, dir, initial };
	});

	ipcMain.handle(IPC.LOGS_UNSUBSCRIBE, () => {
		for (const w of watchers.values()) w.close();
		watchers.clear();
		cursors.clear();
		return { ok: true };
	});

	ipcMain.handle(IPC.LOGS_QUERY, (_e, opts) => {
		return queryLogs(store.get("logDir"), opts ?? {});
	});

	ipcMain.handle(IPC.COSTS_QUERY, (_e, opts) => {
		return queryCosts(store.get("logDir"), opts ?? {});
	});

	ipcMain.handle(IPC.HEALTH_QUERY, () => {
		return readInstructionHealth(store.get("logDir"));
	});

	ipcMain.handle(IPC.HEATMAP_QUERY, (_e, opts) => {
		return queryFileAttention(store.get("logDir"), opts ?? {});
	});

	ipcMain.handle(IPC.DEAD_ENDS_QUERY, (_e, opts) => {
		return queryDeadEnds(store.get("logDir"), opts ?? {});
	});

	ipcMain.handle(IPC.HANDOFF_QUALITY_QUERY, () => {
		return queryHandoffQuality(store.get("logDir"));
	});

	ipcMain.handle(IPC.INSTRUCTION_GRAPH_QUERY, () => {
		return queryInstructionGraph(store.get("logDir"));
	});

	ipcMain.handle(IPC.WATCH_INSTRUCTIONS, (_e, { paths }) => {
		watchInstructionFiles(mainWindow, paths ?? []);
		return { ok: true };
	});

	ipcMain.handle(IPC.WATCH_INSTRUCTIONS_STOP, () => {
		stopInstructionWatchers();
		return { ok: true };
	});
}

export function stopAllWatchers() {
	for (const w of watchers.values()) w.close();
	watchers.clear();
	stopInstructionWatchers();
}
