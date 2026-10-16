"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/state/workspace";
import { KeyCombo, useModLabel } from "./ShortcutKeys";
import { SHORTCUT_GROUPS, SHORTCUTS, shortcutKeys } from "./shortcuts";

export function ShortcutsSheet() {
  const open = useWorkspace((s) => s.shortcutsOpen);
  const setOpen = useWorkspace((s) => s.setShortcutsOpen);
  const modLabel = useModLabel();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[12vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single-key shortcuts pause while you type in a field.
          </DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin grid max-h-[60vh] gap-x-8 gap-y-5 overflow-y-auto px-5 pb-5 pt-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group} aria-labelledby={`shortcuts-${group}`}>
              <h3
                id={`shortcuts-${group}`}
                className="mb-1.5 text-xs font-medium text-text-dim"
              >
                {group}
              </h3>
              <ul className="divide-y divide-border">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-4 py-2 text-sm text-text-muted"
                  >
                    <span className="min-w-0">{s.label}</span>
                    <KeyCombo keys={shortcutKeys(s, modLabel)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
