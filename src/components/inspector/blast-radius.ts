import { useMemo } from "react";
import { groupByFile, hopHistogram, riskOf } from "@/lib/graph-metrics";
import type { Direction, ImpactResult } from "@/lib/impact";

export const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export function affectedNoun(direction: Direction, count: number) {
  const noun = direction === "upstream" ? "caller" : "callee";
  const verb = direction === "upstream" ? "affected" : "reached";
  return `${noun}${count === 1 ? "" : "s"} ${verb}`;
}

/** "12 files", or "12+ files" when the affected list was capped. */
export const fileCount = (files: number, truncated: boolean) =>
  `${files}${truncated ? "+" : ""} file${files === 1 && !truncated ? "" : "s"}`;

export function useBlastRadius(result: ImpactResult | null) {
  return useMemo(() => {
    if (!result) return null;
    const groups = groupByFile(result.affected);
    const histogram = hopHistogram(result.affected);
    return {
      groups,
      histogram,
      maxHops: histogram.length,
      files: groups.length,
      risk: riskOf(result.total, groups.length),
    };
  }, [result]);
}

export type BlastRadius = NonNullable<ReturnType<typeof useBlastRadius>>;
