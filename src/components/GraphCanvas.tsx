"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GNode, GraphData, LoadStatus } from "@/hooks/useProject";
import {
  COLOR_AFFECTED,
  COLOR_IDLE,
  COLOR_SELECTED,
  segmentStyle,
} from "./styles";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as (props: Record<string, unknown>) => JSX.Element;

export type ViewMode = "focus" | "full";

const idOf = (x: string | GNode): string =>
  typeof x === "object" && x ? x.id : (x as string);

interface Props {
  graph: GraphData;
  status: LoadStatus;
  ingesting: boolean;
  hasProject: boolean;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  selectedId: string | null;
  affectedIds: Set<string>;
  onSelect: (id: string) => void;
}

/** Center: force-directed graph, sized to its container with a ResizeObserver. */
export default function GraphCanvas(props: Props) {
  const { graph, viewMode, selectedId, affectedIds } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{
    zoomToFit?: (ms?: number, px?: number) => void;
  } | null>(null);
  const shouldFit = useRef(false);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims((d) =>
        d.width === Math.round(width) && d.height === Math.round(height)
          ? d
          : { width: Math.round(width), height: Math.round(height) },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit whenever what's drawn changes meaningfully.
  useEffect(() => {
    shouldFit.current = true;
  }, [graph, viewMode, selectedId]);

  // The blast-radius subgraph in focus mode, the whole graph in full mode.
  const displayData: GraphData = useMemo(() => {
    if (viewMode === "full") return graph;
    if (!selectedId) return { nodes: [], links: [] };
    const keep = new Set<string>([selectedId, ...affectedIds]);
    const nodes = graph.nodes
      .filter((n) => keep.has(n.id))
      .map((n) => ({ id: n.id, name: n.name, file: n.file }));
    const links = graph.links
      .filter((l) => keep.has(idOf(l.source)) && keep.has(idOf(l.target)))
      .map((l) => ({ source: idOf(l.source), target: idOf(l.target) }));
    return { nodes, links };
  }, [viewMode, selectedId, affectedIds, graph]);

  const bigGraph = graph.nodes.length > 1500;

  return (
    <div
      ref={wrapRef}
      style={{ flex: 1, position: "relative", overflow: "hidden" }}
    >
      {displayData.nodes.length > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          graphData={displayData}
          width={dims.width}
          height={dims.height}
          backgroundColor="#0f172a"
          nodeId="id"
          linkColor={() => "#334155"}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          cooldownTicks={80}
          onEngineStop={() => {
            if (shouldFit.current) {
              fgRef.current?.zoomToFit?.(500, 60);
              shouldFit.current = false;
            }
          }}
          onNodeClick={(n: GNode) => props.onSelect(n.id)}
          nodePointerAreaPaint={(
            node: GNode & { x: number; y: number },
            color: string,
            ctx: CanvasRenderingContext2D,
          ) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
            ctx.fill();
          }}
          nodeCanvasObject={(
            node: GNode & { x: number; y: number },
            ctx: CanvasRenderingContext2D,
            globalScale: number,
          ) => {
            const r = 4;
            const selected = node.id === selectedId;
            const affected = affectedIds.has(node.id);
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = selected
              ? COLOR_SELECTED
              : affected
                ? COLOR_AFFECTED
                : COLOR_IDLE;
            ctx.fill();
            // Label focused subgraph always; in full mode only highlights.
            if (viewMode === "focus" || selected || affected) {
              const fontSize = Math.max(10 / globalScale, 2);
              ctx.font = `${fontSize}px sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = selected || affected ? "#f1f5f9" : "#94a3b8";
              ctx.fillText(node.name, node.x, node.y + r + 1);
            }
          }}
        />
      ) : (
        <CenterHint {...props} />
      )}

      {graph.nodes.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            display: "flex",
            gap: 4,
            background: "#0b1220cc",
            borderRadius: 8,
            padding: 4,
          }}
        >
          {(["focus", "full"] as const).map((m) => (
            <button
              key={m}
              onClick={() => props.onViewMode(m)}
              style={segmentStyle(viewMode === m)}
            >
              {m === "focus" ? "Blast radius" : "Full graph"}
            </button>
          ))}
        </div>
      )}
      {viewMode === "full" && bigGraph && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            fontSize: 11,
            color: "#fbbf24",
            background: "#0b1220cc",
            padding: "4px 8px",
            borderRadius: 6,
          }}
        >
          Large graph ({graph.nodes.length} nodes) — use search + Blast radius
          view for clarity.
        </div>
      )}
    </div>
  );
}

function CenterHint({
  ingesting,
  hasProject,
  status,
  selectedId,
  viewMode,
  graph,
}: Props) {
  let msg: string;
  if (ingesting) msg = "Cloning & parsing the repo into AuraDB…";
  else if (!hasProject)
    msg = "Paste a public GitHub repo above and hit Analyze.";
  else if (status === "loading") msg = "Loading graph…";
  else if (status === "error")
    msg = "Couldn't load this project. It may have expired — analyze it again.";
  else if (graph.nodes.length === 0)
    msg = "No functions found in this project.";
  else if (viewMode === "focus" && !selectedId)
    msg = "Search or click a function to see its blast radius.";
  else msg = "No functions to display.";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        color: "#94a3b8",
        fontSize: 14,
      }}
    >
      <span style={{ maxWidth: 420 }}>{msg}</span>
    </div>
  );
}
