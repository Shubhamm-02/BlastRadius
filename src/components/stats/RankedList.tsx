import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { Panel } from "./Panel";

export interface RankedRow {
  id: string;
  label: ReactNode;
  title: string;
  count: number;
  href?: string;
}

const count = new Intl.NumberFormat("en-US");
const ROWS = 10;

const BAR_TONE = {
  accent: "bg-accent/15",
  info: "bg-info/15",
};

export function RankedList({
  title,
  tone,
  rows,
  empty,
}: {
  title: string;
  tone: keyof typeof BAR_TONE;
  rows: RankedRow[];
  empty: string;
}) {
  const top = rows[0]?.count ?? 1;
  return (
    <Panel title={title} caption="All time">
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-dim">{empty}</p>
      ) : (
        <ol className="p-2">
          {rows.map((row, i) => {
            const body = (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1 left-0 rounded-sm",
                    BAR_TONE[tone],
                  )}
                  style={{ width: `${Math.max(2, (row.count / top) * 100)}%` }}
                />
                <span className="relative w-5 shrink-0 text-xs tabular-nums text-text-dim">
                  {i + 1}
                </span>
                <span className="relative min-w-0 flex-1 truncate font-mono text-xs">
                  {row.label}
                </span>
                <span className="relative tabular-nums text-text-muted">
                  {count.format(row.count)}
                </span>
                <ArrowUpRight
                  aria-hidden
                  className={cn(
                    "relative -mr-0.5 size-3.5 shrink-0 text-text-dim transition-opacity duration-fast ease-out",
                    row.href
                      ? "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"
                      : "invisible",
                  )}
                />
              </>
            );
            const rowClass =
              "group relative flex h-8 items-center gap-2 rounded-sm px-2 text-sm";
            return (
              <li key={row.id} title={row.title}>
                {row.href ? (
                  <Link
                    href={row.href}
                    className={cn(
                      rowClass,
                      "transition-colors duration-fast ease-out hover:bg-surface-2",
                    )}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function RankedListSkeleton({ title }: { title: string }) {
  return (
    <Panel title={title} caption="All time">
      <div className="p-2">
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="flex h-8 items-center gap-2 px-2">
            <Skeleton className="h-3 w-3" />
            <Skeleton
              className={cn("h-3", ["w-2/3", "w-1/2", "w-3/5", "w-2/5"][i % 4])}
            />
            <Skeleton className="ml-auto h-3 w-6" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
