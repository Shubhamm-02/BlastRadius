"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

const format = new Intl.NumberFormat("en-US");
const DURATION_MS = 600;

// cubic-bezier(0.2, 0.8, 0.2, 1) is close enough to an ease-out quart for a
// count-up, and a plain rAF loop avoids pulling motion's animation engine
// into the first-load bundle.
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

/** Tweens to `value` from wherever it was; jumps when reduced motion is on. */
export function NumberTicker({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = from.current;
    from.current = value;
    if (reduce || start === value) {
      el.textContent = format.format(value);
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS);
      el.textContent = format.format(
        Math.round(start + (value - start) * easeOutQuart(t)),
      );
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduce]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format.format(value)}
    </span>
  );
}
