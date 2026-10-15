"use client";

import { useEffect, useState } from "react";
import { fetchJson, isAbortError, messageOf } from "@/lib/client";
import type { ProjectInfo } from "@/lib/projects";

export type GNode = { id: string; name: string; file: string; line?: number };
export type GLink = {
  source: string | GNode;
  target: string | GNode;
  kinds?: string[];
};
export type GraphData = { nodes: GNode[]; links: GLink[] };
export type LoadStatus = "idle" | "loading" | "ready" | "error";

const EMPTY: GraphData = { nodes: [], links: [] };

/** Loads the call graph and project metadata (slug + stats) for a projectId. */
export function useProject(projectId: string | null) {
  const [graph, setGraph] = useState<GraphData>(EMPTY);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setGraph(EMPTY);
    setProject(null);
    setError("");
    if (!projectId) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const ac = new AbortController();
    const q = encodeURIComponent(projectId);
    Promise.all([
      fetchJson<GraphData>(`/api/graph?projectId=${q}`, { signal: ac.signal }),
      // Metadata is nice-to-have; the graph is what matters.
      fetchJson<ProjectInfo>(`/api/project?projectId=${q}`, {
        signal: ac.signal,
      }).catch((e) => {
        if (isAbortError(e)) throw e;
        return null;
      }),
    ])
      .then(([g, p]) => {
        if (ac.signal.aborted) return;
        setGraph(g);
        setProject(p);
        setStatus("ready");
      })
      .catch((e) => {
        if (isAbortError(e) || ac.signal.aborted) return;
        setError(messageOf(e));
        setStatus("error");
      });
    return () => ac.abort();
  }, [projectId]);

  return { graph, project, status, error };
}
