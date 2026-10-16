"use client";

import {
  CircleAlert,
  FolderClosed,
  FolderOpen,
  FolderUp,
  RotateCw,
  TriangleAlert,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/cn";
import type { IngestResult } from "@/lib/ingest";
import { DURATION, SPRING, ease } from "@/lib/motion";
import { formatRepoRef, parseRepoRef } from "@/lib/repo-ref";
import { useIngest, type IngestPhase, type IngestSource } from "@/state/ingest";
import { useProjectData } from "@/state/project";
import { GitHubMark } from "./GitHubMark";
import { formatCount, formatElapsed, ingestSteps } from "./ingest-steps";
import { StepList } from "./StepList";
import { useFolderPicker } from "./useFolderPicker";

const SUCCESS_BEAT_MS = 1200;
const WARNING_BEAT_MS = 4000;
const GRAPH_WAIT_MS = 10_000;

const selectRun = (s: ReturnType<typeof useIngest.getState>) => ({
  phase: s.phase,
  source: s.source,
  stage: s.stage,
  details: s.details,
  progress: s.progress,
  startedAt: s.startedAt,
  finishedAt: s.finishedAt,
  error: s.error,
  warning: s.warning,
  result: s.result,
});

type IngestRun = ReturnType<typeof selectRun>;

// reset() empties the store while the card is still fading out; the last
// non-idle run keeps the card (and the handoff pill) from flashing empty.
function useLastRun(): IngestRun {
  const live = useIngest(useShallow(selectRun));
  const last = useRef(live);
  if (live.phase !== "idle") last.current = live;
  return last.current;
}

function useElapsed(startedAt: number | null, finishedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [startedAt, finishedAt]);
  return startedAt ? Math.max(0, (finishedAt ?? now) - startedAt) : 0;
}

/**
 * Holds the success card for a beat, and until the new graph has loaded (up
 * to GRAPH_WAIT_MS) so the top-bar pill has project info to land on, then
 * hands off via reset().
 * The pill only takes layoutId="project-pill" in the frame before reset, so
 * the previous project's pill never flies into the card when "done" begins.
 */
function useHandoff(done: boolean, holdMs: number) {
  const reset = useIngest((s) => s.reset);
  const graphLoading = useProjectData((s) => s.status === "loading");
  const [beatOver, setBeatOver] = useState(false);
  const [waitedOut, setWaitedOut] = useState(false);

  useEffect(() => {
    setBeatOver(false);
    setWaitedOut(false);
    if (!done) return;
    const beat = setTimeout(() => setBeatOver(true), holdMs);
    // The done card has no controls, so a hung graph request must not pin it.
    const cap = setTimeout(() => setWaitedOut(true), GRAPH_WAIT_MS);
    return () => {
      clearTimeout(beat);
      clearTimeout(cap);
    };
  }, [done, holdMs]);

  const graphSettled = !graphLoading || waitedOut;
  const handoff = done && beatOver && graphSettled;
  useEffect(() => {
    if (!handoff) return;
    const frame = requestAnimationFrame(() => reset());
    return () => cancelAnimationFrame(frame);
  }, [handoff, reset]);

  return { handoff, graphSettled };
}

function ProgressBar({
  progress,
  runKey,
  phase,
}: {
  progress: number;
  runKey: number | null;
  phase: IngestPhase;
}) {
  const reduce = useReducedMotion();
  // Store progress is monotonic per run, but a retry restarts at 0; the bar
  // must never slide back mid-run, so the high-water mark is keyed by run.
  const highWater = useRef({ runKey, value: 0 });
  if (highWater.current.runKey !== runKey) {
    highWater.current = { runKey, value: 0 };
  }
  highWater.current.value = Math.max(highWater.current.value, progress);
  const percent = Math.round(highWater.current.value * 100);

  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3"
      >
        <motion.div
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={reduce ? { duration: 0 } : ease(0.6)}
          className={cn(
            "h-full rounded-full transition-colors duration-base ease-out",
            phase === "done" && "bg-ok",
            phase === "error" && "bg-danger",
            phase === "cancelled" && "bg-text-dim",
            (phase === "running" || phase === "preparing") && "bg-accent",
          )}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-text-dim">
        {percent}%
      </span>
    </div>
  );
}

function SourcePill({
  source,
  result,
  handoff,
}: {
  source: IngestSource | null;
  result: IngestResult | null;
  handoff: boolean;
}) {
  let icon: ReactNode;
  let name: string;
  let meta: string | undefined;
  if (result) {
    icon = result.source === "github" ? <GitHubMark /> : <FolderClosed />;
    name = result.slug;
    meta = `${formatCount(result.stats.functions)} functions`;
  } else if (source?.kind === "github") {
    const ref = parseRepoRef(source.repo);
    icon = <GitHubMark />;
    name = ref ? formatRepoRef(ref) : source.repo;
  } else if (source) {
    icon = <FolderClosed />;
    name = source.name;
    meta = `${formatCount(source.fileCount)} files`;
  } else {
    icon = <FolderOpen />;
    name = "Local folder";
  }

  return (
    <motion.div
      key={handoff ? "handoff" : "static"}
      layoutId={handoff ? "project-pill" : undefined}
      transition={SPRING}
      // Radius in style so motion counter-scales it during the shared-layout morph.
      style={{ borderRadius: 10 }}
      className="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 border border-border bg-surface-2 px-2 text-sm [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-text-dim"
    >
      {icon}
      <span className="truncate font-mono text-text">{name}</span>
      {meta && <span className="shrink-0 text-xs text-text-dim">· {meta}</span>}
    </motion.div>
  );
}

function SuccessSummary({
  result,
  warning,
}: {
  result: IngestResult;
  warning: string;
}) {
  const counters = [
    { label: "Files", value: result.stats.files },
    { label: "Functions", value: result.stats.functions },
    { label: "Call edges", value: result.stats.calls },
  ];

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-2">
        {counters.map(({ label, value }) => (
          <div
            key={label}
            className="min-w-0 rounded-md border border-border bg-surface-2 px-3 py-2"
          >
            <dt className="truncate text-xs text-text-dim">{label}</dt>
            <dd className="text-md font-semibold text-text">
              <NumberTicker value={value} />
            </dd>
          </div>
        ))}
      </dl>
      {warning && (
        <p className="flex gap-2 text-xs text-accent-ink">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {warning}
        </p>
      )}
    </div>
  );
}

function FailureActions({
  error,
  source,
  actionRef,
}: {
  error: string;
  source: IngestSource | null;
  actionRef: RefObject<HTMLButtonElement>;
}) {
  const analyzeRepo = useIngest((s) => s.analyzeRepo);
  const reset = useIngest((s) => s.reset);
  const folderPicker = useFolderPicker();

  return (
    <div className="flex flex-col gap-3">
      <div
        role="alert"
        className="flex gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger-ink"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="min-w-0 break-words">{error || "Analysis failed."}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {source?.kind !== "github" && (
          <span className="mr-auto text-xs text-text-dim">
            Pick the folder again to retry.
          </span>
        )}
        <Button variant="ghost" onClick={reset}>
          Dismiss
        </Button>
        {source?.kind === "github" ? (
          <Button
            ref={actionRef}
            variant="primary"
            onClick={() => analyzeRepo(source.repo)}
          >
            <RotateCw />
            Retry
          </Button>
        ) : (
          <Button ref={actionRef} variant="primary" onClick={folderPicker.open}>
            <FolderUp />
            Choose folder
          </Button>
        )}
        {folderPicker.input}
      </div>
    </div>
  );
}

function CancelledActions({
  elapsed,
  actionRef,
}: {
  elapsed: number;
  actionRef: RefObject<HTMLButtonElement>;
}) {
  const reset = useIngest((s) => s.reset);
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-text-muted">
        Cancelled after{" "}
        <span className="tabular-nums">{formatElapsed(elapsed)}</span>
      </p>
      <Button ref={actionRef} onClick={reset}>
        Start over
      </Button>
    </div>
  );
}

export function IngestProgress() {
  const run = useLastRun();
  const { phase, source, startedAt, finishedAt, warning, result } = run;
  const cancel = useIngest((s) => s.cancel);
  const reset = useIngest((s) => s.reset);
  const reduce = useReducedMotion();

  const busy = phase === "preparing" || phase === "running";
  // uploadEntries leaves the previous run's finishedAt in place while it reads
  // the folder, which would freeze the timer at 0:00.
  const elapsed = useElapsed(startedAt, busy ? null : finishedAt);
  const holdMs = warning ? WARNING_BEAT_MS : reduce ? 0 : SUCCESS_BEAT_MS;
  const { handoff, graphSettled } = useHandoff(phase === "done", holdMs);

  const steps = ingestSteps(
    run,
    graphSettled ? `Finished in ${formatElapsed(elapsed)}` : "Loading graph",
  );
  const announcement =
    phase === "done"
      ? "Analysis done"
      : phase === "cancelled"
        ? "Analysis cancelled"
        : steps.find((s) => s.state === "active")?.label;

  const cardRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Only claim focus when it was dropped (the hero input or a clicked
    // button unmounted); never pull it away from another control.
    const active = document.activeElement;
    const card = cardRef.current;
    if (active && active !== document.body && active !== card) return;
    (actionRef.current ?? card)?.focus({ preventScroll: true });
  }, [phase]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && (phase === "error" || phase === "cancelled")) {
      e.stopPropagation();
      reset();
    }
  };

  let footer: ReactNode = null;
  if (phase === "error") {
    footer = (
      <FailureActions error={run.error} source={source} actionRef={actionRef} />
    );
  } else if (phase === "cancelled") {
    footer = <CancelledActions elapsed={elapsed} actionRef={actionRef} />;
  } else if (phase === "done" && result) {
    footer = <SuccessSummary result={result} warning={warning} />;
  } else if (busy) {
    footer = (
      <p className="text-xs text-text-dim">
        Safe to switch tabs. Closing this one stops the run.
      </p>
    );
  }

  return (
    <motion.div
      ref={cardRef}
      role="region"
      aria-label="Repository analysis"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: ease(DURATION.fast) }}
      transition={ease(DURATION.slow)}
      // Focus target only (not a tab stop), so no ring around the whole card.
      className="w-[440px] max-w-full rounded-lg border border-border bg-surface-1 shadow-overlay focus-visible:ring-0 focus-visible:ring-offset-0"
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="flex min-w-0 flex-1">
          <SourcePill source={source} result={result} handoff={handoff} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-text-dim">
          <span className="sr-only">Elapsed </span>
          {formatElapsed(elapsed)}
        </span>
        {busy && (
          <Button
            variant="ghost"
            size="sm"
            onClick={cancel}
            className="-mr-1.5"
          >
            Cancel
          </Button>
        )}
      </div>

      <div className="px-4 pb-4 pt-3">
        <ProgressBar progress={run.progress} runKey={startedAt} phase={phase} />
      </div>

      <div className="border-t border-border px-4 py-4">
        <StepList steps={steps} />
      </div>

      {footer && (
        <div className="border-t border-border px-4 py-3.5">{footer}</div>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </motion.div>
  );
}
