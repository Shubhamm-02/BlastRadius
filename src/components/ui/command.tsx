"use client";

import { Command as Cmdk } from "cmdk";
import { Search } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/cn";

export const Command = forwardRef<ElementRef<typeof Cmdk>, ComponentPropsWithoutRef<typeof Cmdk>>(
  ({ className, ...props }, ref) => (
    <Cmdk ref={ref} className={cn("flex h-full w-full flex-col overflow-hidden text-text", className)} {...props} />
  ),
);
Command.displayName = "Command";

export const CommandInput = forwardRef<
  ElementRef<typeof Cmdk.Input>,
  ComponentPropsWithoutRef<typeof Cmdk.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center gap-2 border-b border-border px-4">
    <Search className="size-4 shrink-0 text-text-dim" aria-hidden />
    <Cmdk.Input
      ref={ref}
      className={cn("h-12 w-full bg-transparent text-base text-text outline-none placeholder:text-text-dim", className)}
      {...props}
    />
  </div>
));
CommandInput.displayName = "CommandInput";

export const CommandList = forwardRef<ElementRef<typeof Cmdk.List>, ComponentPropsWithoutRef<typeof Cmdk.List>>(
  ({ className, ...props }, ref) => (
    <Cmdk.List
      ref={ref}
      className={cn("scrollbar-thin max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain p-1.5", className)}
      {...props}
    />
  ),
);
CommandList.displayName = "CommandList";

export const CommandEmpty = forwardRef<ElementRef<typeof Cmdk.Empty>, ComponentPropsWithoutRef<typeof Cmdk.Empty>>(
  (props, ref) => <Cmdk.Empty ref={ref} className="px-3 py-8 text-center text-sm text-text-dim" {...props} />,
);
CommandEmpty.displayName = "CommandEmpty";

export const CommandGroup = forwardRef<ElementRef<typeof Cmdk.Group>, ComponentPropsWithoutRef<typeof Cmdk.Group>>(
  ({ className, ...props }, ref) => (
    <Cmdk.Group
      ref={ref}
      className={cn(
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-dim",
        className,
      )}
      {...props}
    />
  ),
);
CommandGroup.displayName = "CommandGroup";

export const CommandItem = forwardRef<ElementRef<typeof Cmdk.Item>, ComponentPropsWithoutRef<typeof Cmdk.Item>>(
  ({ className, ...props }, ref) => (
    <Cmdk.Item
      ref={ref}
      className={cn(
        "flex cursor-default select-none items-center gap-2.5 rounded px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-surface-3 data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-dim",
        className,
      )}
      {...props}
    />
  ),
);
CommandItem.displayName = "CommandItem";

export const CommandSeparator = forwardRef<
  ElementRef<typeof Cmdk.Separator>,
  ComponentPropsWithoutRef<typeof Cmdk.Separator>
>(({ className, ...props }, ref) => (
  <Cmdk.Separator ref={ref} className={cn("-mx-1.5 my-1 h-px bg-border", className)} {...props} />
));
CommandSeparator.displayName = "CommandSeparator";
