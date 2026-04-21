// Persistent left sidebar — navigation + live session indicator.
// Icons are text/emoji glyphs so there's no icon dependency to manage.

const C = {
  bg:          "#0b0d14",
  border:      "#1f2335",
  pink:        "#f472b6",
  green:       "#4ade80",
  yellow:      "#fbbf24",
  textMuted:   "#475569",
  textActive:  "#e2e8f0",
};

const NAV = [
  { id: "feed",    icon: "⚡", label: "Live Feed"     },
  { id: "sessions",icon: "◎",  label: "Sessions"      },
  { id: "metrics", icon: "▦",  label: "Metrics"       },
  { id: "review",  icon: "☆",  label: "Weekly Review" },
];

export default function Sidebar({ activeView, onNavigate, liveActive, blockCount, sessionCount }) {
  return (
    <div style={{
      width: 56,
      background: C.bg,
      borderRight: `1px solid ${C.border}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: 16,
      paddingBottom: 12,
      flexShrink: 0,
      // Leave room for macOS traffic lights
      paddingTop: 52,
    }}>
      {/* Wordmark dot */}
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: `${C.pink}18`,
        border: `1px solid ${C.pink}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, color: C.pink,
        marginBottom: 24, flexShrink: 0,
      }}>
        ✦
      </div>

      {/* Nav items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
        {NAV.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={activeView === item.id}
            onNavigate={onNavigate}
            badge={
              item.id === "feed" && blockCount > 0 ? blockCount :
              item.id === "sessions" && sessionCount > 0 ? sessionCount :
              null
            }
            dot={item.id === "feed" && liveActive}
          />
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings at bottom */}
      <NavItem
        item={{ id: "settings", icon: "⚙", label: "Settings" }}
        active={activeView === "settings"}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function NavItem({ item, active, onNavigate, badge, dot }) {
  return (
    <div
      onClick={() => onNavigate(item.id)}
      title={item.label}
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 40,
        cursor: "pointer",
        fontSize: 16,
        color: active ? C.textActive : C.textMuted,
        background: active ? "#ffffff0a" : "transparent",
        borderLeft: `2px solid ${active ? C.pink : "transparent"}`,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = C.textActive;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = C.textMuted;
      }}
    >
      {item.icon}

      {/* Live pulse dot (feed only) */}
      {dot && (
        <div style={{
          position: "absolute", top: 8, right: 10,
          width: 6, height: 6, borderRadius: "50%",
          background: C.green,
          boxShadow: `0 0 6px ${C.green}`,
          animation: "pulse 2s infinite",
        }} />
      )}

      {/* Badge (block/warn count) */}
      {badge != null && !dot && (
        <div style={{
          position: "absolute", top: 6, right: 8,
          minWidth: 14, height: 14, borderRadius: 7,
          background: C.yellow,
          color: "#000",
          fontSize: 8, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 3px",
          fontFamily: "monospace",
        }}>
          {badge > 99 ? "99+" : badge}
        </div>
      )}
    </div>
  );
}
