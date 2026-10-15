"use client";

import { create } from "zustand";
import { DEPTH_DEFAULT } from "@/lib/constants";
import type { Direction } from "@/lib/impact";

export type ViewMode = "focus" | "full";
export type PanelId = "explorer" | "inspector";

/** Imperative camera controls, registered by the graph canvas while mounted. */
export interface GraphControls {
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  centerOn(id: string): void;
}

interface WorkspaceState {
  projectId: string | null;
  selectedId: string | null;
  hoveredId: string | null;
  direction: Direction;
  depth: number;
  viewMode: ViewMode;
  panels: Record<PanelId, boolean>;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  /** Most recent first, per project; persisted by WorkspaceEffects. */
  recent: string[];
  graphControls: GraphControls | null;

  setProject(id: string | null): void;
  select(id: string | null): void;
  hover(id: string | null): void;
  setDirection(direction: Direction): void;
  setDepth(depth: number): void;
  setViewMode(mode: ViewMode): void;
  setPanel(panel: PanelId, open: boolean): void;
  togglePanel(panel: PanelId): void;
  setPaletteOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  setRecent(ids: string[]): void;
  registerGraphControls(controls: GraphControls | null): void;
}

const RECENT_MAX = 8;

export const useWorkspace = create<WorkspaceState>()((set) => ({
  projectId: null,
  selectedId: null,
  hoveredId: null,
  direction: "upstream",
  depth: DEPTH_DEFAULT,
  viewMode: "full",
  panels: { explorer: true, inspector: true },
  paletteOpen: false,
  shortcutsOpen: false,
  recent: [],
  graphControls: null,

  setProject: (projectId) =>
    set((s) =>
      s.projectId === projectId
        ? s
        : { projectId, selectedId: null, hoveredId: null, recent: [] },
    ),
  select: (selectedId) =>
    set((s) => ({
      selectedId,
      recent: selectedId
        ? [selectedId, ...s.recent.filter((id) => id !== selectedId)].slice(0, RECENT_MAX)
        : s.recent,
    })),
  hover: (hoveredId) => set({ hoveredId }),
  setDirection: (direction) => set({ direction }),
  setDepth: (depth) => set({ depth }),
  setViewMode: (viewMode) => set({ viewMode }),
  setPanel: (panel, open) => set((s) => ({ panels: { ...s.panels, [panel]: open } })),
  togglePanel: (panel) =>
    set((s) => ({ panels: { ...s.panels, [panel]: !s.panels[panel] } })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setRecent: (recent) => set({ recent }),
  registerGraphControls: (graphControls) => set({ graphControls }),
}));
