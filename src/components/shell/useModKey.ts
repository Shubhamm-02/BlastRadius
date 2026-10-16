"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

const platformMod = () =>
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
    ? "⌘"
    : "Ctrl";

/** "⌘" on Apple platforms, "Ctrl" elsewhere, null until hydrated. */
export function useModKey(): string | null {
  return useSyncExternalStore(subscribe, platformMod, () => null);
}
