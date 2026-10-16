"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { IMPACT_LIMIT } from "@/lib/constants";
import type { ImpactResult } from "@/lib/impact";
import { DURATION, ease } from "@/lib/motion";
import { affectedNoun, plural, type BlastRadius } from "./blast-radius";

// Nearer hops read stronger; indexed by hop - 1, covers DEPTH_MAX.
const HOP_TINT = [
  "bg-accent",
  "bg-accent/80",
  "bg-accent/65",
  "bg-accent/55",
  "bg-accent/45",
  "bg-accent/40",
  "bg-accent/35",
  "bg-accent/30",
];

function HopHistogram({ counts }: { counts: number[] }) {
  const reduce = useReducedMotion();
  const peak = Math.max(...counts);
  const described = counts
    .map((count, i) => `${count} at ${plural(i + 1, "hop")}`)
    .join(", ");

  return (
    <div role="img" aria-label={described} className="flex items-end gap-1">
      {counts.map((count, i) => (
        <Tip key={i} label={`${count} at ${plural(i + 1, "hop")}`}>
          <div className="flex min-w-2 max-w-5 flex-1 flex-col items-center gap-1">
            <div className="flex h-7 w-full items-end">
              <motion.div
                className={cn(
                  "w-full origin-bottom rounded-[2px]",
                  HOP_TINT[i],
                )}
                style={{
                  height: count ? `${Math.max(10, (count / peak) * 100)}%` : 0,
                }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ ...ease(DURATION.slow), delay: i * 0.03 }}
              />
            </div>
            <span className="text-xs tabular-nums leading-none text-text-dim">
              {i + 1}
            </span>
          </div>
        </Tip>
      ))}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="text-xs text-text-dim">{label}</dt>
      <dd className="text-base font-medium tabular-nums text-text">
        {children}
      </dd>
    </div>
  );
}

export function ImpactStats({
  result,
  blast,
  refreshingDepth,
}: {
  result: ImpactResult;
  blast: BlastRadius;
  refreshingDepth: number | null;
}) {
  const empty = result.total === 0;

  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-4">
      <div>
        <NumberTicker
          value={result.total}
          className={cn(
            "block text-2xl font-semibold",
            empty ? "text-text-muted" : "text-accent-ink",
          )}
        />
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
          {affectedNoun(result.direction, result.total)}
          <span className="text-text-dim">
            within {plural(result.depth, "hop")}
          </span>
          {refreshingDepth !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs text-text-dim">
              <span
                aria-hidden
                className="size-1.5 animate-pulse-soft rounded-full bg-accent"
              />
              Updating to depth {refreshingDepth}
            </span>
          )}
        </p>
        {result.truncated && (
          <p className="mt-1 text-xs text-text-dim">
            Showing the nearest {IMPACT_LIMIT}
          </p>
        )}
      </div>

      {!empty && (
        <dl className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-end gap-x-6">
          <Fact label="Files">
            {blast.files}
            {result.truncated && "+"}
          </Fact>
          <Fact label="Max depth">{plural(blast.maxHops, "hop")}</Fact>
          <div className="flex min-w-0 flex-col gap-1.5">
            <dt className="text-xs text-text-dim">By distance</dt>
            <dd>
              <HopHistogram counts={blast.histogram} />
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export function ImpactStatsSkeleton({ context }: { context: string }) {
  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-24" />
        <p className="text-sm text-text-dim">{context}</p>
      </div>
      <div className="grid grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
