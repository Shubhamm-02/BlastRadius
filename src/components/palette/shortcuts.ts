"use client";

import { create } from "zustand";
import { useWorkspace } from "@/state/workspace";

export type ShortcutGroup = "Navigation" | "Graph" | "Panels";

export type ShortcutId =
  | "palette"
  | "search"
  | "escape"
  | "help"
  | "fit"
  | "view"
  | "direction"
  | "explorer"
  | "inspector";

export interface Shortcut {
  id: ShortcutId;
  group: ShortcutGroup;
  label: string;
  /** Compared with KeyboardEvent.key, so "?" already implies Shift. */
  key: string;
  mod?: boolean;
  /** Fires while focus is in a text field. */
  inFields?: boolean;
  /** Fires while the palette or shortcuts sheet is open. */
  overModals?: boolean;
  run(event: KeyboardEvent): void;
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "Navigation",
  "Graph",
  "Panels",
];

const ws = () => useWorkspace.getState();

const SINGLE_KEY_STORAGE_KEY = "br:single-key-shortcuts";

// Speech input and typing outside fields trigger plain keys by accident (WCAG 2.1.4).
export const useSingleKeyShortcuts = create<{
  on: boolean;
  setOn(on: boolean): void;
}>((set) => ({
  on: (() => {
    try {
      return localStorage.getItem(SINGLE_KEY_STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  })(),
  setOn: (on) => {
    set({ on });
    try {
      localStorage.setItem(SINGLE_KEY_STORAGE_KEY, on ? "on" : "off");
    } catch {
      // The setting resets to on next visit.
    }
  },
}));

export function toggleSingleKeyShortcuts() {
  const { on, setOn } = useSingleKeyShortcuts.getState();
  setOn(!on);
}

export const isMac = () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export const isEditable = (target: EventTarget | null): target is HTMLElement =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

function togglePalette() {
  const { paletteOpen, setPaletteOpen, setShortcutsOpen } = ws();
  setShortcutsOpen(false);
  setPaletteOpen(!paletteOpen);
}

export function toggleShortcuts() {
  const { shortcutsOpen, setPaletteOpen, setShortcutsOpen } = ws();
  setPaletteOpen(false);
  setShortcutsOpen(!shortcutsOpen);
}

const SEARCH_FOCUS_MAX_FRAMES = 20;

function focusExplorerSearch() {
  const { projectId, revealPanel } = ws();
  if (!projectId) return;
  revealPanel("explorer");
  // A drawer mounts its content a frame or more after it opens.
  let frames = 0;
  const attempt = () => {
    const input = document.getElementById("explorer-search");
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    } else if (++frames < SEARCH_FOCUS_MAX_FRAMES) {
      requestAnimationFrame(attempt);
    }
  };
  requestAnimationFrame(attempt);
}

export const fitGraph = () => ws().graphControls?.fit();

export function toggleViewMode() {
  const { viewMode, setViewMode } = ws();
  setViewMode(viewMode === "focus" ? "full" : "focus");
}

export function toggleDirection() {
  const { direction, setDirection } = ws();
  setDirection(direction === "upstream" ? "downstream" : "upstream");
}

export const toggleExplorer = () => ws().togglePanel("explorer");
export const toggleInspector = () => ws().togglePanel("inspector");

function escape(event: KeyboardEvent) {
  // Blurring hands the single-key shortcuts back immediately.
  if (isEditable(event.target)) event.target.blur();
  ws().select(null);
}

/** The single source for the key handler and the shortcuts sheet. */
export const SHORTCUTS: Shortcut[] = [
  {
    id: "palette",
    group: "Navigation",
    label: "Command palette",
    key: "k",
    mod: true,
    inFields: true,
    overModals: true,
    run: togglePalette,
  },
  {
    id: "search",
    group: "Navigation",
    label: "Search functions",
    key: "/",
    run: focusExplorerSearch,
  },
  {
    id: "escape",
    group: "Navigation",
    label: "Clear selection",
    key: "Escape",
    inFields: true,
    run: escape,
  },
  {
    id: "help",
    group: "Navigation",
    label: "Keyboard shortcuts",
    key: "?",
    overModals: true,
    run: toggleShortcuts,
  },
  { id: "fit", group: "Graph", label: "Fit graph", key: "f", run: fitGraph },
  {
    id: "view",
    group: "Graph",
    label: "Toggle blast radius / full graph",
    key: "v",
    run: toggleViewMode,
  },
  {
    id: "direction",
    group: "Graph",
    label: "Switch callers / callees",
    key: "d",
    run: toggleDirection,
  },
  {
    id: "explorer",
    group: "Panels",
    label: "Toggle explorer",
    key: "[",
    run: toggleExplorer,
  },
  {
    id: "inspector",
    group: "Panels",
    label: "Toggle inspector",
    key: "]",
    run: toggleInspector,
  },
];

export const shortcutById = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function matchShortcut(event: KeyboardEvent): Shortcut | undefined {
  // AltGr arrives as Ctrl+Alt on Windows, and Option or AltGr is how many layouts
  // type "[", "]" and "/", so Alt only rules out letter keys.
  const altGraph = event.getModifierState("AltGraph");
  const ctrl = event.ctrlKey && !altGraph;
  const letter = /^[a-z]$/i.test(event.key);
  if (event.altKey && !altGraph && letter) return undefined;
  // Ctrl+K on macOS is kill-line in every text field, so only Cmd counts there.
  const mac = isMac();
  if (mac ? ctrl : event.metaKey) return undefined;
  const mod = mac ? event.metaKey : ctrl;
  // Caps Lock reports "F" for a plain f.
  const key =
    letter && (mod || !event.shiftKey) ? event.key.toLowerCase() : event.key;
  return SHORTCUTS.find((s) => s.key === key && Boolean(s.mod) === mod);
}

const KEY_LABELS: Record<string, string> = { Escape: "Esc" };

export function shortcutKeys(shortcut: Shortcut, modLabel: string): string[] {
  const key = KEY_LABELS[shortcut.key] ?? shortcut.key.toUpperCase();
  return shortcut.mod ? [modLabel, key] : [key];
}
