import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-8 w-full min-w-0 rounded border border-border bg-surface-1 px-3 text-sm text-text shadow-raised outline-none transition duration-fast ease-out placeholder:text-text-dim hover:border-border-strong",
      "focus-visible:border-accent-ink focus-visible:shadow-[0_0_0_1px_rgb(var(--accent-ink))] focus-visible:ring-0 focus-visible:ring-offset-0",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
