"use client";

import { useSyncExternalStore } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cn";
import {
  isMac,
  shortcutById,
  shortcutKeys,
  type ShortcutId,
} from "./shortcuts";

const noSubscribe = () => () => {};

/** "⌘" on Apple platforms, "Ctrl" elsewhere. The server render assumes Ctrl. */
export function useModLabel(): string {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  return mac ? "⌘" : "Ctrl";
}

export function KeyCombo({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}) {
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  );
}

export function ShortcutKeys({
  id,
  className,
}: {
  id: ShortcutId;
  className?: string;
}) {
  const modLabel = useModLabel();
  const shortcut = shortcutById.get(id);
  if (!shortcut) return null;
  return (
    <KeyCombo keys={shortcutKeys(shortcut, modLabel)} className={className} />
  );
}
