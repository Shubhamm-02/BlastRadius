import type { Transition } from "motion/react";

const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

export const DURATION = { fast: 0.15, base: 0.2, slow: 0.3 } as const;

export const ease = (duration: number = DURATION.base): Transition => ({
  duration,
  ease: EASE_OUT,
});

/** For layout and shared-element moves; settles without visible overshoot. */
export const SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.8,
};
