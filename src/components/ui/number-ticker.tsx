"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { EASE_OUT } from "@/lib/motion";

const format = new Intl.NumberFormat("en-US");

/** Tweens to `value` from wherever it was; jumps when reduced motion is on. */
export function NumberTicker({
  value,
  duration = 0.6,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = format.format(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        el.textContent = format.format(Math.round(v));
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format.format(value)}
    </span>
  );
}
