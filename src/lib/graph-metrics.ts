import type { AffectedFunction } from "@/lib/impact";
import { linkEnd, type GLink, type GNode } from "@/lib/graph-types";

export interface Degree {
  in: number;
  out: number;
}

export function degrees(nodes: GNode[], links: GLink[]): Map<string, Degree> {
  const map = new Map<string, Degree>(
    nodes.map((n) => [n.id, { in: 0, out: 0 }]),
  );
  for (const l of links) {
    const s = map.get(linkEnd(l.source));
    const t = map.get(linkEnd(l.target));
    if (s) s.out++;
    if (t) t.in++;
  }
  return map;
}

/**
 * Cluster key for coloring the full graph: the first two path segments
 * ("src/lib"), the top-level folder for shallow files, or the file itself in
 * a flat repo so it isn't one color.
 */
export function clusterOf(file: string): string {
  const parts = file.split("/");
  if (parts.length === 1) return file;
  return parts.length === 2 ? parts[0] : `${parts[0]}/${parts[1]}`;
}

export type Risk = "low" | "medium" | "high";

/** Breadth (functions) and spread (files) both raise risk; either can push it up. */
export function riskOf(total: number, files: number): Risk {
  if (total >= 25 || files >= 8) return "high";
  if (total >= 6 || files >= 3) return "medium";
  return "low";
}

export function hopHistogram(affected: AffectedFunction[]): number[] {
  const counts: number[] = [];
  for (const a of affected) counts[a.hops - 1] = (counts[a.hops - 1] ?? 0) + 1;
  return Array.from(counts, (c) => c ?? 0);
}

export function groupByFile(affected: AffectedFunction[]) {
  const groups = new Map<string, AffectedFunction[]>();
  for (const a of affected) {
    const g = groups.get(a.file);
    if (g) g.push(a);
    else groups.set(a.file, [a]);
  }
  // Nearest file first; affected arrives sorted by hops already.
  return [...groups].map(([file, fns]) => ({
    file,
    fns,
    minHops: fns[0].hops,
  }));
}
