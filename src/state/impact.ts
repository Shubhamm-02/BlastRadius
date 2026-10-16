"use client";

import { create } from "zustand";
import {
  fetchJson,
  getAnonId,
  isAbortError,
  messageOf,
  readJson,
  readText,
} from "@/lib/client";
import type { Direction, ImpactResult } from "@/lib/impact";

export interface ImpactQuery {
  projectId: string;
  id: string;
  depth: number;
  direction: Direction;
}

export type SummarySource = "cache" | "llm" | "fallback";

interface ImpactState {
  query: ImpactQuery | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  /** Authoritative result for `query`, or a locally filtered preview while it loads. */
  result: ImpactResult | null;
  /** Hop distance per affected function id. */
  hopById: Map<string, number>;
  summary: string;
  summaryStatus: "idle" | "streaming" | "done" | "error";
  summarySource: SummarySource | null;
  run(query: ImpactQuery | null): void;
  /** Instantly narrow the current result to `depth` (if possible) while a fetch is pending. */
  previewDepth(depth: number): void;
  retry(): void;
  retrySummary(): void;
}

let inflight: AbortController | null = null;
let summaryInflight: AbortController | null = null;

const hopsOf = (r: ImpactResult | null) =>
  new Map(r?.affected.map((a) => [a.id, a.hops]) ?? []);

const sameTarget = (a: ImpactQuery | null, b: ImpactQuery) =>
  !!a &&
  a.projectId === b.projectId &&
  a.id === b.id &&
  a.direction === b.direction;

/**
 * Narrow an existing result to a smaller depth so the depth slider responds
 * instantly; the server result replaces it when it lands.
 */
function previewAtDepth(
  prev: ImpactResult,
  depth: number,
): ImpactResult | null {
  if (prev.truncated || depth > prev.depth) return null;
  const affected = prev.affected.filter((a) => a.hops <= depth);
  return { ...prev, depth, affected, total: affected.length };
}

export const useImpact = create<ImpactState>()((set, get) => ({
  query: null,
  status: "idle",
  error: "",
  result: null,
  hopById: new Map(),
  summary: "",
  summaryStatus: "idle",
  summarySource: null,

  run(query) {
    inflight?.abort();
    summaryInflight?.abort();
    if (!query) {
      set({
        query: null,
        status: "idle",
        error: "",
        result: null,
        hopById: new Map(),
        summary: "",
        summaryStatus: "idle",
        summarySource: null,
      });
      return;
    }

    const prev = get();
    // Same target at a new depth: show the narrowed (or, when deepening, the
    // previous) result while the server answers, instead of blanking the view.
    const shown =
      sameTarget(prev.query, query) && prev.result
        ? (previewAtDepth(prev.result, query.depth) ?? prev.result)
        : null;
    set({
      query,
      status: "loading",
      error: "",
      result: shown,
      hopById: hopsOf(shown),
      summary: "",
      summaryStatus: "idle",
      summarySource: null,
    });

    const ac = new AbortController();
    inflight = ac;
    const qs = new URLSearchParams({
      projectId: query.projectId,
      id: query.id,
      depth: String(query.depth),
      direction: query.direction,
    });
    fetchJson<ImpactResult>(
      `/api/impact?${qs}&anonId=${encodeURIComponent(getAnonId())}`,
      { signal: ac.signal },
    )
      .then((result) => {
        if (ac.signal.aborted) return;
        set({ status: "ready", result, hopById: hopsOf(result) });
        get().retrySummary();
      })
      .catch((e) => {
        if (isAbortError(e) || ac.signal.aborted) return;
        set({ status: "error", error: messageOf(e) });
      });
  },

  previewDepth(depth) {
    const { result } = get();
    const preview = result ? previewAtDepth(result, depth) : null;
    if (preview) set({ result: preview, hopById: hopsOf(preview) });
  },

  retry() {
    get().run(get().query);
  },

  retrySummary() {
    const { query } = get();
    if (!query) return;
    summaryInflight?.abort();
    const ac = new AbortController();
    summaryInflight = ac;
    const qs = new URLSearchParams({
      projectId: query.projectId,
      id: query.id,
      depth: String(query.depth),
      direction: query.direction,
    });
    set({ summary: "", summaryStatus: "streaming", summarySource: null });

    (async () => {
      const res = await fetch(`/api/explain?${qs}`, { signal: ac.signal });
      if (!res.ok || !res.body) await readJson(res); // throws the API's message
      set({
        summarySource: res.headers.get(
          "x-explanation-source",
        ) as SummarySource | null,
      });
      await readText(res.body!, (chunk) => {
        if (!ac.signal.aborted) set((s) => ({ summary: s.summary + chunk }));
      });
      if (!ac.signal.aborted)
        set((s) => ({ summary: s.summary.trim(), summaryStatus: "done" }));
    })().catch((e) => {
      if (isAbortError(e) || ac.signal.aborted) return;
      set({ summaryStatus: "error", summary: messageOf(e) });
    });
  },
}));
