"use client";

import { useCallback, useEffect, useState } from "react";
import { useImpact } from "@/hooks/useImpact";
import { useIngest } from "@/hooks/useIngest";
import { useProject } from "@/hooks/useProject";
import type { IngestResult } from "@/lib/ingest";
import DetailsPanel from "./DetailsPanel";
import FunctionList from "./FunctionList";
import GraphCanvas, { type ViewMode } from "./GraphCanvas";
import RepoBar from "./RepoBar";

export default function GraphView() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("full");

  // Deep-link / CLI support: /?projectId=xxx
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("projectId");
    if (pid) setProjectId(pid);
  }, []);

  const { graph, project, status, error: loadError } = useProject(projectId);
  const impact = useImpact(projectId);

  const onIngested = useCallback((r: IngestResult) => {
    setProjectId(r.projectId);
    const url = new URL(window.location.href);
    url.searchParams.set("projectId", r.projectId);
    window.history.replaceState(null, "", url.toString());
  }, []);
  const ingest = useIngest(onIngested);

  const selectedNode = graph.nodes.find((n) => n.id === impact.selectedId);

  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <RepoBar
        ingesting={ingest.ingesting}
        progress={ingest.progress}
        error={ingest.error || loadError}
        warning={ingest.warning}
        project={project}
        onAnalyze={ingest.analyzeRepo}
        onUpload={ingest.uploadFolder}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <FunctionList
          nodes={graph.nodes}
          status={status}
          selectedId={impact.selectedId}
          onSelect={impact.select}
        />
        <GraphCanvas
          graph={graph}
          status={status}
          ingesting={ingest.ingesting}
          hasProject={!!projectId}
          viewMode={viewMode}
          onViewMode={setViewMode}
          selectedId={impact.selectedId}
          affectedIds={impact.affectedIds}
          onSelect={impact.select}
        />
        <DetailsPanel impact={impact} selectedNode={selectedNode} />
      </div>
    </main>
  );
}
