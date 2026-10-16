import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { RecentEvent } from "@/app/stats/data";
import { formatTimestamp, relativeTime, splitFunctionId } from "./format";
import { Panel } from "./Panel";

const SKELETON_ROWS = 8;

function ActivityTable({ children }: { children: ReactNode }) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead className="sticky top-0 z-10 bg-surface-1 text-left text-xs text-text-dim">
        <tr className="border-b">
          <th scope="col" className="w-20 py-2 pl-4 pr-2 font-normal sm:w-24">
            When
          </th>
          <th
            scope="col"
            className="hidden w-28 px-2 py-2 font-normal sm:table-cell"
          >
            Visitor
          </th>
          <th scope="col" className="w-24 px-2 py-2 font-normal">
            Action
          </th>
          <th scope="col" className="py-2 pl-2 pr-4 font-normal">
            Target
          </th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function EventTarget({ event }: { event: RecentEvent }) {
  if (event.type === "ingest") {
    return <span className="text-text">{event.repo ?? "unknown repo"}</span>;
  }
  if (!event.functionId) return <span className="text-text-dim">unknown</span>;
  const { name, file } = splitFunctionId(event.functionId);
  return (
    <>
      <span className="text-text">{name}</span>
      {file && <span className="ml-2 text-text-dim">{file}</span>}
    </>
  );
}

export function RecentActivity({
  events,
  now,
}: {
  events: RecentEvent[];
  now: number;
}) {
  return (
    <Panel
      title="Recent activity"
      caption={events.length ? `Latest ${events.length}` : undefined}
    >
      {events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-dim">
          No events recorded yet. Analyze a repo in the app to see activity
          here.
        </p>
      ) : (
        <div
          role="region"
          tabIndex={0}
          aria-label="Recent activity"
          className="scrollbar-thin max-h-[28rem] overflow-y-auto rounded-b-md"
        >
          <ActivityTable>
            {events.map((event, i) => (
              <tr
                key={`${event.ts}-${i}`}
                className="border-t border-border/60 transition-colors duration-fast ease-out first:border-t-0 hover:bg-surface-2/60"
              >
                <td className="py-2 pl-4 pr-2 tabular-nums text-text-muted">
                  <time
                    dateTime={new Date(event.ts).toISOString()}
                    title={formatTimestamp(event.ts)}
                  >
                    {relativeTime(event.ts, now)}
                  </time>
                </td>
                <td className="hidden truncate px-2 py-2 font-mono text-xs text-text-dim sm:table-cell">
                  {event.visitor}
                </td>
                <td className="px-2 py-2">
                  <Badge tone={event.type === "ingest" ? "info" : "accent"}>
                    {event.type === "ingest" ? "Analyzed" : "Inspected"}
                  </Badge>
                </td>
                <td
                  className="truncate py-2 pl-2 pr-4 font-mono text-xs"
                  title={
                    event.type === "ingest"
                      ? (event.repo ?? undefined)
                      : (event.functionId ?? undefined)
                  }
                >
                  <EventTarget event={event} />
                </td>
              </tr>
            ))}
          </ActivityTable>
        </div>
      )}
    </Panel>
  );
}

export function RecentActivitySkeleton() {
  return (
    <Panel title="Recent activity">
      <ActivityTable>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <tr key={i} className="border-t border-border/60 first:border-t-0">
            <td className="py-2.5 pl-4 pr-2">
              <Skeleton className="h-3 w-12" />
            </td>
            <td className="hidden px-2 py-2.5 sm:table-cell">
              <Skeleton className="h-3 w-16" />
            </td>
            <td className="px-2 py-2.5">
              <Skeleton className="h-4 w-16" />
            </td>
            <td className="py-2.5 pl-2 pr-4">
              <Skeleton className={cn("h-3", i % 2 ? "w-1/2" : "w-2/3")} />
            </td>
          </tr>
        ))}
      </ActivityTable>
    </Panel>
  );
}
