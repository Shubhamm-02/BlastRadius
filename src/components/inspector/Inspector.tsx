"use client";

import { RotateCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";
import type { ImpactResult } from "@/lib/impact";
import { DURATION, ease } from "@/lib/motion";
import { useImpact } from "@/state/impact";
import { useProjectData } from "@/state/project";
import { useWorkspace } from "@/state/workspace";
import { AffectedList, AffectedListSkeleton } from "./AffectedList";
import {
  affectedNoun,
  fileCount,
  plural,
  useBlastRadius,
  type BlastRadius,
} from "./blast-radius";
import { ImpactStats, ImpactStatsSkeleton } from "./ImpactStats";
import { SummaryCard } from "./SummaryCard";
import { TargetHeader, TargetHeaderSkeleton } from "./TargetHeader";

function useModKey() {
  const [mod, setMod] = useState("⌘");
  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.userAgent)) setMod("Ctrl");
  }, []);
  return mod;
}

function NoSelection() {
  const mod = useModKey();
  return (
    <div className="flex flex-1 flex-col justify-center gap-5 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-text">
          Select a function to see what depends on it
        </h2>
        <p className="text-sm text-text-muted">
          Click a node in the graph or pick one from the explorer.
        </p>
      </div>
      <ul className="flex flex-col gap-2 text-xs text-text-dim">
        <li className="flex items-center gap-2">
          <span className="flex gap-0.5">
            <Kbd>{mod}</Kbd>
            <Kbd>K</Kbd>
          </span>
          Search functions
        </li>
        <li className="flex items-center gap-2">
          <Kbd>/</Kbd>
          Filter the explorer
        </li>
      </ul>
    </div>
  );
}

function ImpactError() {
  const error = useImpact((s) => s.error);
  const retry = useImpact((s) => s.retry);
  return (
    <div
      role="alert"
      className="m-4 flex flex-col items-start gap-3 rounded-md border border-danger/30 bg-danger/5 p-3"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text">
          Couldn&apos;t trace the blast radius
        </p>
        <p className="break-words text-sm text-text-muted">{error}</p>
      </div>
      <Button size="sm" onClick={retry}>
        <RotateCw />
        Retry
      </Button>
    </div>
  );
}

function ImpactBody({
  result,
  blast,
}: {
  result: ImpactResult;
  blast: BlastRadius;
}) {
  const loading = useImpact((s) => s.status === "loading");
  const depth = useWorkspace((s) => s.depth);

  return (
    <div
      aria-busy={loading}
      className={cn(
        "flex flex-col pb-4 transition-opacity duration-base ease-out",
        loading && "opacity-60",
      )}
    >
      <ImpactStats
        result={result}
        blast={blast}
        refreshingDepth={loading ? depth : null}
      />
      <SummaryCard result={result} />
      <AffectedList result={result} groups={blast.groups} />
    </div>
  );
}

function TargetInspector({ id }: { id: string }) {
  const node = useProjectData((s) => s.nodeById.get(id));
  const status = useImpact((s) => s.status);
  const live = useImpact((s) => (s.result?.target.id === id ? s.result : null));
  const direction = useWorkspace((s) => s.direction);
  const depth = useWorkspace((s) => s.depth);
  // The store only previews depth decreases; raising depth clears the result.
  // Hold the last one so it stays visible (dimmed) until the refetch lands.
  const [kept, setKept] = useState(live);
  if (live && live !== kept) setKept(live);
  const result =
    live ??
    (status === "loading" && kept?.direction === direction ? kept : null);
  const blast = useBlastRadius(result);
  const target = node ?? result?.target;

  return (
    <>
      {target ? (
        <TargetHeader target={target} risk={blast?.risk ?? null} />
      ) : (
        <TargetHeaderSkeleton />
      )}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {status === "error" ? (
          <ImpactError />
        ) : result && blast ? (
          <ImpactBody result={result} blast={blast} />
        ) : (
          <>
            <ImpactStatsSkeleton
              context={`Tracing ${direction === "upstream" ? "callers" : "callees"} within ${plural(depth, "hop")}`}
            />
            <AffectedListSkeleton />
          </>
        )}
      </div>
    </>
  );
}

/** Polite announcement when a result lands; lives outside the cross-fade so it persists. */
function ImpactAnnouncer() {
  const result = useImpact((s) => (s.status === "ready" ? s.result : null));
  const message = useMemo(() => {
    if (!result) return "";
    const files = new Set(result.affected.map((fn) => fn.file)).size;
    return `${result.total} ${affectedNoun(result.direction, result.total)} across ${fileCount(files, result.truncated)}`;
  }, [result]);
  return (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}

export function Inspector() {
  const selectedId = useWorkspace((s) => s.selectedId);

  return (
    <section
      data-inspector
      aria-label="Inspector"
      className="flex h-full min-h-0 w-full flex-col"
    >
      <ImpactAnnouncer />
      {/* Stacking both panels in one grid cell gives a true cross-fade while
          keeping intrinsic height, which a bottom sheet needs. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        <AnimatePresence initial={false}>
          <motion.div
            key={selectedId ?? "none"}
            className="col-start-1 row-start-1 flex min-h-0 flex-col"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, pointerEvents: "none" }}
            transition={ease(DURATION.fast)}
          >
            {selectedId ? <TargetInspector id={selectedId} /> : <NoSelection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
