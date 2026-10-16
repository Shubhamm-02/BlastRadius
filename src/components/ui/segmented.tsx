"use client";

import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SPRING } from "@/lib/motion";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * Radio-group segmented control with a sliding pill (shared layoutId).
 * Arrow keys move the selection, like a native radio group.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const pillId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-1 p-0.5 shadow-raised",
        className,
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-sm font-medium transition-colors duration-fast ease-out [&_svg]:size-3.5",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-sm",
              active ? "text-text" : "text-text-muted hover:text-text",
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                transition={SPRING}
                className="absolute inset-0 rounded-sm border border-border-strong bg-surface-3 shadow-raised"
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
