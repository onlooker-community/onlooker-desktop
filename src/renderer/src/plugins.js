// Central plugin registry — single source of truth for all plugin metadata.
// Import this wherever plugin colours, labels, or categories are needed.
//
// Plugin inventory based on the Onlooker Marketplace:
//   https://github.com/onlooker-community/onlooker-marketplace

export const PLUGIN_REGISTRY = {
    // ── Core observability ────────────────────────────────────────────────────
    onlooker: {
      label:    "ONL",
      color:    "#f472b6",   // pink — the flagship
      category: "Foundational",
      desc:     "Local observability spine — telemetry, friction analysis, cost tracking",
    },
  
    // ── Quality & evaluation ──────────────────────────────────────────────────
    tribunal: {
      label:    "TRB",
      color:    "#f472b6",   // pink
      category: "LLM Judges",
      desc:     "Post-run evaluation and quality scoring via LLM judge pipeline",
    },
    echo: {
      label:    "ECH",
      color:    "#e879f9",   // fuchsia
      category: "Regression Testing",
      desc:     "Prompt regression testing — before/after signals for agent file changes",
    },
  
    // ── Safety & security ─────────────────────────────────────────────────────
    sentinel: {
      label:    "SEN",
      color:    "#fbbf24",   // yellow
      category: "Pre-Flight Gate",
      desc:     "Pre-flight safety gate for destructive Bash operations",
    },
    warden: {
      label:    "WRD",
      color:    "#fb923c",   // orange
      category: "Security",
      desc:     "Indirect prompt injection detection for WebFetch and Read content",
    },
  
    // ── Memory & continuity ───────────────────────────────────────────────────
    archivist: {
      label:    "ARC",
      color:    "#22d3ee",   // cyan
      category: "Context Preservation",
      desc:     "Structured session memory across context truncation",
    },
    relay: {
      label:    "RLY",
      color:    "#34d399",   // emerald
      category: "Session Continuity",
      desc:     "Session continuity bridge — captures task state at end, injects at start",
    },
  
    // ── Intent & documentation ────────────────────────────────────────────────
    scribe: {
      label:    "SCR",
      color:    "#a78bfa",   // purple
      category: "Intent Capture",
      desc:     "Intent documentation — captures why changes were made, not just what",
    },
    oracle: {
      label:    "ORC",
      color:    "#818cf8",   // indigo
      category: "Confidence Calibration",
      desc:     "Confidence calibration before action — catches misaligned work early",
    },
    cues: {
      label:    "CUE",
      color:    "#94a3b8",   // slate
      category: "Utility",
      desc:     "Contextual guidance injected automatically based on triggers",
    },
  
    // ── Governance & audit ────────────────────────────────────────────────────
    ledger: {
      label:    "LDG",
      color:    "#4ade80",   // green
      category: "Resource Governance",
      desc:     "Budget enforcement and cost tracking across all plugin activity",
    },
    cartographer: {
      label:    "CAR",
      color:    "#38bdf8",   // sky
      category: "Instruction Health",
      desc:     "Proactive audit of CLAUDE.md and rules files for contradictions and stale refs",
    },
  
    // ── Synthesis ─────────────────────────────────────────────────────────────
    counsel: {
      label:    "CON",
      color:    "#f9a8d4",   // light pink
      category: "Synthesis",
      desc:     "Weekly synthesis — layer-attributed improvement briefs with concrete actions",
    },
  };
  
  // Flat arrays for filter chips and iteration
  export const PLUGIN_IDS    = Object.keys(PLUGIN_REGISTRY);
  export const PLUGIN_COLORS = Object.fromEntries(PLUGIN_IDS.map(id => [id, PLUGIN_REGISTRY[id].color]));
  export const PLUGIN_LABELS = Object.fromEntries(PLUGIN_IDS.map(id => [id, PLUGIN_REGISTRY[id].label]));
  
  // Status values and their display colours
  export const STATUS_COLORS = {
    pass:  "#4ade80",   // green
    info:  "#22d3ee",   // cyan
    warn:  "#fbbf24",   // yellow
    fail:  "#f87171",   // red
    block: "#f87171",   // red
    allow: "#4ade80",   // green (warden decision mapped to pass)
  };
  export const STATUSES = Object.keys(STATUS_COLORS);
  
  // Group plugins by category for the Metrics view
  export const PLUGIN_CATEGORIES = PLUGIN_IDS.reduce((acc, id) => {
    const cat = PLUGIN_REGISTRY[id].category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(id);
    return acc;
  }, {});
  
  // Helper: get display colour for a plugin, falling back gracefully
  export function pluginColor(id) {
    return PLUGIN_REGISTRY[id]?.color ?? "#475569";
  }
  
  // Helper: get short label for a plugin
  export function pluginLabel(id) {
    return PLUGIN_REGISTRY[id]?.label ?? id?.toUpperCase().slice(0, 3) ?? "???";
  }