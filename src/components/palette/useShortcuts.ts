"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/state/workspace";
import { isEditable, matchShortcut, useSingleKeyShortcuts } from "./shortcuts";

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Radix layers (dialogs, menus, popovers) prevent default on the Esc they consume.
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const shortcut = matchShortcut(event);
      if (!shortcut) return;
      // Esc and the palette stay live so the setting can be turned back on.
      const singleKey = !shortcut.mod && shortcut.key !== "Escape";
      if (singleKey && !useSingleKeyShortcuts.getState().on) return;
      if (!shortcut.inFields && isEditable(event.target)) return;
      const { paletteOpen, shortcutsOpen } = useWorkspace.getState();
      if (!shortcut.overModals && (paletteOpen || shortcutsOpen)) return;
      event.preventDefault();
      shortcut.run(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
