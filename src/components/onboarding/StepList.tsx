"use client";

import { Check, Minus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { DURATION, ease } from "@/lib/motion";
import type { IngestStep, StepState } from "./ingest-steps";

function StepGlyph({ state }: { state: StepState }) {
  switch (state) {
    case "pending":
      return (
        <span className="size-2.5 rounded-full border border-border-strong" />
      );
    case "active":
      return (
        <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-accent/25 border-t-accent" />
      );
    case "done":
      return (
        <span className="grid size-4 place-items-center rounded-full bg-ok/15 text-ok">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      );
    case "failed":
      return (
        <span className="grid size-4 place-items-center rounded-full bg-danger/15 text-danger-ink">
          <X className="size-2.5" strokeWidth={3} />
        </span>
      );
    case "stopped":
      return (
        <span className="grid size-4 place-items-center rounded-full bg-surface-3 text-text-dim">
          <Minus className="size-2.5" strokeWidth={3} />
        </span>
      );
  }
}

function StepIcon({ state }: { state: StepState }) {
  return (
    <span aria-hidden className="relative mt-0.5 size-4 shrink-0">
      <AnimatePresence initial={false}>
        <motion.span
          key={state}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={ease(DURATION.fast)}
          className="absolute inset-0 grid place-items-center"
        >
          <StepGlyph state={state} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const LABEL_CLASS: Record<StepState, string> = {
  pending: "text-text-dim",
  active:
    "animate-shimmer bg-[linear-gradient(90deg,rgb(var(--text))_35%,rgb(var(--text-dim))_50%,rgb(var(--text))_65%)] bg-[length:200%_100%] bg-clip-text font-medium text-transparent motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-text",
  done: "text-text-muted",
  failed: "font-medium text-text",
  stopped: "text-text-muted",
};

const STATE_NAME: Record<StepState, string> = {
  pending: "pending",
  active: "in progress",
  done: "done",
  failed: "failed",
  stopped: "stopped",
};

export function StepList({ steps }: { steps: IngestStep[] }) {
  const reduce = useReducedMotion();

  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <li
          key={step.id}
          className="relative flex gap-3 pb-3 last:pb-0"
          aria-current={step.state === "active" ? "step" : undefined}
        >
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute bottom-0.5 left-2 top-[22px] w-px -translate-x-1/2 transition-colors duration-slow ease-out",
                step.state === "done" ? "bg-ok/30" : "bg-border",
              )}
            />
          )}
          <StepIcon state={step.state} />
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm", LABEL_CLASS[step.state])}>
              {step.label}
              <span className="sr-only">, {STATE_NAME[step.state]}</span>
            </p>
            <AnimatePresence initial={false}>
              {step.detail && (
                <motion.p
                  key="detail"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  // Height is not a transform, so MotionConfig does not skip it.
                  transition={reduce ? { duration: 0 } : ease(DURATION.base)}
                  title={step.detail}
                  className={cn(
                    "font-mono text-xs text-text-dim",
                    step.state === "done"
                      ? "truncate"
                      : "line-clamp-2 break-words",
                  )}
                >
                  {step.detail}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </li>
      ))}
    </ol>
  );
}
