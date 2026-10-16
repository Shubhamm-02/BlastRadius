import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-xs font-medium leading-5",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-2 text-text-muted",
        accent: "border-accent/30 bg-accent/10 text-accent-ink",
        danger: "border-danger/30 bg-danger/10 text-danger-ink",
        ok: "border-ok/30 bg-ok/10 text-ok",
        info: "border-info/30 bg-info/10 text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
