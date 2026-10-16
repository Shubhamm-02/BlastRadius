"use client";

import { motion } from "motion/react";
import { useLayoutEffect, useRef, type MutableRefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { ease, DURATION } from "@/lib/motion";
import { useImpact } from "@/state/impact";
import { useProjectData } from "@/state/project";
import { useWorkspace } from "@/state/workspace";
import type { SimNode } from "./scene";

const OFFSET = 14;
const CARD_WIDTH = 240;

/**
 * Card for the node under the pointer. Only follows canvas hovers: rows in the
 * explorer already show the same details, and the node may be off-screen.
 */
export function HoverCard({
  byId,
  canvasHoverRef,
  toScreen,
}: {
  byId: Map<string, SimNode>;
  canvasHoverRef: MutableRefObject<string | null>;
  toScreen: (x: number, y: number) => { x: number; y: number } | null;
}) {
  const hoveredId = useWorkspace((s) => s.hoveredId);
  const id =
    hoveredId && hoveredId === canvasHoverRef.current ? hoveredId : null;
  const node = id ? byId.get(id) : undefined;
  const isTarget = useWorkspace((s) => !!id && s.selectedId === id);
  const hop = useImpact((s) => (id ? s.hopById.get(id) : undefined));
  const degree = useProjectData((s) => (id ? s.degree.get(id) : undefined));
  const anchorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!node || !el) return;
    let frame = 0;
    const place = () => {
      const p =
        node.x !== undefined && node.y !== undefined
          ? toScreen(node.x, node.y)
          : null;
      const bounds = el.parentElement;
      if (p && bounds) {
        const flip = p.x + OFFSET + CARD_WIDTH > bounds.clientWidth - 8;
        const x = flip ? p.x - OFFSET - el.offsetWidth : p.x + OFFSET;
        const y = Math.min(
          Math.max(8, p.y - el.offsetHeight / 2),
          bounds.clientHeight - el.offsetHeight - 8,
        );
        el.style.transform = `translate3d(${Math.round(Math.max(8, x))}px, ${Math.round(y)}px, 0)`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [node, toScreen]);

  if (!node) return null;

  return (
    <div
      ref={anchorRef}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-20 w-60"
    >
      <motion.div
        key={node.id}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={ease(DURATION.fast)}
        className="rounded-md border border-border bg-surface-1 px-3 py-2 shadow-overlay"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 break-all font-mono text-sm font-medium text-text">
            {node.name}
          </span>
          {isTarget ? (
            <Badge tone="danger">Target</Badge>
          ) : hop !== undefined ? (
            <Badge tone="accent">
              {hop} {hop === 1 ? "hop" : "hops"}
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-text-dim">
          {node.file}:{node.line}
        </div>
        <div className="mt-1.5 flex gap-3 text-xs tabular-nums text-text-muted">
          <span>
            <span className="text-text">{degree?.in ?? 0}</span>{" "}
            {degree?.in === 1 ? "caller" : "callers"}
          </span>
          <span>
            <span className="text-text">{degree?.out ?? 0}</span>{" "}
            {degree?.out === 1 ? "callee" : "callees"}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
