import { Wordmark } from "@/components/shell/marks";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

const ROW_WIDTHS = ["w-32", "w-44", "w-28", "w-40", "w-36", "w-24"];

function SkeletonRows({ count, indent }: { count: number; indent?: boolean }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex h-7 items-center gap-2",
            indent && i % 3 !== 0 && "pl-4",
          )}
        >
          <Skeleton className="size-3.5 shrink-0" />
          <Skeleton className={cn("h-3", ROW_WIDTHS[i % ROW_WIDTHS.length])} />
        </div>
      ))}
    </div>
  );
}

// Widths mirror PANEL_SIZE initial values in shell/useShellLayout.ts.
export default function AppLoading() {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b px-3">
        <Wordmark />
        <Skeleton className="h-6 w-40 max-w-[40vw]" />
        <div className="ml-auto flex items-center gap-1">
          <Skeleton className="hidden h-7 w-48 md:block" />
          <Skeleton className="size-7" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[280px] shrink-0 flex-col gap-4 border-r bg-surface-1 p-3 md:flex">
          <Skeleton className="h-8 w-full" />
          <SkeletonRows count={14} indent />
        </aside>

        <main
          aria-busy
          className="relative flex min-w-0 flex-1 items-center justify-center"
        >
          <Skeleton className="absolute left-1/2 top-3 h-9 w-72 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md" />
          <p role="status" className="animate-pulse-soft text-sm text-text-dim">
            Loading workspace
          </p>
        </main>

        <aside className="hidden w-[340px] shrink-0 flex-col gap-5 border-l bg-surface-1 p-4 xl:flex">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
          <SkeletonRows count={8} />
        </aside>
      </div>
    </div>
  );
}
