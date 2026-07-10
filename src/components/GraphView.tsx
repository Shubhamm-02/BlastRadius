"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as (props: Record<string, unknown>) => JSX.Element;

type GNode = { id: string; name: string; file: string };
type GLink = { source: string; target: string };
type GraphData = { nodes: GNode[]; links: GLink[] };
type Stats = {
  files: number;
  functions: number;
  imports: number;
  calls: number;
};

const COLOR_SELECTED = "#ef4444";
const COLOR_AFFECTED = "#f59e0b";
const COLOR_IDLE = "#64748b";

export default function GraphView() {
  const [repoInput, setRepoInput] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState("");

  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [affectedIds, setAffectedIds] = useState<Set<string>>(new Set());
  const [explanation, setExplanation] = useState("");
  const [loadingImpact, setLoadingImpact] = useState(false);

  const [dims, setDims] = useState({ width: 800, height: 600 });
  const graphWrapRef = useRef<HTMLDivElement>(null);

  // Allow deep-linking / CLI: /?projectId=xxx
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("projectId");
    if (pid) setProjectId(pid);
  }, []);

  // Load the graph whenever the active project changes.
  useEffect(() => {
    if (!projectId) {
      setData({ nodes: [], links: [] });
      return;
    }
    setSelectedId(null);
    setAffectedIds(new Set());
    setExplanation("");
    fetch(`/api/graph?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d) => setData(d.error ? { nodes: [], links: [] } : (d as GraphData)))
      .catch(() => setData({ nodes: [], links: [] }));
  }, [projectId]);

  useEffect(() => {
    function measure() {
      const el = graphWrapRef.current;
      if (el) setDims({ width: el.clientWidth, height: el.clientHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [projectId]);

  const analyze = useCallback(() => {
    const repo = repoInput.trim();
    if (!repo || ingesting) return;
    setIngesting(true);
    setIngestError("");
    setStats(null);
    fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setIngestError(d.error);
          return;
        }
        setStats(d.stats as Stats);
        setSlug(d.slug as string);
        setProjectId(d.projectId as string);
        const url = new URL(window.location.href);
        url.searchParams.set("projectId", d.projectId as string);
        window.history.replaceState(null, "", url.toString());
      })
      .catch((e) => setIngestError(String(e)))
      .finally(() => setIngesting(false));
  }, [repoInput, ingesting]);

  const handleNodeClick = useCallback(
    (node: GNode) => {
      if (!projectId) return;
      setSelectedId(node.id);
      setExplanation("");
      setAffectedIds(new Set());
      setLoadingImpact(true);
      fetch(
        `/api/impact?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(node.id)}`,
      )
        .then((r) => r.json())
        .then((d) => {
          setAffectedIds(new Set<string>(d.affectedIds ?? []));
          setExplanation(d.explanation ?? d.error ?? "");
        })
        .catch((e) => setExplanation("Error: " + String(e)))
        .finally(() => setLoadingImpact(false));
    },
    [projectId],
  );

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
    <main
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      {/* Top bar: repo input */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 18px",
          borderBottom: "1px solid #1e293b",
          background: "#0b1220",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, color: "#f8fafc" }}>
          Blast<span style={{ color: "#f59e0b" }}>Radius</span>
        </div>
        <input
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && analyze()}
          placeholder="Public GitHub repo — e.g. facebook/react or a github.com URL"
          style={{
            flex: 1,
            maxWidth: 560,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            fontSize: 14,
          }}
        />
        <button
          onClick={analyze}
          disabled={ingesting}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: ingesting ? "#475569" : "#f59e0b",
            color: "#0b1220",
            fontWeight: 600,
            fontSize: 14,
            cursor: ingesting ? "default" : "pointer",
          }}
        >
          {ingesting ? "Analyzing…" : "Analyze"}
        </button>
        {stats && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {slug}: {stats.functions} fns · {stats.calls} calls
          </span>
        )}
        {ingestError && (
          <span style={{ fontSize: 12, color: "#f87171" }}>{ingestError}</span>
        )}
      </header>

      {/* Body: graph + sidebar */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
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
            <EmptyState ingesting={ingesting} hasProject={!!projectId} />
          )}
        </div>

        <aside
          style={{
            width: 340,
            borderLeft: "1px solid #1e293b",
            padding: "20px 18px",
            overflowY: "auto",
            background: "#0b1220",
          }}
        >
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>
            Neo4j AuraDB · click any function to see its blast radius.
          </p>

          <Legend />

          {selectedNode ? (
            <section style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>Selected</div>
              <div
                style={{ fontSize: 15, fontWeight: 600, color: "#f87171" }}
              >
                {selectedNode.name}
              </div>
              <div
                style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}
              >
                {selectedNode.file}
              </div>

              <div style={{ fontSize: 13, color: "#94a3b8" }}>Blast radius</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#fbbf24" }}>
                {affectedIds.size}
                <span
                  style={{ fontSize: 13, color: "#94a3b8", fontWeight: 400 }}
                >
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
                {loadingImpact ? "Analyzing…" : explanation || "—"}
              </div>
            </section>
          ) : (
            <p style={{ marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
              {data.nodes.length > 0
                ? "Click a node to analyze the impact of changing it."
                : "Analyze a repo to get started."}
            </p>
          )}
        </aside>
      </div>
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

function EmptyState({
  ingesting,
  hasProject,
}: {
  ingesting: boolean;
  hasProject: boolean;
}) {
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
      {ingesting ? (
        <div style={{ fontWeight: 600 }}>
          Cloning & parsing the repo into AuraDB…
        </div>
      ) : hasProject ? (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            No functions found
          </div>
          <p style={{ fontSize: 13, maxWidth: 420 }}>
            That project had no resolvable TS/JS functions. Try another repo.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "#e2e8f0" }}>
            Paste a public GitHub repo above and hit Analyze
          </div>
          <p style={{ fontSize: 13, maxWidth: 460 }}>
            BlastRadius parses it into a Neo4j AuraDB call graph, then lights up
            the blast radius of any function you click.
          </p>
        </div>
      )}
    </div>
  );
}
