"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { EdgeKind } from "@/lib/graph-types";

/** Theme tokens resolved to CSS color strings, for canvas painting. */
export interface CanvasPalette {
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  danger: string;
  edge: Record<EdgeKind, string>;
  clusters: string[];
  /** rgba() for a token with alpha, e.g. rgba("accent", 0.4). */
  rgba: (token: string, alpha: number) => string;
}

function readPalette(): CanvasPalette {
  const style = getComputedStyle(document.documentElement);
  const channels = (name: string) =>
    style.getPropertyValue(`--${name}`).trim().split(/\s+/).join(", ");
  const rgb = (name: string) => `rgb(${channels(name)})`;
  return {
    bg: rgb("bg"),
    surface: rgb("surface-2"),
    border: rgb("border-strong"),
    text: rgb("text"),
    textMuted: rgb("text-muted"),
    textDim: rgb("text-dim"),
    accent: rgb("accent"),
    danger: rgb("danger"),
    edge: {
      call: rgb("edge-call"),
      jsx: rgb("edge-jsx"),
      new: rgb("edge-new"),
      ref: rgb("edge-ref"),
    },
    clusters: Array.from({ length: 8 }, (_, i) => rgb(`cluster-${i + 1}`)),
    rgba: (token, alpha) => `rgba(${channels(token)}, ${alpha})`,
  };
}

/** Re-reads the palette whenever the resolved theme changes. Null until mounted. */
export function useCanvasPalette(): CanvasPalette | null {
  const { resolvedTheme } = useTheme();
  const [palette, setPalette] = useState<CanvasPalette | null>(null);
  useEffect(() => {
    setPalette(readPalette());
  }, [resolvedTheme]);
  return palette;
}
