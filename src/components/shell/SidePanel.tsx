"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import type { PanelId } from "@/state/workspace";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { PANEL_SIZE, usePanelWidth } from "./useShellLayout";

type Side = "left" | "right";

const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

function ResizeHandle({
  panel,
  side,
  label,
  width,
  onResize,
  onDraggingChange,
}: {
  panel: PanelId;
  side: Side;
  label: string;
  width: number;
  onResize(width: number): void;
  onDraggingChange(dragging: boolean): void;
}) {
  const { min, max, initial } = PANEL_SIZE[panel];
  const drag = useRef<{ x: number; width: number } | null>(null);
  // Dragging toward the canvas grows the panel: right for the left panel, left for the right one.
  const growth = side === "left" ? 1 : -1;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width };
    onDraggingChange(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current)
      onResize(drag.current.width + (e.clientX - drag.current.x) * growth);
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    onDraggingChange(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const towardCanvas = side === "left" ? "ArrowRight" : "ArrowLeft";
    const towardEdge = side === "left" ? "ArrowLeft" : "ArrowRight";
    const next =
      e.key === towardCanvas
        ? width + step
        : e.key === towardEdge
          ? width - step
          : e.key === "Home"
            ? min
            : e.key === "End"
              ? max
              : null;
    if (next === null) return;
    e.preventDefault();
    onResize(next);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-controls={`${panel}-panel`}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => onResize(initial)}
      onKeyDown={onKeyDown}
      className={cn(
        "group absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
        side === "left" ? "-right-1" : "-left-1",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 w-px transition-colors duration-fast ease-out group-hover:bg-accent/50 group-focus-visible:w-0.5 group-focus-visible:bg-accent-ink group-active:bg-accent",
          // Sits exactly over the panel's hairline border.
          side === "left" ? "right-1" : "left-1",
        )}
      />
    </div>
  );
}

/**
 * Collapsible, resizable side column. The content keeps its full width and is
 * pinned to the canvas-side edge, so collapsing slides it out instead of
 * reflowing it at every intermediate width.
 */
export function SidePanel({
  panel,
  side,
  label,
  open,
  className,
  children,
}: {
  panel: PanelId;
  side: Side;
  label: string;
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { width, resize, restored } = usePanelWidth(panel);
  const [dragging, setDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Layout effect so a shortcut that opens the panel and then focuses inside
  // it (the "/" search) never finds the content still inert.
  useIsomorphicLayoutEffect(() => {
    if (contentRef.current) contentRef.current.inert = !open;
  }, [open]);

  return (
    <aside
      id={`${panel}-panel`}
      aria-label={label}
      style={{ "--panel-w": `${width}px` } as CSSProperties}
      className={cn(
        "relative h-full shrink-0",
        open ? "w-[var(--panel-w)]" : "w-0",
        restored && !dragging && "transition-[width] duration-base ease-out",
        className,
      )}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          ref={contentRef}
          className={cn(
            "absolute inset-y-0 flex w-[var(--panel-w)] min-h-0 flex-col bg-surface-1",
            side === "left" ? "right-0 border-r" : "left-0 border-l",
          )}
        >
          {children}
        </div>
      </div>
      {open && (
        <ResizeHandle
          panel={panel}
          side={side}
          label={`Resize ${label.toLowerCase()}`}
          width={width}
          onResize={resize}
          onDraggingChange={setDragging}
        />
      )}
    </aside>
  );
}
