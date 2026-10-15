import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("shimmer rounded-sm bg-surface-2", className)}
      {...props}
    />
  );
}
