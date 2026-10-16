"use client";

import { useIngest } from "@/state/ingest";
import { useProjectData } from "@/state/project";

const GHOST_COUNT = 24;

/** Golden-angle spiral: evenly spread, deterministic, so SSR and client agree. */
const GHOST_NODES = Array.from({ length: GHOST_COUNT }, (_, i) => {
  const r = 24 * Math.sqrt(i + 0.5);
  const angle = i * 2.39996;
  return {
    x: Math.round(200 + r * Math.cos(angle) * 1.3),
    y: Math.round(135 + r * Math.sin(angle)),
    r: i % 5 === 0 ? 6 : i % 3 === 0 ? 4.5 : 3.5,
  };
});

const dist2 = (a: number, b: number) =>
  (GHOST_NODES[a].x - GHOST_NODES[b].x) ** 2 +
  (GHOST_NODES[a].y - GHOST_NODES[b].y) ** 2;

/** Each ghost links to its nearest earlier neighbor, which reads as a call tree. */
const GHOST_EDGES = GHOST_NODES.slice(1).map((_, i) => {
  const from = i + 1;
  let nearest = 0;
  for (let j = 1; j < from; j++)
    if (dist2(from, j) < dist2(from, nearest)) nearest = j;
  return [from, nearest] as const;
});

export function GraphSkeleton() {
  const slug = useProjectData((s) => s.info?.slug);
  const ingestSlug = useIngest((s) => s.result?.slug);
  const name = slug ?? ingestSlug;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-4">
      <svg
        viewBox="0 0 400 270"
        aria-hidden
        className="w-full max-w-md animate-pulse-soft"
      >
        {GHOST_EDGES.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={GHOST_NODES[a].x}
            y1={GHOST_NODES[a].y}
            x2={GHOST_NODES[b].x}
            y2={GHOST_NODES[b].y}
            className="stroke-border-strong"
            strokeWidth={1}
          />
        ))}
        {GHOST_NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={n.r}
            className="fill-surface-3 stroke-border-strong"
            strokeWidth={1}
          />
        ))}
      </svg>
      <p role="status" className="text-sm text-text-muted">
        Loading graph
        {name && (
          <>
            {" "}
            <span className="font-mono text-text">{name}</span>
          </>
        )}
      </p>
    </div>
  );
}
