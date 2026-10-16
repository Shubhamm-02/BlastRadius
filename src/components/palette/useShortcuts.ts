"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/state/workspace";
import { isEditable, matchShortcut } from "./shortcuts";

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Radix layers (dialogs, menus, popovers) prevent default on the Esc they consume.
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const shortcut = matchShortcut(event);
      if (!shortcut) return;
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
