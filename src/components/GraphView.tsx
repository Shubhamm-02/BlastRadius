"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

// react-force-graph touches `window`/canvas, so it must be client-only.
// Typed as any to avoid friction with the library's prop types.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as (props: Record<string, unknown>) => JSX.Element;

type GNode = { id: string; name: string; file: string };
type GLink = { source: string; target: string };
type GraphData = { nodes: GNode[]; links: GLink[] };

const COLOR_SELECTED = "#ef4444"; // red — the function you clicked
const COLOR_AFFECTED = "#f59e0b"; // amber — in the blast radius
const COLOR_IDLE = "#64748b"; // slate — everything else

export default function GraphView() {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [affectedIds, setAffectedIds] = useState<Set<string>>(new Set());
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dims, setDims] = useState({ width: 800, height: 600 });
  const graphWrapRef = useRef<HTMLDivElement>(null);

  // Load the graph once.
  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d as GraphData);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Keep the canvas sized to its container.
  useEffect(() => {
    function measure() {
      const el = graphWrapRef.current;
      if (el) setDims({ width: el.clientWidth, height: el.clientHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const handleNodeClick = useCallback((node: GNode) => {
    setSelectedId(node.id);
    setExplanation("");
    setAffectedIds(new Set());
    setLoading(true);
    fetch(`/api/impact?id=${encodeURIComponent(node.id)}`)
      .then((r) => r.json())
      .then((d) => {
        setAffectedIds(new Set<string>(d.affectedIds ?? []));
        setExplanation(d.explanation ?? d.error ?? "");
      })
      .catch((e) => setExplanation("Error: " + String(e)))
      .finally(() => setLoading(false));
  }, []);

  const nodeColor = useCallback(
    (node: GNode) => {
      if (node.id === selectedId) return COLOR_SELECTED;
      if (affectedIds.has(node.id)) return COLOR_AFFECTED;
      return COLOR_IDLE;
    },
    [selectedId, affectedIds],
  );

  const selectedNode = data.nodes.find((n) => n.id === selectedId);

  return (
    <main style={{ display: "flex", height: "100%" }}>
      {/* Graph canvas */}
      <div
        ref={graphWrapRef}
        style={{ flex: 1, position: "relative", overflow: "hidden" }}
      >
        {data.nodes.length > 0 ? (
          <ForceGraph2D
            graphData={data}
            width={dims.width}
            height={dims.height}
            backgroundColor="#0f172a"
            nodeId="id"
            nodeRelSize={5}
            nodeColor={nodeColor}
            nodeLabel={(n: GNode) => `${n.name}  —  ${n.file}`}
            linkColor={() => "#334155"}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
          />
        ) : (
          <EmptyState error={error} />
        )}
      </div>

      {/* Sidebar */}
      <aside
        style={{
          width: 340,
          borderLeft: "1px solid #1e293b",
          padding: "20px 18px",
          overflowY: "auto",
          background: "#0b1220",
        }}
      >
        <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>BlastRadius</h1>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>
          Neo4j AuraDB · click any function to see its blast radius.
        </p>

        <Legend />

        {selectedNode ? (
          <section style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Selected</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#f87171" }}>
              {selectedNode.name}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
              {selectedNode.file}
            </div>

            <div style={{ fontSize: 13, color: "#94a3b8" }}>Blast radius</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fbbf24" }}>
              {affectedIds.size}
              <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 400 }}>
                {" "}
                function{affectedIds.size === 1 ? "" : "s"} affected
              </span>
            </div>

            <div
              style={{
                marginTop: 14,
                fontSize: 13,
                lineHeight: 1.5,
                color: "#cbd5e1",
                background: "#111c33",
                border: "1px solid #1e293b",
                borderRadius: 8,
                padding: 12,
                minHeight: 40,
              }}
            >
              {loading ? "Analyzing…" : explanation || "—"}
            </div>
          </section>
        ) : (
          <p style={{ marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
            Click a node in the graph to analyze the impact of changing it.
          </p>
        )}
      </aside>
    </main>
  );
}

function Legend() {
  const rows: [string, string][] = [
    [COLOR_SELECTED, "Selected function"],
    [COLOR_AFFECTED, "In blast radius"],
    [COLOR_IDLE, "Unaffected"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map(([c, label]) => (
        <div
          key={label}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: c,
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 12, color: "#cbd5e1" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ error }: { error: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        color: "#94a3b8",
      }}
    >
      {error ? (
        <>
          <div style={{ color: "#f87171", fontWeight: 600, marginBottom: 8 }}>
            Could not load graph
          </div>
          <code style={{ fontSize: 12, maxWidth: 480 }}>{error}</code>
          <p style={{ fontSize: 13, marginTop: 16 }}>
            Check your AuraDB credentials in <code>.env.local</code>.
          </p>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No graph yet</div>
          <p style={{ fontSize: 13, maxWidth: 420 }}>
            Ingest a codebase first:
            <br />
            <code style={{ color: "#e2e8f0" }}>
              npm run ingest -- /path/to/some/repo
            </code>
          </p>
        </>
      )}
    </div>
  );
}
