"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace, type PanelId } from "@/state/workspace";
import { isSheetPanel, type Breakpoint } from "./useBreakpoint";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

export const PANEL_IDS: PanelId[] = ["explorer", "inspector"];

export const PANEL_SIZE: Record<
  PanelId,
  { initial: number; min: number; max: number }
> = {
  explorer: { initial: 280, min: 220, max: 420 },
  inspector: { initial: 340, min: 280, max: 480 },
};

interface StoredLayout {
  widths: Partial<Record<PanelId, number>>;
  panels: Partial<Record<PanelId, boolean>>;
}

const STORAGE_KEY = "br:layout";
const PERSIST_DELAY_MS = 250;

const clampWidth = (panel: PanelId, width: number) => {
  const { min, max } = PANEL_SIZE[panel];
  return Math.round(Math.min(max, Math.max(min, width)));
};

function readLayout(): StoredLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { widths: saved.widths ?? {}, panels: saved.panels ?? {} };
  } catch {
    return { widths: {}, panels: {} };
  }
}

function writeLayout(patch: Partial<StoredLayout>) {
  const saved = readLayout();
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        widths: { ...saved.widths, ...patch.widths },
        panels: { ...saved.panels, ...patch.panels },
      }),
    );
  } catch {
    // Layout falls back to defaults next visit.
  }
}

/**
 * One side panel's width, owned by the panel so a drag re-renders only that
 * column. The server renders the default; the stored width is applied before
 * the hydrated tree paints, and `restored` turns on a frame later so width
 * transitions never animate the restore.
 */
export function usePanelWidth(panel: PanelId) {
  const [width, setWidth] = useState(PANEL_SIZE[panel].initial);
  const [restored, setRestored] = useState(false);
  const persisted = useRef(width);

  useIsomorphicLayoutEffect(() => {
    const saved = readLayout().widths[panel];
    if (typeof saved === "number") {
      persisted.current = clampWidth(panel, saved);
      setWidth(persisted.current);
    }
    const frame = requestAnimationFrame(() => setRestored(true));
    return () => cancelAnimationFrame(frame);
  }, [panel]);

  useEffect(() => {
    if (!restored || width === persisted.current) return;
    const timer = setTimeout(() => {
      persisted.current = width;
      writeLayout({ widths: { [panel]: width } });
    }, PERSIST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [panel, width, restored]);

  const resize = useCallback(
    (next: number) => setWidth(clampWidth(panel, next)),
    [panel],
  );

  return { width, resize, restored };
}

/**
 * Restores the panels' open flags after mount and saves later changes. Below
 * 1280px a flag change toggles a drawer instead (usePanelSheets), so only
 * changes to a panel docked at the current width count as a preference.
 */
export function usePersistedPanels(bp: Breakpoint | null) {
  const bpRef = useRef(bp);

  useEffect(() => {
    bpRef.current = bp;
  }, [bp]);

  useIsomorphicLayoutEffect(() => {
    const saved = readLayout().panels;
    const { setPanel } = useWorkspace.getState();
    for (const panel of PANEL_IDS) {
      const open = saved[panel];
      if (typeof open === "boolean") setPanel(panel, open);
    }
  }, []);

  useEffect(
    () =>
      useWorkspace.subscribe((s, prev) => {
        if (s.panels === prev.panels) return;
        const docked: StoredLayout["panels"] = {};
        for (const panel of PANEL_IDS) {
          if (
            s.panels[panel] !== prev.panels[panel] &&
            !isSheetPanel(panel, bpRef.current)
          )
            docked[panel] = s.panels[panel];
        }
        if (Object.keys(docked).length > 0) writeLayout({ panels: docked });
      }),
    [],
  );
}
