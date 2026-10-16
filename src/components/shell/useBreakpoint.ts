"use client";

import { useSyncExternalStore } from "react";
import type { PanelId } from "@/state/workspace";

export type Breakpoint = "mobile" | "tablet" | "desktop";

const TABLET = "(min-width: 768px)";
const DESKTOP = "(min-width: 1280px)";

function subscribe(onChange: () => void) {
  const queries = [TABLET, DESKTOP].map((q) => window.matchMedia(q));
  queries.forEach((q) => q.addEventListener("change", onChange));
  return () =>
    queries.forEach((q) => q.removeEventListener("change", onChange));
}

function current(): Breakpoint {
  if (window.matchMedia(DESKTOP).matches) return "desktop";
  return window.matchMedia(TABLET).matches ? "tablet" : "mobile";
}

/**
 * null on the server and during hydration, so the first client render matches
 * the server HTML; callers fall back to CSS breakpoints until it resolves.
 */
export function useBreakpoint(): Breakpoint | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

/** Whether a panel is a drawer rather than a docked column at this width. */
export const isSheetPanel = (panel: PanelId, bp: Breakpoint | null) =>
  bp === "mobile" || (bp === "tablet" && panel === "inspector");
