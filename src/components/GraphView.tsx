"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as (props: Record<string, unknown>) => JSX.Element;

type GNode = { id: string; name: string; file: string };
type GLink = { source: string | GNode; target: string | GNode };
type GraphData = { nodes: GNode[]; links: GLink[] };
type Stats = { files: number; functions: number; imports: number; calls: number };

const COLOR_SELECTED = "#ef4444";
const COLOR_AFFECTED = "#f59e0b";
const COLOR_IDLE = "#64748b";

const idOf = (x: string | GNode): string =>
  typeof x === "object" && x ? x.id : (x as string);

// Privacy-friendly anonymous id (no PII), persisted per browser.
function getAnonId(): string {
  try {
    let id = localStorage.getItem("br_anon");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("br_anon", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export default function GraphView() {
  const [repoInput, setRepoInput] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState("");

  const [full, setFull] = useState<GraphData>({ nodes: [], links: [] });
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"focus" | "full">("focus");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [affectedIds, setAffectedIds] = useState<Set<string>>(new Set());
  const [explanation, setExplanation] = useState("");
  const [loadingImpact, setLoadingImpact] = useState(false);

  const [dims, setDims] = useState({ width: 800, height: 600 });
  const graphWrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{ zoomToFit?: (ms?: number, px?: number) => void } | null>(null);
  const shouldFit = useRef(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // <input type="file"> can't take webkitdirectory as a typed JSX prop.
  useEffect(() => {
    const el = folderInputRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  // Deep-link / CLI support: /?projectId=xxx
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("projectId");
    if (pid) setProjectId(pid);
  }, []);

  // Load full graph for the active project (used for search + subgraph).
  useEffect(() => {
    if (!projectId) {
      setFull({ nodes: [], links: [] });
      return;
    }
    setSelectedId(null);
    setAffectedIds(new Set());
    setExplanation("");
    setQuery("");
    fetch(`/api/graph?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d) => setFull(d.error ? { nodes: [], links: [] } : (d as GraphData)))
      .catch(() => setFull({ nodes: [], links: [] }));
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

  const postIngest = useCallback((payload: object) => {
    setIngesting(true);
    setIngestError("");
    setStats(null);
    fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, anonId: getAnonId() }),
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
  }, []);

  const analyze = useCallback(() => {
    const repo = repoInput.trim();
    if (!repo || ingesting) return;
    postIngest({ repo });
  }, [repoInput, ingesting, postIngest]);

  const handleFolder = useCallback(
    async (fileList: FileList) => {
      if (ingesting) return;
      const CODE_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;
      const CONFIG_RE = /(^|\/)(tsconfig|jsconfig)[^/]*\.json$/i;
      const SKIP = /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor)\//;
      const MAX_BYTES = 4_000_000; // stay under serverless request-body limits

      const picked = Array.from(fileList).filter((f) => {
        const p = f.webkitRelativePath || f.name;
        const isCode = CODE_EXT.test(p) && !p.endsWith(".d.ts");
        return (isCode || CONFIG_RE.test(p)) && !SKIP.test(p);
      });
      if (picked.length === 0) {
        setIngestError("No TypeScript/JavaScript files in that folder.");
        return;
      }

      setIngesting(true);
      setIngestError("");
      try {
        const files: { path: string; content: string }[] = [];
        let total = 0;
        let truncated = false;
        for (const f of picked) {
          if (total + f.size > MAX_BYTES) {
            truncated = true;
            break;
          }
          const content = await f.text();
          total += content.length;
          // Strip the top-level folder name so ids match GitHub-style paths.
          const rel =
            (f.webkitRelativePath || f.name).split("/").slice(1).join("/") ||
            f.name;
          files.push({ path: rel, content });
        }
        const name =
          (picked[0].webkitRelativePath || "").split("/")[0] || "uploaded";
        if (truncated) {
          setIngestError(
            `Folder exceeds ${MAX_BYTES / 1e6}MB of code — analyzing the first ${files.length} files. Use a GitHub URL or the local CLI for larger repos.`,
          );
        }
        setIngesting(false); // postIngest re-sets it
        postIngest({ files, name });
      } catch (e) {
        setIngestError(String(e));
        setIngesting(false);
      }
    },
    [ingesting, postIngest],
  );

  const selectFunction = useCallback(
    (id: string) => {
      if (!projectId) return;
      setSelectedId(id);
      setExplanation("");
      setAffectedIds(new Set());
      setLoadingImpact(true);
      shouldFit.current = true;
      fetch(
        `/api/impact?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(id)}&anonId=${encodeURIComponent(getAnonId())}`,
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

  // Search matches (capped so huge repos stay responsive).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const arr = q
      ? full.nodes.filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            n.file.toLowerCase().includes(q),
        )
      : full.nodes;
    return { total: arr.length, shown: arr.slice(0, 100) };
  }, [query, full]);

  // What actually gets drawn: the blast-radius subgraph in focus mode,
  // the whole graph in full mode.
  const displayData: GraphData = useMemo(() => {
    if (viewMode === "full") return full;
    if (!selectedId) return { nodes: [], links: [] };
    const keep = new Set<string>([selectedId, ...affectedIds]);
    const nodes = full.nodes
      .filter((n) => keep.has(n.id))
      .map((n) => ({ id: n.id, name: n.name, file: n.file }));
    const links = full.links
      .filter((l) => keep.has(idOf(l.source)) && keep.has(idOf(l.target)))
      .map((l) => ({ source: idOf(l.source), target: idOf(l.target) }));
    return { nodes, links };
  }, [viewMode, selectedId, affectedIds, full]);

  const colorFor = useCallback(
    (id: string) => {
      if (id === selectedId) return COLOR_SELECTED;
      if (affectedIds.has(id)) return COLOR_AFFECTED;
      return COLOR_IDLE;
    },
    [selectedId, affectedIds],
  );

  const selectedNode = full.nodes.find((n) => n.id === selectedId);
  const bigGraph = full.nodes.length > 1500;

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Top bar */}
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
          placeholder="Public GitHub repo, e.g. facebook/react or a github.com URL"
          style={inputStyle(560)}
        />
        <button onClick={analyze} disabled={ingesting} style={btnStyle(ingesting)}>
          {ingesting ? "Analyzing…" : "Analyze"}
        </button>
        <span style={{ fontSize: 12, color: "#475569" }}>or</span>
        <input
          ref={folderInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handleFolder(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => folderInputRef.current?.click()}
          disabled={ingesting}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "transparent",
            color: "#cbd5e1",
            fontWeight: 600,
            fontSize: 14,
            cursor: ingesting ? "default" : "pointer",
          }}
        >
          Upload folder
        </button>
        {stats && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {slug}: {stats.functions} fns · {stats.calls} calls
          </span>
        )}
        {ingestError && (
          <span style={{ fontSize: 12, color: "#f87171" }}>{ingestError}</span>
        )}
        <a
          href="/stats"
          style={{
            marginLeft: "auto",
            fontSize: 13,
            color: "#94a3b8",
            textDecoration: "none",
          }}
        >
          Stats →
        </a>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left: searchable function picker */}
        <aside
          style={{
            width: 300,
            borderRight: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
            background: "#0b1220",
          }}
        >
          <div style={{ padding: "14px 14px 8px" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${full.nodes.length} functions…`}
              style={inputStyle()}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: "0 6px 12px" }}>
            {full.nodes.length === 0 ? (
              <p style={{ fontSize: 12, color: "#64748b", padding: "0 8px" }}>
                Analyze a repo to list its functions.
              </p>
            ) : (
              <>
                {matches.shown.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => selectFunction(n.id)}
                    title={`${n.name} — ${n.file}`}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 8px",
                      marginBottom: 2,
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      background:
                        n.id === selectedId ? "#1e293b" : "transparent",
                      color: n.id === selectedId ? "#f87171" : "#cbd5e1",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#64748b",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n.file}
                    </div>
                  </button>
                ))}
                {matches.total > matches.shown.length && (
                  <p style={{ fontSize: 11, color: "#64748b", padding: "6px 8px" }}>
                    Showing {matches.shown.length} of {matches.total} — refine
                    your search.
                  </p>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Center: graph */}
        <div
          ref={graphWrapRef}
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
              onNodeClick={(n: GNode) => selectFunction(n.id)}
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
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = colorFor(node.id);
                ctx.fill();
                const highlight =
                  node.id === selectedId || affectedIds.has(node.id);
                // Label focused subgraph always; in full mode only highlights.
                if (viewMode === "focus" || highlight) {
                  const fontSize = Math.max(10 / globalScale, 2);
                  ctx.font = `${fontSize}px sans-serif`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "top";
                  ctx.fillStyle = highlight ? "#f1f5f9" : "#94a3b8";
                  ctx.fillText(node.name, node.x, node.y + r + 1);
                }
              }}
            />
          ) : (
            <CenterHint
              ingesting={ingesting}
              hasProject={!!projectId}
              hasSelection={!!selectedId}
              viewMode={viewMode}
            />
          )}

          {/* View toggle */}
          {full.nodes.length > 0 && (
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
                  onClick={() => {
                    shouldFit.current = true;
                    setViewMode(m);
                  }}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: viewMode === m ? "#f59e0b" : "transparent",
                    color: viewMode === m ? "#0b1220" : "#cbd5e1",
                  }}
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
              Large graph ({full.nodes.length} nodes) — use search + Blast radius
              view for clarity.
            </div>
          )}
        </div>

        {/* Right: details */}
        <aside
          style={{
            width: 320,
            borderLeft: "1px solid #1e293b",
            padding: "20px 18px",
            overflowY: "auto",
            background: "#0b1220",
          }}
        >
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
                {loadingImpact ? "Analyzing…" : explanation || "—"}
              </div>
            </section>
          ) : (
            <p style={{ marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
              Search a function on the left (or click a node) to see its blast
              radius.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

function inputStyle(maxWidth?: number): CSSProperties {
  return {
    width: "100%",
    maxWidth,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: 14,
  };
}

function btnStyle(disabled: boolean): CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "#475569" : "#f59e0b",
    color: "#0b1220",
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "default" : "pointer",
  };
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
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

function CenterHint({
  ingesting,
  hasProject,
  hasSelection,
  viewMode,
}: {
  ingesting: boolean;
  hasProject: boolean;
  hasSelection: boolean;
  viewMode: "focus" | "full";
}) {
  let msg: string;
  if (ingesting) msg = "Cloning & parsing the repo into AuraDB…";
  else if (!hasProject) msg = "Paste a public GitHub repo above and hit Analyze.";
  else if (viewMode === "focus" && !hasSelection)
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
