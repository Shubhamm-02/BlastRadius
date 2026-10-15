"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Kbd } from "./kbd";

export const TooltipProvider = TooltipPrimitive.Provider;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 flex items-center gap-2 rounded border border-border bg-surface-1 px-2 py-1 text-xs text-text shadow-overlay",
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

/** Tooltip with an optional shortcut hint, e.g. <Tip label="Fit graph" keys={["F"]}>. */
export function Tip({
  label,
  keys,
  side,
  children,
}: {
  label: ReactNode;
  keys?: string[];
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side}>
        {label}
        {keys && (
          <span className="flex gap-0.5">
            {keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        )}
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
}
