"use client";

import { Spline } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { EDGE_KINDS, type EdgeKind } from "@/lib/graph-types";
import { useWorkspace } from "@/state/workspace";

const EDGE_SWATCH: Record<EdgeKind, string> = {
  call: "bg-[rgb(var(--edge-call))]",
  jsx: "bg-[rgb(var(--edge-jsx))]",
  new: "bg-[rgb(var(--edge-new))]",
  ref: "bg-[rgb(var(--edge-ref))]",
};

const EDGE_MEANING: Record<EdgeKind, string> = {
  call: "Direct call",
  jsx: "Rendered as JSX",
  new: "Constructed with new",
  ref: "Passed as a reference",
};

function EdgeKey({ kind, detailed }: { kind: EdgeKind; detailed?: boolean }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("h-0.5 w-3 rounded-full", EDGE_SWATCH[kind])} />
      <span className="font-mono text-text">{kind}</span>
      {detailed && <span className="text-text-dim">{EDGE_MEANING[kind]}</span>}
    </li>
  );
}

function NodeKey({ tone, label }: { tone: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", tone)} />
      {label}
    </li>
  );
}

function BlastKeys() {
  const hasSelection = useWorkspace((s) => !!s.selectedId);
  if (!hasSelection) return null;
  return (
    <>
      <NodeKey tone="bg-danger" label="Target" />
      <NodeKey tone="bg-accent" label="Affected" />
    </>
  );
}

export function EdgeLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 md:right-48 [&>*]:pointer-events-auto">
      <ul
        aria-label="Graph legend"
        className="hidden max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-text-muted shadow-raised lg:inline-flex"
      >
        {EDGE_KINDS.map((kind) => (
          <EdgeKey key={kind} kind={kind} />
        ))}
        <BlastKeys />
      </ul>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon-sm" className="lg:hidden" aria-label="Show legend">
            <Spline />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-60 p-2.5">
          <ul className="flex flex-col gap-1.5 text-xs text-text-muted">
            {EDGE_KINDS.map((kind) => (
              <EdgeKey key={kind} kind={kind} detailed />
            ))}
            <BlastKeys />
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
