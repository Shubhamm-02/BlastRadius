"use client";

import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { AffectedFunction, ImpactResult } from "@/lib/impact";
import { DURATION, ease } from "@/lib/motion";
import { useWorkspace } from "@/state/workspace";
import { plural, type BlastRadius } from "./blast-radius";
import { FilePath } from "./FilePath";

const DEFAULT_OPEN_GROUPS = 6;
const ROW_STAGGER_S = 0.02;
// Past this many rows the stagger stops growing, so long lists still land fast.
const STAGGER_CAP = 16;

function retarget(id: string) {
  const ws = useWorkspace.getState();
  ws.hover(null);
  ws.select(id);
  ws.graphControls?.centerOn(id);
}

function AffectedRow({
  fn,
  staggerIndex,
}: {
  fn: AffectedFunction;
  staggerIndex: number;
}) {
  const reduce = useReducedMotion();
  const hovered = useWorkspace((s) => s.hoveredId === fn.id);
  const hover = useWorkspace((s) => s.hover);

  // pointerleave never fires when a row unmounts under the cursor (depth
  // shrink, re-selection from the canvas), which would leave the graph lit.
  useEffect(
    () => () => {
      const ws = useWorkspace.getState();
      if (ws.hoveredId === fn.id) ws.hover(null);
    },
    [fn.id],
  );

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...ease(DURATION.fast),
        delay: Math.min(staggerIndex, STAGGER_CAP) * ROW_STAGGER_S,
      }}
    >
      <button
        type="button"
        aria-label={`${fn.name}, ${fn.file} line ${fn.line}, ${plural(fn.hops, "hop")}`}
        onClick={() => retarget(fn.id)}
        onPointerEnter={() => hover(fn.id)}
        onPointerLeave={() => hover(null)}
        onFocus={() => hover(fn.id)}
        onBlur={() => hover(null)}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-sm py-1 pl-7 pr-2 text-left transition-colors duration-fast ease-out hover:bg-surface-3",
          hovered && "bg-surface-3",
        )}
      >
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-text">
          {fn.name}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-text-dim">
          :{fn.line}
        </span>
        <Badge
          tone={fn.hops === 1 ? "accent" : "neutral"}
          className="tabular-nums"
        >
          {plural(fn.hops, "hop")}
        </Badge>
      </button>
    </motion.li>
  );
}

function FileGroup({
  file,
  fns,
  minHops,
  open,
  onOpenChange,
  staggerFrom,
}: BlastRadius["groups"][number] & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staggerFrom: number;
}) {
  return (
    <li>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger
          aria-label={`${file}, ${plural(fns.length, "function")}, nearest at ${plural(minHops, "hop")}`}
          className="group flex w-full min-w-0 items-center gap-1.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-fast ease-out hover:bg-surface-2"
        >
          <ChevronRight
            aria-hidden
            className="size-3.5 shrink-0 text-text-dim transition-transform duration-fast ease-out group-data-[state=open]:rotate-90"
          />
          <FilePath file={file} className="flex-1 text-xs" />
          <span className="shrink-0 text-xs tabular-nums text-text-dim">
            {plural(minHops, "hop")}
          </span>
          <Badge className="tabular-nums">{fns.length}</Badge>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="flex flex-col gap-px pb-1">
            {fns.map((fn, i) => (
              <AffectedRow key={fn.id} fn={fn} staggerIndex={staggerFrom + i} />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function AffectedList({
  result,
  groups,
}: {
  result: ImpactResult;
  groups: BlastRadius["groups"];
}) {
  const headingId = useId();
  const [openByFile, setOpenByFile] = useState<Record<string, boolean>>({});
  // Only the first paint staggers across groups; a group expanded later
  // staggers its own rows from zero instead of inheriting a long delay.
  const [entered, setEntered] = useState(false);
  useEffect(() => setEntered(true), []);

  const isOpen = (file: string, index: number) =>
    openByFile[file] ?? index < DEFAULT_OPEN_GROUPS;
  const allOpen = groups.every((g, i) => isOpen(g.file, i));
  const setAll = (open: boolean) =>
    setOpenByFile(Object.fromEntries(groups.map((g) => [g.file, open])));

  const heading =
    result.direction === "upstream" ? "Affected callers" : "Reached callees";

  if (result.total === 0) {
    return (
      <section aria-labelledby={headingId} className="px-4 py-4">
        <h3 id={headingId} className="text-xs font-medium text-text-dim">
          {heading}
        </h3>
        <p className="mt-2 text-sm text-text-muted">
          {result.direction === "upstream" ? (
            <>
              Nothing calls{" "}
              <code className="font-mono text-text">{result.target.name}</code>{" "}
              within {plural(result.depth, "hop")}.
            </>
          ) : (
            <>
              <code className="font-mono text-text">{result.target.name}</code>{" "}
              calls no indexed functions within {plural(result.depth, "hop")}.
            </>
          )}
        </p>
      </section>
    );
  }

  let staggerFrom = 0;
  return (
    <section aria-labelledby={headingId} className="px-2 py-3">
      <div className="flex items-center justify-between gap-2 pb-1 pl-2">
        <h3 id={headingId} className="text-xs font-medium text-text-dim">
          {heading}
        </h3>
        {groups.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setAll(!allOpen)}
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-px">
        {groups.map((group, i) => {
          const open = isOpen(group.file, i);
          const from = entered ? 0 : staggerFrom;
          if (open) staggerFrom += group.fns.length;
          return (
            <FileGroup
              key={group.file}
              {...group}
              open={open}
              onOpenChange={(next) =>
                setOpenByFile((prev) => ({ ...prev, [group.file]: next }))
              }
              staggerFrom={from}
            />
          );
        })}
      </ul>
    </section>
  );
}

const SKELETON_ROWS = ["w-3/4", "w-1/2", "w-2/3", "w-2/5", "w-3/5", "w-1/3"];

export function AffectedListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3 px-4 py-4">
      <Skeleton className="h-3 w-28" />
      {SKELETON_ROWS.map((width) => (
        <div key={width} className="flex items-center gap-3">
          <Skeleton className={cn("h-4", width)} />
          <Skeleton className="ml-auto h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
