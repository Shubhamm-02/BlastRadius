import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-surface-2 px-1 font-sans text-xs font-medium text-text-muted shadow-[inset_0_-1px_0_rgb(var(--border-strong))]",
        className,
      )}
      {...props}
    />
  );
}
