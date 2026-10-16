"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { DEPTH_MAX, DEPTH_MIN, IMPACT_LIMIT } from "@/lib/constants";
import type { Direction } from "@/lib/impact";
import { DURATION, ease } from "@/lib/motion";
import { useImpact } from "@/state/impact";
import { useWorkspace, type ViewMode } from "@/state/workspace";

const VIEW_OPTIONS: SegmentedOption<ViewMode>[] = [
  { value: "focus", label: "Blast radius" },
  { value: "full", label: "Full graph" },
];

const DIRECTION_OPTIONS: SegmentedOption<Direction>[] = [
  { value: "upstream", label: "Callers" },
  { value: "downstream", label: "Callees" },
];

const relatives = (direction: Direction) =>
  direction === "upstream" ? "callers" : "callees";

function Group({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface-1 p-0.5 shadow-raised",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DepthControl() {
  const depth = useWorkspace((s) => s.depth);
  const setDepth = useWorkspace((s) => s.setDepth);
  return (
    <Group>
      <div className="flex h-6 items-center gap-2.5 px-2">
        <span className="whitespace-nowrap text-xs font-medium text-text-muted">
          Depth <span className="tabular-nums text-text">{depth}</span>
        </span>
        <Slider
          className="w-20"
          min={DEPTH_MIN}
          max={DEPTH_MAX}
          step={1}
          value={[depth]}
          onValueChange={([value]) => setDepth(value)}
          thumbLabel="Depth"
        />
      </div>
    </Group>
  );
}

type ChipTone = "neutral" | "accent" | "danger";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "border-border text-text-muted",
  accent: "border-accent/30 text-accent-ink",
  danger: "border-danger/30 text-danger-ink",
};

interface TraceChip {
  key: string;
  tone: ChipTone;
  content: ReactNode;
}

function traceChip({
  status,
  direction,
  total,
  depth,
  truncated,
  retry,
}: {
  status: "idle" | "loading" | "ready" | "error";
  direction: Direction;
  total: number;
  depth: number;
  truncated: boolean;
  retry: () => void;
}): TraceChip | null {
  if (status === "loading")
    return {
      key: "loading",
      tone: "neutral",
      content: (
        <>
          <span className="size-1.5 animate-pulse-soft rounded-full bg-accent" />
          Tracing {relatives(direction)}
        </>
      ),
    };
  if (status === "error")
    return {
      key: "error",
      tone: "danger",
      content: (
        <>
          Trace failed
          <button
            type="button"
            onClick={retry}
            className="rounded-sm font-medium text-text underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </>
      ),
    };
  if (status !== "ready") return null;
  if (truncated)
    return {
      key: "truncated",
      tone: "accent",
      content: `Showing nearest ${IMPACT_LIMIT} of ${total.toLocaleString()}`,
    };
  if (total === 0)
    return {
      key: "none",
      tone: "neutral",
      content: `No ${relatives(direction)} within depth ${depth}`,
    };
  return null;
}

function TraceStatus() {
  const hasSelection = useWorkspace((s) => !!s.selectedId);
  const status = useImpact((s) => s.status);
  const direction = useImpact((s) => s.query?.direction ?? "upstream");
  const total = useImpact((s) => s.result?.total ?? 0);
  const depth = useImpact((s) => s.result?.depth ?? 0);
  const truncated = useImpact((s) => !!s.result?.truncated);
  const retry = useImpact((s) => s.retry);
  const chip = hasSelection
    ? traceChip({ status, direction, total, depth, truncated, retry })
    : null;

  // popLayout measures the exiting chip through a ref, so the motion element
  // has to be the direct child here rather than wrapped in a component.
  return (
    <div role="status" aria-live="polite" className="flex">
      <AnimatePresence mode="popLayout" initial={false}>
        {chip && (
          <motion.div
            key={chip.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={ease(DURATION.fast)}
            className={cn(
              "rounded-md border bg-surface-1 p-0.5 shadow-raised",
              CHIP_TONE[chip.tone],
            )}
          >
            <span className="flex h-6 items-center gap-1.5 whitespace-nowrap px-2 text-xs">
              {chip.content}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ZoomControls() {
  const controls = useWorkspace((s) => s.graphControls);
  return (
    <Group className="ml-auto flex items-center gap-0.5">
      <Tip label="Zoom in">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label="Zoom in"
          disabled={!controls}
          onClick={() => controls?.zoomIn()}
        >
          <Plus />
        </Button>
      </Tip>
      <Tip label="Zoom out">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label="Zoom out"
          disabled={!controls}
          onClick={() => controls?.zoomOut()}
        >
          <Minus />
        </Button>
      </Tip>
      <Tip label="Fit to view" keys={["F"]}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label="Fit to view"
          disabled={!controls}
          onClick={() => controls?.fit()}
        >
          <Maximize />
        </Button>
      </Tip>
    </Group>
  );
}

export function GraphToolbar() {
  const viewMode = useWorkspace((s) => s.viewMode);
  const direction = useWorkspace((s) => s.direction);
  const setViewMode = useWorkspace((s) => s.setViewMode);
  const setDirection = useWorkspace((s) => s.setDirection);

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center gap-2 [&>*]:pointer-events-auto">
      <Segmented
        size="sm"
        label="View"
        value={viewMode}
        options={VIEW_OPTIONS}
        onChange={setViewMode}
      />
      <Segmented
        size="sm"
        label="Direction"
        value={direction}
        options={DIRECTION_OPTIONS}
        onChange={setDirection}
      />
      <DepthControl />
      <TraceStatus />
      <ZoomControls />
    </div>
  );
}
