"use client";

import { useMemo } from "react";
import { useImpact } from "@/state/impact";
import { affectedNoun, fileCount } from "./blast-radius";

// Mounted outside the side panel and drawers: a collapsed panel is inert and a
// closed drawer is unmounted, either of which would silence the live region.
export function ImpactAnnouncer() {
  const result = useImpact((s) => (s.status === "ready" ? s.result : null));
  const message = useMemo(() => {
    if (!result) return "";
    const files = new Set(result.affected.map((fn) => fn.file)).size;
    return `${result.total} ${affectedNoun(result.direction, result.total)} across ${fileCount(files, result.truncated)}`;
  }, [result]);
  return (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}
