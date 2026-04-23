// Attention Heatmap — treemap of agent file reads/writes across sessions.
// Redesigned for usability: drill-down navigation, collapsed paths, readable cells.

import { useState, useMemo } from "react";
import { useFileAttention } from "../hooks/useOnlooker.js";

const C = {
  bg0: "#0b0d14", bg1: "#12151f", bg2: "#181c2a", bg3: "#1f2335",
  border: "#252a3d",
  pink: "#f472b6", cyan: "#22d3ee", yellow: "#fbbf24",
  green: "#4ade80",
  textPrimary: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "#475569",
};

function fmtCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// Strip longest common prefix to make paths project-relative.
function stripCommonPrefix(files) {
  if (files.length === 0) return { files: [], prefix: "" };
  const paths = files.map((f) => f.filePath);
  const parts0 = paths[0].split("/");
  let prefixLen = 0;
  for (let i = 0; i < parts0.length - 1; i++) {
    const seg = parts0[i];
    if (paths.every((p) => p.split("/")[i] === seg)) prefixLen = i + 1;
    else break;
  }
  const prefix = parts0.slice(0, prefixLen).join("/");
  return {
    prefix,
    files: files.map((f) => ({
      ...f,
      relPath: prefix ? f.filePath.slice(prefix.length + 1) : f.filePath,
    })),
  };
}

// Build a nested tree from flat file list, collapsing single-child directories.
// e.g. src/renderer/src/views → "src/renderer/src/views" as one node.
function buildTree(files) {
  const root = { name: "", children: {}, reads: 0, writes: 0, total: 0, fileCount: 0 };

  for (const f of files) {
    const parts = f.relPath.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      if (!node.children[seg]) {
        node.children[seg] = { name: seg, children: {}, reads: 0, writes: 0, total: 0, fileCount: 0 };
      }
      node = node.children[seg];
    }
    node.reads += f.reads;
    node.writes += f.writes;
    node.total += f.total;
    node.fileCount = 1;
  }

  // Propagate totals up
  function sumNode(node) {
    const kids = Object.values(node.children);
    for (const kid of kids) sumNode(kid);
    if (kids.length > 0) {
      node.reads = kids.reduce((s, k) => s + k.reads, 0) + node.reads;
      node.writes = kids.reduce((s, k) => s + k.writes, 0) + node.writes;
      node.total = kids.reduce((s, k) => s + k.total, 0) + node.total;
      node.fileCount = kids.reduce((s, k) => s + k.fileCount, 0) + node.fileCount;
    }
  }
  sumNode(root);

  // Collapse single-child directories (e.g. src → src/renderer → src/renderer/src)
  function collapse(node) {
    const kids = Object.values(node.children);
    for (const kid of kids) collapse(kid);

    const entries = Object.entries(node.children);
    if (entries.length === 1) {
      const [childName, child] = entries[0];
      const childKids = Object.keys(child.children);
      if (childKids.length > 0) {
        // Merge: absorb child into parent by combining names
        const newChildren = {};
        for (const [gk, gv] of Object.entries(child.children)) {
          newChildren[gk] = gv;
        }
        node.children = newChildren;
        node.name = node.name ? `${node.name}/${childName}` : childName;
      }
    }
  }
  collapse(root);

  return root;
}

// Interpolate between two hex colors.
function lerpColor(a, b, t) {
  const parse = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

// ── Directory bar chart ─────────────────────────────────────────────────────
// Shows one level of the tree as horizontal bars — the primary visualization.
// Clicking a directory drills into it; breadcrumb lets you navigate back up.

function DirectoryBar({ node, maxInLevel, onDrillDown }) {
  const [hovered, setHovered] = useState(false);
  const kids = Object.keys(node.children);
  const isDir = kids.length > 0;
  const pct = maxInLevel > 0 ? (node.total / maxInLevel) * 100 : 0;
  const dominantColor = node.writes >= node.reads ? C.pink : C.cyan;
  const readPct = node.total > 0 ? (node.reads / node.total) * 100 : 0;
  const writePct = node.total > 0 ? (node.writes / node.total) * 100 : 0;

  return (
    <div
      onClick={isDir ? () => onDrillDown(node) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
        borderRadius: 6, cursor: isDir ? "pointer" : "default",
        background: hovered ? `${dominantColor}12` : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Icon */}
      <span style={{
        fontSize: 11, color: isDir ? C.yellow : C.textMuted,
        width: 14, textAlign: "center", flexShrink: 0,
      }}>
        {isDir ? "▸" : "·"}
      </span>

      {/* Name */}
      <span style={{
        fontSize: 11, color: isDir ? C.textPrimary : C.textSecondary,
        fontFamily: "monospace", width: 200, flexShrink: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontWeight: isDir ? 600 : 400,
      }}>
        {node.name}{isDir ? "/" : ""}
      </span>

      {/* Stacked bar (read + write proportions) */}
      <div style={{
        flex: 1, height: 6, borderRadius: 3, background: C.bg3,
        overflow: "hidden", display: "flex",
      }}>
        <div style={{
          width: `${(node.reads / Math.max(maxInLevel, 1)) * 100}%`,
          height: "100%", background: C.cyan, opacity: 0.8,
          transition: "width 0.3s",
        }} />
        <div style={{
          width: `${(node.writes / Math.max(maxInLevel, 1)) * 100}%`,
          height: "100%", background: C.pink, opacity: 0.8,
          transition: "width 0.3s",
        }} />
      </div>

      {/* Counts */}
      <div style={{
        display: "flex", gap: 8, flexShrink: 0, fontSize: 10,
        fontFamily: "monospace",
      }}>
        <span style={{ color: C.cyan, width: 32, textAlign: "right" }}>{node.reads}r</span>
        <span style={{ color: C.pink, width: 32, textAlign: "right" }}>{node.writes}w</span>
        <span style={{ color: C.textMuted, width: 36, textAlign: "right" }}>{node.total}</span>
      </div>

      {/* File count for dirs */}
      {isDir && (
        <span style={{
          fontSize: 9, color: C.textMuted, fontFamily: "monospace",
          width: 40, textAlign: "right", flexShrink: 0,
        }}>
          {node.fileCount} file{node.fileCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function DrillDownView({ tree, onNavigate }) {
  const [path, setPath] = useState([]); // stack of node names for breadcrumb

  // Navigate to a node by walking the path from root
  const currentNode = useMemo(() => {
    let node = tree;
    for (const seg of path) {
      const found = Object.values(node.children).find((k) => k.name === seg);
      if (!found) { setPath([]); return tree; }
      node = found;
    }
    return node;
  }, [tree, path]);

  const kids = Object.values(currentNode.children)
    .filter((k) => k.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxInLevel = kids.length > 0 ? kids[0].total : 0;

  const drillDown = (node) => {
    setPath((prev) => [...prev, node.name]);
  };

  const navigateTo = (idx) => {
    setPath((prev) => prev.slice(0, idx));
  };

  return (
    <div style={{
      background: C.bg2, borderRadius: 10, padding: "16px 18px",
      border: `1px solid ${C.border}`, marginBottom: 16,
    }}>
      {/* Header + breadcrumb */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
        flexWrap: "wrap",
      }}>
        <div style={{
          fontSize: 10, color: C.textMuted, letterSpacing: "0.07em",
          textTransform: "uppercase", fontFamily: "monospace",
        }}>
          File Attention
        </div>
        <div style={{ flex: 1 }} />

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <span
            onClick={() => navigateTo(0)}
            style={{
              fontSize: 10, color: path.length > 0 ? C.pink : C.textSecondary,
              fontFamily: "monospace", cursor: path.length > 0 ? "pointer" : "default",
            }}
          >
            root
          </span>
          {path.map((seg, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <span style={{ fontSize: 10, color: C.textMuted }}>/</span>
              <span
                onClick={() => navigateTo(i + 1)}
                style={{
                  fontSize: 10,
                  color: i < path.length - 1 ? C.pink : C.textSecondary,
                  fontFamily: "monospace",
                  cursor: i < path.length - 1 ? "pointer" : "default",
                }}
              >
                {seg}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "0 10px 6px",
        borderBottom: `1px solid ${C.border}`, marginBottom: 4,
      }}>
        <span style={{ width: 14 }} />
        <span style={{
          fontSize: 9, color: C.textMuted, fontFamily: "monospace",
          width: 200, textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          Name
        </span>
        <span style={{ flex: 1, fontSize: 9, color: C.textMuted, fontFamily: "monospace" }}>
          Distribution
        </span>
        <div style={{ display: "flex", gap: 8, fontSize: 9, fontFamily: "monospace" }}>
          <span style={{ color: C.cyan, width: 32, textAlign: "right" }}>Read</span>
          <span style={{ color: C.pink, width: 32, textAlign: "right" }}>Write</span>
          <span style={{ color: C.textMuted, width: 36, textAlign: "right" }}>Total</span>
        </div>
        <span style={{ width: 40 }} />
      </div>

      {/* Bars */}
      {kids.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: C.textMuted, fontSize: 11 }}>
          Empty directory
        </div>
      ) : (
        kids.map((kid) => (
          <DirectoryBar
            key={kid.name}
            node={kid}
            maxInLevel={maxInLevel}
            onDrillDown={drillDown}
          />
        ))
      )}

      {/* Legend */}
      <div style={{
        display: "flex", gap: 16, marginTop: 12, paddingTop: 8,
        borderTop: `1px solid ${C.border}`, fontSize: 9, color: C.textMuted,
      }}>
        <span>Click directories to drill down</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 4, background: C.cyan, borderRadius: 1, opacity: 0.8 }} /> reads
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 4, background: C.pink, borderRadius: 1, opacity: 0.8 }} /> writes
        </span>
      </div>
    </div>
  );
}

// ── Heatmap grid ────────────────────────────────────────────────────────────
// A compact grid of the top N files, sized by access count.
// Much more readable than a nested treemap for flat file lists.

function HeatmapGrid({ files }) {
  const [hovered, setHovered] = useState(null);
  const top = files.slice(0, 40);
  if (top.length === 0) return null;

  const maxTotal = top[0].total;

  return (
    <div style={{
      background: C.bg2, borderRadius: 10, padding: "16px 18px",
      border: `1px solid ${C.border}`, marginBottom: 16,
    }}>
      <div style={{
        fontSize: 10, color: C.textMuted, letterSpacing: "0.07em",
        textTransform: "uppercase", fontFamily: "monospace", marginBottom: 12,
      }}>
        Hotspot Grid — Top {top.length} Files
      </div>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 4,
      }}>
        {top.map((f) => {
          const intensity = maxTotal > 0 ? Math.min(f.total / maxTotal, 1) : 0;
          const dominantColor = f.writes >= f.reads ? C.pink : C.cyan;
          const bg = lerpColor("#1a1c2e", dominantColor, intensity * 0.65);
          const fileName = f.relPath.split("/").pop();
          const dirPath = f.relPath.split("/").slice(0, -1).join("/");
          const isHovered = hovered === f.relPath;
          // Size cells proportionally but with a reasonable min
          const cellSize = Math.max(60, Math.round(40 + intensity * 80));

          return (
            <div
              key={f.relPath}
              onMouseEnter={() => setHovered(f.relPath)}
              onMouseLeave={() => setHovered(null)}
              title={`${f.relPath}\n${f.reads} reads, ${f.writes} writes, ${f.sessionCount} sessions`}
              style={{
                width: cellSize,
                height: cellSize,
                background: isHovered ? `${dominantColor}44` : bg,
                borderRadius: 6,
                padding: "6px 8px",
                border: `1px solid ${isHovered ? dominantColor : C.border}`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                overflow: "hidden",
                cursor: "default",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div>
                <div style={{
                  fontSize: 10, color: C.textPrimary, fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  fontFamily: "monospace",
                }}>
                  {fileName}
                </div>
                {dirPath && (
                  <div style={{
                    fontSize: 8, color: C.textMuted, marginTop: 1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {dirPath}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 9, color: C.textMuted, fontFamily: "monospace",
                display: "flex", gap: 4,
              }}>
                <span style={{ color: C.cyan }}>{f.reads}r</span>
                <span style={{ color: C.pink }}>{f.writes}w</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: C.bg2, borderRadius: 10, padding: "14px 16px",
      border: `1px solid ${C.border}`, flex: 1, minWidth: 0,
    }}>
      <div style={{
        fontSize: 22, fontWeight: 700, lineHeight: 1, marginBottom: 4,
        color: color ?? C.textPrimary, fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.textSecondary }}>{label}</div>
    </div>
  );
}

function TopFilesTable({ files, maxTotal }) {
  const top = files.slice(0, 20);
  if (top.length === 0) return null;

  return (
    <div style={{
      background: C.bg2, borderRadius: 10, padding: "16px 18px",
      border: `1px solid ${C.border}`,
    }}>
      <div style={{
        fontSize: 10, color: C.textMuted, letterSpacing: "0.07em",
        textTransform: "uppercase", fontFamily: "monospace", marginBottom: 12,
      }}>
        Top Files by Total Access
      </div>
      {top.map((f, i) => {
        const short = f.relPath.length > 55
          ? "..." + f.relPath.slice(-52)
          : f.relPath;
        return (
          <div key={f.relPath} style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 7,
          }}>
            <span style={{
              fontSize: 10, color: C.textMuted, fontFamily: "monospace",
              width: 18, textAlign: "right", flexShrink: 0,
            }}>
              {i + 1}.
            </span>
            <span style={{
              fontSize: 10, color: C.textSecondary, flex: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              fontFamily: "monospace",
            }}>
              {short}
            </span>
            <div style={{
              width: 120, height: 4, borderRadius: 2, background: C.bg3,
              overflow: "hidden", display: "flex", flexShrink: 0,
            }}>
              <div style={{
                width: `${(f.reads / Math.max(maxTotal, 1)) * 100}%`,
                height: "100%", background: C.cyan, opacity: 0.8,
              }} />
              <div style={{
                width: `${(f.writes / Math.max(maxTotal, 1)) * 100}%`,
                height: "100%", background: C.pink, opacity: 0.8,
              }} />
            </div>
            <span style={{
              fontSize: 9, color: C.textMuted, fontFamily: "monospace",
              width: 70, textAlign: "right", flexShrink: 0,
            }}>
              {f.reads}r {f.writes}w
            </span>
          </div>
        );
      })}
      <div style={{
        display: "flex", gap: 16, marginTop: 10, fontSize: 9, color: C.textMuted,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 3, background: C.cyan, borderRadius: 1, opacity: 0.8 }} /> reads
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 3, background: C.pink, borderRadius: 1, opacity: 0.8 }} /> writes
        </span>
      </div>
    </div>
  );
}

export default function Heatmap() {
  const { files: rawFiles, loading } = useFileAttention();

  const { files, prefix } = useMemo(() => stripCommonPrefix(rawFiles), [rawFiles]);
  const tree = useMemo(() => buildTree(files), [files]);
  const maxTotal = files.length > 0 ? Math.max(...files.map((f) => f.total)) : 0;

  const mostRead = useMemo(() => {
    if (files.length === 0) return "—";
    const sorted = [...files].sort((a, b) => b.reads - a.reads);
    const name = sorted[0].relPath.split("/").pop();
    return name.length > 16 ? name.slice(0, 14) + "..." : name;
  }, [files]);

  const mostWritten = useMemo(() => {
    if (files.length === 0) return "—";
    const sorted = [...files].sort((a, b) => b.writes - a.writes);
    const name = sorted[0].relPath.split("/").pop();
    return name.length > 16 ? name.slice(0, 14) + "..." : name;
  }, [files]);

  const totalOps = files.reduce((s, f) => s + f.total, 0);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "20px 24px" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 18,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
          Attention Heatmap
        </span>
        {prefix && (
          <span style={{
            fontSize: 9, color: C.textMuted, fontFamily: "monospace",
            background: C.bg2, padding: "3px 8px", borderRadius: 4,
            border: `1px solid ${C.border}`,
          }}>
            {prefix.length > 40 ? "..." + prefix.slice(-37) : prefix}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 12 }}>
          Loading file attention data...
        </div>
      ) : files.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted, fontSize: 12 }}>
          No file access data yet. File attention patterns appear once agent sessions generate tool events.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <StatCard label="Files Touched" value={files.length} />
            <StatCard label="Total Ops" value={fmtCount(totalOps)} />
            <StatCard label="Most Read" value={mostRead} color={C.cyan} />
            <StatCard label="Most Written" value={mostWritten} color={C.pink} />
          </div>

          {/* Drill-down directory explorer */}
          <DrillDownView tree={tree} />

          {/* Hotspot grid */}
          <HeatmapGrid files={files} />

          {/* Top files ranked list */}
          <TopFilesTable files={files} maxTotal={maxTotal} />
        </>
      )}
    </div>
  );
}
