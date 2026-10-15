"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchJson,
  getAnonId,
  isAbortError,
  messageOf,
  readJson,
  readText,
} from "@/lib/client";
import { DEPTH_DEFAULT } from "@/lib/constants";
import type { Direction, ImpactResult } from "@/lib/impact";

interface ImpactState {
  status: "idle" | "loading" | "ready" | "error";
  result: ImpactResult | null;
  error: string;
  explanation: string;
  explaining: boolean;
}

const IDLE: ImpactState = {
  status: "idle",
  result: null,
  error: "",
  explanation: "",
  explaining: false,
};

/**
 * Blast radius for the selected function, plus a streamed explanation.
 * Selecting another function (or changing direction/depth) aborts the
 * in-flight requests, and stale responses are ignored.
 */
export function useImpact(projectId: string | null) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("upstream");
  const [depth, setDepth] = useState(DEPTH_DEFAULT);
  const [state, setState] = useState<ImpactState>(IDLE);

  // A new project clears the selection.
  useEffect(() => setSelectedId(null), [projectId]);

  useEffect(() => {
    if (!projectId || !selectedId) {
      setState(IDLE);
      return;
    }
    const ac = new AbortController();
    const { signal } = ac;
    const update = (fn: (s: ImpactState) => ImpactState) => {
      if (!signal.aborted) setState(fn);
    };
    setState({ ...IDLE, status: "loading", explaining: true });

    const qs = new URLSearchParams({
      projectId,
      id: selectedId,
      depth: String(depth),
      direction,
    });

    (async () => {
      try {
        const result = await fetchJson<ImpactResult>(
          `/api/impact?${qs}&anonId=${encodeURIComponent(getAnonId())}`,
          { signal },
        );
        update((s) => ({ ...s, status: "ready", result }));

        const res = await fetch(`/api/explain?${qs}`, { signal });
        if (!res.ok || !res.body) await readJson(res); // throws the API's message
        await readText(res.body!, (chunk) =>
          update((s) => ({ ...s, explanation: s.explanation + chunk })),
        );
        update((s) => ({ ...s, explaining: false }));
      } catch (e) {
        if (isAbortError(e) || signal.aborted) return;
        update((s) =>
          s.status === "loading"
            ? { ...s, status: "error", error: messageOf(e), explaining: false }
            : {
                ...s,
                explaining: false,
                explanation:
                  s.explanation || `Explanation unavailable: ${messageOf(e)}`,
              },
        );
      }
    })();

    return () => ac.abort();
  }, [projectId, selectedId, direction, depth]);

  const affectedIds = useMemo(
    () => new Set(state.result?.affected.map((a) => a.id) ?? []),
    [state.result],
  );

  return {
    selectedId,
    select: setSelectedId,
    direction,
    setDirection,
    depth,
    setDepth,
    affectedIds,
    ...state,
  };
}

export type ImpactController = ReturnType<typeof useImpact>;
