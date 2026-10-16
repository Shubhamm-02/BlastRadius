import { cn } from "@/lib/cn";

/** Target (red) inside its blast radius (amber rings). */
export function BlastMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4", className)}>
      <circle
        cx="8"
        cy="8"
        r="7.1"
        fill="none"
        strokeWidth="1.2"
        className="stroke-accent/40"
      />
      <circle
        cx="8"
        cy="8"
        r="4.4"
        fill="none"
        strokeWidth="1.2"
        className="stroke-accent"
      />
      <circle cx="8" cy="8" r="1.8" className="fill-danger" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex shrink-0 select-none items-center gap-2">
      <BlastMark />
      <span className="text-sm font-semibold tracking-tight text-text max-sm:sr-only">
        Blast<span className="text-accent-ink">Radius</span>
      </span>
    </div>
  );
}
