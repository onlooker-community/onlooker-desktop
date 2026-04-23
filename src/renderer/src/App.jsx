// Root component for Onlooker Desktop (self-hosted).
// No chat pane. Five views accessed via sidebar:
//   LiveFeed | Sessions | Metrics | Security | WeeklyReview
// Plus Settings modal.
// Onboarding screen shown on first launch if no logs are found.

import { useState, useEffect, useCallback } from "react";
import Sidebar       from "./components/Sidebar.jsx";
import Onboarding    from "./components/Onboarding.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import LiveFeed      from "./views/LiveFeed.jsx";
import Sessions      from "./views/Sessions.jsx";
import Metrics       from "./views/Metrics.jsx";
import Security      from "./views/Security.jsx";
import Heatmap       from "./views/Heatmap.jsx";
import DeadEndMap    from "./views/DeadEndMap.jsx";
import Anomalies     from "./views/Anomalies.jsx";
import InstructionGraph from "./views/InstructionGraph.jsx";
import PromptDiffing from "./views/PromptDiffing.jsx";
import ProjectDashboard from "./views/ProjectDashboard.jsx";
import HandoffQuality from "./views/HandoffQuality.jsx";
import MultiProject  from "./views/MultiProject.jsx";
import SynthesisLayer from "./views/SynthesisLayer.jsx";
import QuickOpen     from "./components/QuickOpen.jsx";
import SessionReplay from "./views/SessionReplay.jsx";
import WeeklyReview  from "./views/WeeklyReview.jsx";

import {
  useEventFeed,
  useSessions,
  useSettings,
  useOnboarding,
  useInstructionHealth,
  useContextPressure,
} from "./hooks/useOnlooker.js";

const C = { bg0: "#0b0d14", bg1: "#12151f", border: "#1f2335" };

export default function App() {
  const { events, active }        = useEventFeed();
  const { sessions, loading }     = useSessions();
  const [settings, updateSettings]= useSettings();
  const { state: onboardState, dismiss: dismissOnboard } = useOnboarding();
  const health                    = useInstructionHealth();
  const pressure                  = useContextPressure(events, settings?.contextWindowSize ?? 200000);

  const [view,        setView]        = useState("feed");
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);

  // Block count for current session (last session in the feed)
  const currentSessionId = events[events.length - 1]?.session;
  const currentBlocks = events.filter(
    (e) => e.session === currentSessionId && e.status === "block"
  ).length;

  // Warden blocks across all known sessions — drives the Security badge.
  const wardenBlocks = sessions.reduce((sum, s) =>
    sum + (s.events ?? []).filter((e) => e.plugin === "warden" && e.status === "block").length
  , 0);

  // ⌘K quick-open
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowQuickOpen((o) => !o);
      }
      if (e.key === "Escape") setShowQuickOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Show onboarding until the user has logs or dismisses
  const showOnboarding = onboardState !== "done" && onboardState !== "checking";

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100%",
      background: C.bg0, overflow: "hidden",
      // macOS title bar: inset traffic lights via titleBarStyle: "hiddenInset"
      // We handle the drag region with a pseudo-element in index.css
    }}>
      {/* Sidebar */}
      <Sidebar
        activeView={showSettings ? "settings" : view}
        onNavigate={(v) => {
          if (v === "settings") {
            setShowSettings(true);
          } else {
            setShowSettings(false);
            setView(v);
          }
        }}
        liveActive={active}
        blockCount={currentBlocks}
        wardenBlocks={wardenBlocks}
        health={health}
        pressure={pressure}
        sessionCount={sessions.filter((s) => {
          const today = new Date().toDateString();
          return s.start && new Date(s.start).toDateString() === today;
        }).length}
      />

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0,
        position: "relative" }}>

        {/* macOS traffic light drag region */}
        <div className="titlebar-drag" style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 40, zIndex: 10, pointerEvents: "none",
        }} />

        {showOnboarding
          ? <Onboarding state={onboardState} onDismiss={dismissOnboard} />
          : (
            <div style={{ flex: 1, minHeight: 0, paddingTop: 40 }}>
              {view === "feed"     && <LiveFeed  events={events} active={active} />}
              {view === "sessions" && <Sessions  sessions={sessions} loading={loading} />}
              {view === "metrics"  && <Metrics   sessions={sessions} />}
              {view === "security" && <Security  sessions={sessions} />}
              {view === "replay"   && <SessionReplay sessions={sessions} />}
              {view === "project"  && <ProjectDashboard sessions={sessions} />}
              {view === "multiproj" && <MultiProject sessions={sessions} />}
              {view === "synthesis" && <SynthesisLayer sessions={sessions} />}
              {view === "heatmap"  && <Heatmap />}
              {view === "anomalies" && <Anomalies sessions={sessions} />}
              {view === "deadends" && <DeadEndMap />}
              {view === "instgraph" && <InstructionGraph />}
              {view === "diffing"  && <PromptDiffing />}
              {view === "handoffs" && <HandoffQuality />}
              {view === "review"   && <WeeklyReview sessions={sessions} />}
            </div>
          )
        }
      </div>

      {/* Quick Open (⌘K) */}
      {showQuickOpen && (
        <QuickOpen
          sessions={sessions}
          onNavigate={(v) => { setView(v); setShowQuickOpen(false); }}
          onClose={() => setShowQuickOpen(false)}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
