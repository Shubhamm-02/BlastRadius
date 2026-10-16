"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace, type PanelId } from "@/state/workspace";
import { isSheetPanel, type Breakpoint } from "./useBreakpoint";
import { PANEL_IDS } from "./useShellLayout";

export type SheetState = Record<PanelId, boolean>;

const CLOSED: SheetState = { explorer: false, inspector: false };

const settle = (open: SheetState, next: SheetState) =>
  next.explorer === open.explorer && next.inspector === open.inspector
    ? open
    : next;

/**
 * Open state for panels shown as drawers below 1280px. The workspace `panels`
 * flags stay the docked-panel preference; a toggle of one ("[" / "]",
 * toolbar buttons) flips the matching drawer instead, and a new selection
 * opens the inspector.
 */
export function usePanelSheets(bp: Breakpoint | null) {
  const [sheets, setSheets] = useState<SheetState>(CLOSED);
  const bpRef = useRef(bp);

  useEffect(() => {
    const first = bpRef.current === null && bp !== null;
    bpRef.current = bp;
    // A shared ?fn= link selects before this hook subscribes; on tablets the
    // non-modal inspector drawer opens for it like any other selection.
    const deepLinked =
      first && bp === "tablet" && useWorkspace.getState().selectedId !== null;
    // A drawer that doesn't exist at the new width closes, so it doesn't
    // spring back open when the window returns to that width.
    setSheets((open) =>
      settle(open, {
        explorer: open.explorer && isSheetPanel("explorer", bp),
        inspector:
          deepLinked || (open.inspector && isSheetPanel("inspector", bp)),
      }),
    );
  }, [bp]);

  useEffect(
    () =>
      useWorkspace.subscribe((s, prev) => {
        const current = bpRef.current;
        if (
          s.panels === prev.panels &&
          s.selectedId === prev.selectedId &&
          s.reveal === prev.reveal
        )
          return;
        if (!current || current === "desktop") return;

        setSheets((open) => {
          const next = { ...open };
          for (const panel of PANEL_IDS) {
            if (
              isSheetPanel(panel, current) &&
              s.panels[panel] !== prev.panels[panel]
            ) {
              next[panel] = !open[panel];
            }
          }
          if (s.selectedId !== prev.selectedId) {
            next.inspector = s.selectedId !== null;
            if (s.selectedId && current === "mobile") next.explorer = false;
          }
          if (s.reveal !== prev.reveal && s.reveal) {
            next[s.reveal.panel] = isSheetPanel(s.reveal.panel, current);
          }
          return settle(open, next);
        });
      }),
    [],
  );

  const setSheet = useCallback((panel: PanelId, open: boolean) => {
    setSheets((s) => (s[panel] === open ? s : { ...s, [panel]: open }));
  }, []);

  return { sheets, setSheet };
}
