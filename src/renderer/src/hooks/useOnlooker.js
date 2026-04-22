// Central hooks — renderer ↔ main process via window.onlooker (contextBridge).
// useChat has been removed: self-hosted Onlooker Desktop is not a chat client.

import { useState, useEffect, useCallback, useRef } from "react";

const ipc = window.onlooker;

// ── useEventFeed ──────────────────────────────────────────────────────────────
// Subscribes to ~/.claude/onlooker/core/logs/*.jsonl on mount.
// Capped at 2000 events in memory; older events are visible via Sessions view.
export function useEventFeed() {
  const [events, setEvents] = useState([]);
  const [active, setActive] = useState(false); // true if events arrived in last 30s
  const lastEventRef = useRef(null);

  useEffect(() => {
    ipc.settings.get().then((s) => ipc.logs.subscribe(s.logDir));

    const unsub = ipc.logs.onEvent((event) => {
      lastEventRef.current = Date.now();
      setActive(true);
      setEvents((prev) => [...prev.slice(-1999), event]);
    });

    // Active indicator: grey out if no events for 30s
    const interval = setInterval(() => {
      if (lastEventRef.current && Date.now() - lastEventRef.current > 30000) {
        setActive(false);
      }
    }, 5000);

    return () => {
      unsub?.();
      ipc.logs.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return { events, active };
}

// ── useSessions ───────────────────────────────────────────────────────────────
// Queries historical JSONL logs and groups them into sessions.
// A "session" = all events sharing the same session ID (or same JSONL file
// if session ID isn't present in older logs).
export function useSessions() {
  const [sessions,  setSessions]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null); // session ID

  useEffect(() => {
    ipc.logs.query({}).then((events) => {
      setSessions(groupIntoSessions(events));
      setLoading(false);
    });
  }, []);

  return { sessions, loading, selected, setSelected };
}

// Group a flat event array into sessions keyed by session ID
function groupIntoSessions(events) {
  const map = new Map();
  for (const e of events) {
    const key = e.session ?? e.ts?.slice(0, 10) ?? "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }

  return Array.from(map.entries())
    .map(([id, evs]) => {
      const sorted   = evs.sort((a, b) => new Date(a.ts) - new Date(b.ts));
      const start    = sorted[0]?.ts;
      const end      = sorted[sorted.length - 1]?.ts;
      const scores   = evs.filter(e => e.plugin === "tribunal" && e.meta?.score != null)
                         .map(e => e.meta.score);
      const avgScore = scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null;
      const blocks   = evs.filter(e => e.status === "block").length;
      const warns    = evs.filter(e => e.status === "warn" || e.status === "fail").length;

      return { id, events: sorted, start, end, avgScore, blocks, warns };
    })
    .sort((a, b) => new Date(b.start) - new Date(a.start)); // newest first
}

// ── groupIntoTurns ───────────────────────────────────────────────────────────
// Reconstructs turn-level structure from a flat event array.
// A "turn" = the unit of work between a user prompt and the assistant's Stop.
//
// Uses enriched envelope fields (turn, hook_type, tool_call_seq) when present.
// Falls back to temporal heuristics for legacy events without turn data.
//
// Returns: [{ turn, start, end, events, toolCalls, cost, scores, status }]
export function groupIntoTurns(events) {
  if (!events?.length) return [];

  const hasTurnData = events.some((e) => e.turn != null);

  if (hasTurnData) return groupByTurnField(events);
  return groupByHeuristic(events);
}

// Strategy 1: group by explicit turn number from enriched envelope
function groupByTurnField(events) {
  const turnMap = new Map();
  const orphans = []; // events without a turn number (session_start, session_end, etc.)

  for (const e of events) {
    if (e.turn != null) {
      if (!turnMap.has(e.turn)) turnMap.set(e.turn, []);
      turnMap.get(e.turn).push(e);
    } else {
      orphans.push(e);
    }
  }

  const turns = Array.from(turnMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([turnNum, turnEvents]) => buildTurn(turnNum, turnEvents));

  // Attach orphans (session-level events) to nearest turn or as a preamble
  if (orphans.length && turns.length) {
    for (const o of orphans) {
      const oTime = new Date(o.ts).getTime();
      // Find the turn whose time range is closest
      let best = turns[0];
      for (const t of turns) {
        if (new Date(t.start).getTime() <= oTime) best = t;
      }
      best.events.push(o);
    }
  } else if (orphans.length) {
    // No turns at all — wrap orphans as a single pseudo-turn
    turns.push(buildTurn(0, orphans));
  }

  return turns;
}

// Strategy 2: heuristic for legacy events — split on cost_tracked (Stop hook)
// or large time gaps (>30s)
function groupByHeuristic(events) {
  const turns = [];
  let current = [];
  let turnNum = 1;

  for (const e of events) {
    current.push(e);

    const isStopEvent =
      e.type === "cost_tracked" ||
      e.hook_type === "Stop" ||
      (e.meta?.estimated_cost_usd != null && e.type !== "session_end");

    if (isStopEvent) {
      turns.push(buildTurn(turnNum++, current));
      current = [];
    }
  }

  // Remaining events form an in-progress turn
  if (current.length) {
    turns.push(buildTurn(turnNum, current, true));
  }

  return turns;
}

// Build a turn object from its events
function buildTurn(turnNum, events, inProgress = false) {
  const sorted = [...events].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const start = sorted[0]?.ts;
  const end = sorted[sorted.length - 1]?.ts;

  // Group tool calls: events sharing the same tool_call_seq, or Pre→Post pairs
  const toolCalls = buildToolCalls(sorted);

  // Aggregate scores from tribunal events
  const scores = sorted
    .filter((e) => e.plugin === "tribunal" && e.meta?.score != null)
    .map((e) => e.meta.score);
  const avgScore = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null;

  // Cost from cost_tracked / Stop events
  const costEvent = sorted.find(
    (e) => e.type === "cost_tracked" || e.meta?.estimated_cost_usd != null
  );
  const cost = costEvent?.meta?.estimated_cost_usd ?? null;

  // Token counts
  const inputTokens = costEvent?.meta?.input_tokens ?? null;
  const outputTokens = costEvent?.meta?.output_tokens ?? null;

  // Worst status in this turn
  const statusPriority = { block: 4, fail: 3, warn: 2, info: 1, pass: 0 };
  const worstStatus = sorted.reduce(
    (worst, e) =>
      (statusPriority[e.status] ?? 0) > (statusPriority[worst] ?? 0)
        ? e.status
        : worst,
    "pass"
  );

  return {
    turn: turnNum,
    start,
    end,
    events: sorted,
    toolCalls,
    avgScore,
    cost,
    inputTokens,
    outputTokens,
    status: worstStatus,
    inProgress,
  };
}

// Group events within a turn into tool call units.
// A tool call = all events sharing the same tool_call_seq (enriched),
// or Pre/PostToolUse pairs matched by tool_name + temporal proximity (legacy).
function buildToolCalls(events) {
  const hasSeq = events.some((e) => e.tool_call_seq != null);

  if (hasSeq) {
    const seqMap = new Map();
    const nonTool = [];
    for (const e of events) {
      if (e.tool_call_seq != null) {
        if (!seqMap.has(e.tool_call_seq)) seqMap.set(e.tool_call_seq, []);
        seqMap.get(e.tool_call_seq).push(e);
      } else {
        nonTool.push(e);
      }
    }
    return Array.from(seqMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([seq, evts]) => ({
        seq,
        toolName: evts[0]?.tool_name ?? evts[0]?.meta?.tool ?? "unknown",
        events: evts,
      }));
  }

  // Legacy: group consecutive Pre/PostToolUse events by tool_name
  const toolCalls = [];
  let currentCall = null;

  for (const e of events) {
    const ht = e.hook_type ?? e.type;
    const isToolEvent = ht === "PreToolUse" || ht === "PostToolUse";

    if (isToolEvent) {
      const name = e.tool_name ?? e.meta?.tool ?? "unknown";
      if (!currentCall || currentCall.toolName !== name) {
        if (currentCall) toolCalls.push(currentCall);
        currentCall = { seq: toolCalls.length + 1, toolName: name, events: [] };
      }
      currentCall.events.push(e);
    } else {
      if (currentCall) {
        toolCalls.push(currentCall);
        currentCall = null;
      }
    }
  }
  if (currentCall) toolCalls.push(currentCall);

  return toolCalls;
}

// ── useOnboarding ─────────────────────────────────────────────────────────────
// Determines which onboarding state to show on first launch.
// Returns null once onboarding is complete (logs exist).
export function useOnboarding() {
  const [state, setState] = useState("checking"); // checking|done|no_logs|no_plugins|fresh

  useEffect(() => {
    ipc.logs.query({ limit: 1 }).then((events) => {
      if (events?.length > 0) {
        setState("done");
        return;
      }
      ipc.plugins.list().then((plugins) => {
        if (plugins?.length > 0) setState("no_logs");
        else setState("fresh");
      });
    });
  }, []);

  const dismiss = () => setState("done");
  return { state, dismiss };
}

// ── useSettings ───────────────────────────────────────────────────────────────
export function useSettings() {
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    ipc.settings.get().then(setSettings);
  }, []);

  const update = useCallback(async (partial) => {
    await ipc.settings.set(partial);
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  return [settings, update];
}

// ── usePlugin ─────────────────────────────────────────────────────────────────
export function usePlugin() {
  const [running, setRunning] = useState(null);
  const [result,  setResult]  = useState(null);

  const run = useCallback(async (plugin, command, args) => {
    setRunning(`${plugin}:${command}`);
    setResult(null);
    const res = await ipc.plugins.run(plugin, command, args);
    setResult(res);
    setRunning(null);
    return res;
  }, []);

  return { run, running, result };
}
