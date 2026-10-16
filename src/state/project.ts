"use client";

import { create } from "zustand";
import { fetchJson, isAbortError, messageOf } from "@/lib/client";
import { degrees, type Degree } from "@/lib/graph-metrics";
import type { GraphData, GNode, LoadStatus } from "@/lib/graph-types";
import type { ProjectInfo } from "@/lib/projects";

interface ProjectState {
  status: LoadStatus;
  error: string;
  graph: GraphData;
  info: ProjectInfo | null;
  nodeById: Map<string, GNode>;
  degree: Map<string, Degree>;
  load(projectId: string | null): void;
  reload(): void;
}

const EMPTY: GraphData = { nodes: [], links: [] };
let inflight: AbortController | null = null;
let lastId: string | null = null;

export const useProjectData = create<ProjectState>()((set, get) => ({
  status: "idle",
  error: "",
  graph: EMPTY,
  info: null,
  nodeById: new Map(),
  degree: new Map(),

  load(projectId) {
    inflight?.abort();
    lastId = projectId;
    set({
      status: projectId ? "loading" : "idle",
      error: "",
      graph: EMPTY,
      info: null,
      nodeById: new Map(),
      degree: new Map(),
    });
    if (!projectId) return;

    const ac = new AbortController();
    inflight = ac;
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
      .then(([graph, info]) => {
        if (ac.signal.aborted) return;
        set({
          status: "ready",
          graph,
          info,
          nodeById: new Map(graph.nodes.map((n) => [n.id, n])),
          degree: degrees(graph.nodes, graph.links),
        });
      })
      .catch((e) => {
        if (isAbortError(e) || ac.signal.aborted) return;
        set({ status: "error", error: messageOf(e) });
      });
  },

  reload() {
    get().load(lastId);
  },
}));
