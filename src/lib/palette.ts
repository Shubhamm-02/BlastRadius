"use client";

import { useEffect, useState } from "react";

/** Theme tokens resolved to CSS color strings, for canvas painting. */
export interface CanvasPalette {
  rgba: (token: string, alpha: number) => string;
}

function readPalette(): CanvasPalette {
  const style = getComputedStyle(document.documentElement);
  const channels = (name: string) =>
    style.getPropertyValue(`--${name}`).trim().split(/\s+/).join(", ");
  return { rgba: (token, alpha) => `rgba(${channels(token)}, ${alpha})` };
}

/**
 * Re-reads the palette when the root theme class changes. Null until mounted.
 * Observing the class instead of next-themes' resolvedTheme matters because
 * next-themes applies the class in its own effect, after child effects run.
 */
export function useCanvasPalette(): CanvasPalette | null {
  const [palette, setPalette] = useState<CanvasPalette | null>(null);
  useEffect(() => {
    setPalette(readPalette());
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return palette;
}
