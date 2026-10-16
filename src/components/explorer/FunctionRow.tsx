"use client";

import { memo, useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { GNode } from "@/lib/graph-types";
import { useWorkspace } from "@/state/workspace";
import { matchMarks } from "./search";

export const ROW_HEIGHT = 44;

export const optionId = (index: number) => `explorer-option-${index}`;

function marked(text: string, positions: number[]): ReactNode {
  if (positions.length === 0) return text;
  const hits = new Set(positions);
  const parts: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i < text.length && hits.has(i) === hits.has(start)) continue;
    const chunk = text.slice(start, i);
    parts.push(
      hits.has(start) ? (
        <mark
          key={start}
          className="bg-transparent font-semibold text-accent-ink"
        >
          {chunk}
        </mark>
      ) : (
        chunk
      ),
    );
    start = i;
  }
  return parts;
}

function describe(
  node: GNode,
  hopDepth: number | undefined,
  isTarget: boolean,
) {
  const parts = [node.name, `${node.file} line ${node.line}`];
  if (isTarget) parts.push("target");
  if (hopDepth !== undefined) {
    parts.push(`${hopDepth === 1 ? "1 hop" : `${hopDepth} hops`} from target`);
  }
  return parts.join(", ");
}

export const FunctionRow = memo(function FunctionRow({
  node,
  index,
  offset,
  query,
  hopDepth,
  isTarget,
  isActive,
  onCommit,
  onHover,
}: {
  node: GNode;
  index: number;
  offset: number;
  query: string;
  hopDepth: number | undefined;
  isTarget: boolean;
  isActive: boolean;
  onCommit: (index: number) => void;
  onHover: (id: string | null) => void;
}) {
  const marks = useMemo(() => matchMarks(node, query), [node, query]);
  const isHovered = useWorkspace((s) => s.hoveredId === node.id);

  return (
    <div
      role="option"
      id={optionId(index)}
      aria-selected={isActive}
      aria-label={describe(node, hopDepth, isTarget)}
      onClick={() => onCommit(index)}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      className={cn(
        "absolute inset-x-1.5 top-0 flex h-11 cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 transition-colors duration-fast ease-out hover:bg-surface-2",
        isHovered && "bg-surface-2",
        isActive && "bg-surface-2 ring-1 ring-inset ring-border-strong",
        isTarget && "bg-surface-3 hover:bg-surface-3",
      )}
      style={{ transform: `translateY(${offset}px)` }}
    >
      {isTarget && (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-danger"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm text-text">
          {marked(node.name, marks.name)}
        </div>
        <div className="flex min-w-0 font-mono text-xs text-text-dim">
          {/* rtl + bdi moves the ellipsis to the start, keeping the file name visible. */}
          <span dir="rtl" className="min-w-0 truncate text-left">
            <bdi>{marked(node.file, marks.file)}</bdi>
          </span>
          <span className="shrink-0 tabular-nums">:{node.line}</span>
        </div>
      </div>
      {hopDepth !== undefined && (
        <Badge
          tone="accent"
          aria-hidden
          className="min-w-5 justify-center px-1 font-mono tabular-nums"
        >
          {hopDepth}
        </Badge>
      )}
    </div>
  );
});
