// Root component for Onlooker Desktop (self-hosted).
// No chat pane. Five views accessed via sidebar:
//   LiveFeed | Sessions | Metrics | Security | WeeklyReview
// Plus Settings modal.
// Onboarding screen shown on first launch if no logs are found.

import { useState } from "react";
import Sidebar       from "./components/Sidebar.jsx";
import Onboarding    from "./components/Onboarding.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import LiveFeed      from "./views/LiveFeed.jsx";
import Sessions      from "./views/Sessions.jsx";
import Metrics       from "./views/Metrics.jsx";
import Security      from "./views/Security.jsx";
import WeeklyReview  from "./views/WeeklyReview.jsx";

import {
  useEventFeed,
  useSessions,
  useSettings,
  useOnboarding,
} from "./hooks/useOnlooker.js";

const C = { bg0: "#0b0d14", bg1: "#12151f", border: "#1f2335" };

export default function App() {
  const { events, active }        = useEventFeed();
  const { sessions, loading }     = useSessions();
  const [settings, updateSettings]= useSettings();
  const { state: onboardState, dismiss: dismissOnboard } = useOnboarding();

  const [view,        setView]        = useState("feed");
  const [showSettings, setShowSettings] = useState(false);

  // Block count for current session (last session in the feed)
  const currentSessionId = events[events.length - 1]?.session;
  const currentBlocks = events.filter(
    (e) => e.session === currentSessionId && e.status === "block"
  ).length;

  // Warden blocks across all known sessions — drives the Security badge.
  const wardenBlocks = sessions.reduce((sum, s) =>
    sum + (s.events ?? []).filter((e) => e.plugin === "warden" && e.status === "block").length
  , 0);

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
              {view === "review"   && <WeeklyReview sessions={sessions} />}
            </div>
          )
        }
      </div>

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
