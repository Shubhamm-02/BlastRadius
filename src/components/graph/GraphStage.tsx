"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { DURATION, ease } from "@/lib/motion";
import { useProjectData } from "@/state/project";
import { useWorkspace } from "@/state/workspace";
import { EdgeLegend } from "./EdgeLegend";
import { GraphSkeleton } from "./GraphSkeleton";
import { GraphToolbar } from "./GraphToolbar";

const GraphCanvas = dynamic(
  () => import("./GraphCanvas").then((m) => m.GraphCanvas),
  { ssr: false, loading: () => <GraphSkeleton /> },
);

function Layer({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={ease(DURATION.fast)}
      className="absolute inset-0"
    >
      {children}
    </motion.div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface-1 p-4 shadow-raised">
        {children}
      </div>
    </div>
  );
}

function GraphError() {
  const error = useProjectData((s) => s.error);
  const reload = useProjectData((s) => s.reload);
  return (
    <Notice>
      <div role="alert">
        <p className="flex items-center gap-2 text-sm font-medium text-text">
          <TriangleAlert className="size-4 shrink-0 text-danger-ink" />
          Couldn&apos;t load the graph
        </p>
        <p className="mt-1 break-words text-sm text-text-muted">{error}</p>
      </div>
      <Button size="sm" className="mt-3" onClick={reload}>
        <RotateCw />
        Retry
      </Button>
    </Notice>
  );
}

function GraphEmpty() {
  return (
    <Notice>
      <p className="text-sm font-medium text-text">No functions to graph</p>
      <p className="mt-1 text-sm text-text-muted">
        The parser found no TypeScript or JavaScript functions in this project.
      </p>
    </Notice>
  );
}

function FocusHint() {
  const show = useWorkspace((s) => s.viewMode === "focus" && !s.selectedId);
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={ease(DURATION.base)}
            className="max-w-sm rounded-md border border-border bg-surface-1 px-4 py-3 text-center shadow-raised"
          >
            <p className="text-sm font-medium text-text">
              Select a function to see its blast radius
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Click a node, or press <Kbd>/</Kbd> to search
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReadyStage() {
  return (
    <div className="absolute inset-0">
      <GraphCanvas />
      <FocusHint />
      <GraphToolbar />
      <EdgeLegend />
    </div>
  );
}

type Phase = "loading" | "error" | "empty" | "ready";

function usePhase(): Phase {
  return useProjectData((s) => {
    if (s.status === "error") return "error";
    if (s.status !== "ready") return "loading";
    return s.graph.nodes.length === 0 ? "empty" : "ready";
  });
}

export function GraphStage() {
  const projectId = useWorkspace((s) => s.projectId);
  const phase = usePhase();
  if (!projectId) return null;

  return (
    <section
      aria-label="Call graph"
      className="relative h-full min-h-0 w-full flex-1 overflow-hidden"
    >
      <AnimatePresence initial={false}>
        {phase === "ready" ? (
          <ReadyStage key="ready" />
        ) : (
          <Layer key={phase}>
            {phase === "error" ? (
              <GraphError />
            ) : phase === "empty" ? (
              <GraphEmpty />
            ) : (
              <GraphSkeleton />
            )}
          </Layer>
        )}
      </AnimatePresence>
    </section>
  );
}
