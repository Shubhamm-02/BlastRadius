"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { Drawer as Vaul } from "vaul";
import { cn } from "@/lib/cn";

/** Bottom sheet (direction="bottom") or side drawer (direction="right"), backed by vaul. */
export const Drawer = Vaul.Root;
export const DrawerTrigger = Vaul.Trigger;
export const DrawerClose = Vaul.Close;
export const DrawerTitle = Vaul.Title;
export const DrawerDescription = Vaul.Description;

export const DrawerContent = forwardRef<
  ElementRef<typeof Vaul.Content>,
  ComponentPropsWithoutRef<typeof Vaul.Content> & { side?: "bottom" | "right" }
>(({ className, children, side = "bottom", ...props }, ref) => (
  <Vaul.Portal>
    <Vaul.Overlay className="fixed inset-0 z-40 bg-bg/50" />
    <Vaul.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex flex-col border-border bg-surface-1 shadow-overlay outline-none",
        side === "bottom" && "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg border-t",
        side === "right" && "inset-y-0 right-0 w-[min(380px,100vw-48px)] border-l",
        className,
      )}
      {...props}
    >
      {side === "bottom" && (
        <div aria-hidden className="mx-auto mb-1 mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
      )}
      {children}
    </Vaul.Content>
  </Vaul.Portal>
));
DrawerContent.displayName = "DrawerContent";
