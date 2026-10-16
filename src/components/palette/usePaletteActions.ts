"use client";

import {
  ArrowDownToDot,
  ArrowUpFromDot,
  Focus,
  Keyboard,
  Link,
  Moon,
  Network,
  PanelLeft,
  PanelRight,
  Plus,
  Scan,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { copyText, shareUrl } from "@/lib/share";
import { useIngest } from "@/state/ingest";
import { useWorkspace } from "@/state/workspace";
import {
  fitGraph,
  toggleDirection,
  toggleExplorer,
  toggleInspector,
  toggleShortcuts,
  toggleViewMode,
  type ShortcutId,
} from "./shortcuts";

export interface PaletteAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Extra lowercase words the query can match, beyond the label. */
  keywords: string;
  shortcut?: ShortcutId;
  perform(): void;
}

export function usePaletteActions(): PaletteAction[] {
  const projectId = useWorkspace((s) => s.projectId);
  const viewMode = useWorkspace((s) => s.viewMode);
  const direction = useWorkspace((s) => s.direction);
  const explorerOpen = useWorkspace((s) => s.panels.explorer);
  const inspectorOpen = useWorkspace((s) => s.panels.inspector);
  const canFit = useWorkspace((s) => s.graphControls !== null);
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const actions: PaletteAction[] = [];
  if (projectId) {
    actions.push(
      {
        id: "view",
        label:
          viewMode === "focus" ? "Show full graph" : "Show blast radius only",
        icon: viewMode === "focus" ? Network : Focus,
        keywords: "toggle view mode blast radius full graph focus",
        shortcut: "view",
        perform: toggleViewMode,
      },
      {
        id: "direction",
        label:
          direction === "upstream" ? "Switch to callees" : "Switch to callers",
        icon: direction === "upstream" ? ArrowDownToDot : ArrowUpFromDot,
        keywords: "direction upstream downstream callers callees",
        shortcut: "direction",
        perform: toggleDirection,
      },
    );
    if (canFit) {
      actions.push({
        id: "fit",
        label: "Fit graph",
        icon: Scan,
        keywords: "zoom camera reset view",
        shortcut: "fit",
        perform: fitGraph,
      });
    }
    actions.push(
      {
        id: "explorer",
        label: explorerOpen ? "Hide explorer" : "Show explorer",
        icon: PanelLeft,
        keywords: "toggle explorer sidebar panel files",
        shortcut: "explorer",
        perform: toggleExplorer,
      },
      {
        id: "inspector",
        label: inspectorOpen ? "Hide inspector" : "Show inspector",
        icon: PanelRight,
        keywords: "toggle inspector sidebar panel details",
        shortcut: "inspector",
        perform: toggleInspector,
      },
      {
        id: "share",
        label: "Copy share link",
        icon: Link,
        keywords: "url permalink clipboard",
        perform: () => void copyText(shareUrl(), "Link copied"),
      },
      {
        id: "new",
        label: "Analyze another repo",
        icon: Plus,
        keywords: "new github upload repository folder start",
        perform: () => {
          // A stale error from an earlier attempt would otherwise greet the start screen.
          useIngest.getState().reset();
          useWorkspace.getState().setProject(null);
        },
      },
    );
  }
  actions.push(
    {
      id: "theme",
      label: dark ? "Switch to light theme" : "Switch to dark theme",
      icon: dark ? Sun : Moon,
      keywords: "toggle theme appearance dark light mode",
      perform: () => setTheme(dark ? "light" : "dark"),
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      icon: Keyboard,
      keywords: "help keys hotkeys keybindings",
      shortcut: "help",
      perform: toggleShortcuts,
    },
  );
  return actions;
}
