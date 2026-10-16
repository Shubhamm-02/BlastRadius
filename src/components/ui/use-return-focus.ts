import { useRef } from "react";

type AutoFocusHandler = ((event: Event) => void) | undefined;

/**
 * Our dialogs and drawers open from store state, not a Radix Trigger, so
 * Radix has no trigger to refocus and its close handler also cancels the
 * FocusScope fallback. This remembers the opener and returns focus to it,
 * unless focus already moved somewhere else (a click outside a non-modal drawer).
 */
export function useReturnFocus(
  onOpenAutoFocus: AutoFocusHandler,
  onCloseAutoFocus: AutoFocusHandler,
) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      opener.current = document.activeElement as HTMLElement | null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented || !opener.current?.isConnected) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      event.preventDefault();
      opener.current.focus();
    },
  };
}
