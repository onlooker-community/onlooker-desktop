// Central hooks — renderer ↔ main process via window.onlooker (contextBridge).
// useChat has been removed: self-hosted Onlooker Desktop is not a chat client.

import { useState, useEffect, useCallback, useRef } from "react";

const ipc = window.onlooker;

// ── useEventFeed ──────────────────────────────────────────────────────────────
// Subscribes to ~/.claude/onlooker/logs/*.jsonl on mount.
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
