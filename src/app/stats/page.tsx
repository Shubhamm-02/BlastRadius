import { RotateCcw, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { ActivityChart } from "@/components/stats/ActivityChart";
import {
  appHref,
  formatTimestamp,
  splitFunctionId,
} from "@/components/stats/format";
import { KPIS, KpiCard, type KpiId } from "@/components/stats/KpiCard";
import { KpiValue } from "@/components/stats/KpiValue";
import { RankedList } from "@/components/stats/RankedList";
import { RecentActivity } from "@/components/stats/RecentActivity";
import { StatsHeader } from "@/components/stats/StatsHeader";
import { Button } from "@/components/ui/button";
import { getUsageStats, type UsageStats } from "./data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Usage",
  robots: { index: false, follow: false },
};

const SOURCE_LABEL: Record<string, string> = {
  github: "GitHub",
  upload: "upload",
  cli: "CLI",
  legacy: "legacy",
};

const count = new Intl.NumberFormat("en-US");

const clock = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

function kpiValues(stats: UsageStats): Record<KpiId, [number, string]> {
  const week = stats.activity.slice(-7);
  const weekly = (key: "ingest" | "impact") =>
    `+${count.format(week.reduce((sum, d) => sum + d[key], 0))} in 7 days`;
  return {
    visitors: [
      stats.visitors,
      `${count.format(stats.visitorsWeek)} active in 7 days`,
    ],
    repos: [stats.ingest, weekly("ingest")],
    functions: [stats.impact, weekly("impact")],
    projects: [
      stats.projects,
      stats.projectsBySource.length
        ? stats.projectsBySource
            .map(
              (s) =>
                `${count.format(s.count)} ${SOURCE_LABEL[s.source] ?? s.source}`,
            )
            .join(" · ")
        : "None stored",
    ],
  };
}

function Dashboard({ stats }: { stats: UsageStats }) {
  const values = kpiValues(stats);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            value={<KpiValue value={values[kpi.id][0]} />}
            detail={
              <span className="truncate" title={values[kpi.id][1]}>
                {values[kpi.id][1]}
              </span>
            }
          />
        ))}
      </div>

      <ActivityChart activity={stats.activity} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RankedList
          title="Top repos"
          tone="info"
          empty="No repos analyzed yet."
          rows={stats.topRepos.map((r) => ({
            id: r.repo,
            label: <span className="text-text">{r.repo}</span>,
            title: r.repo,
            count: r.count,
            href: r.projectId ? appHref(r.projectId) : undefined,
          }))}
        />
        <RankedList
          title="Top functions"
          tone="accent"
          empty="No functions inspected yet."
          rows={stats.topFunctions.map((f) => {
            const { name, file } = splitFunctionId(f.functionId);
            return {
              id: f.functionId,
              label: (
                <>
                  <span className="text-text">{name}</span>
                  {file && <span className="ml-2 text-text-dim">{file}</span>}
                </>
              ),
              title: f.functionId,
              count: f.count,
              href: f.projectId
                ? appHref(f.projectId, f.functionId)
                : undefined,
            };
          })}
        />
      </div>

      <RecentActivity events={stats.recent} now={stats.now} />
    </>
  );
}

function StatsError() {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-md border bg-surface-1 p-5 shadow-raised sm:flex-row sm:items-center"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded border border-danger/30 bg-danger/10 text-danger-ink">
        <TriangleAlert aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-medium">Could not load usage data</h2>
        <p className="mt-0.5 text-sm text-text-muted">
          The usage queries failed. Details are in the server log.
        </p>
      </div>
      {/* A full document load re-runs the queries; a client transition could serve the cached error. */}
      <Button asChild variant="secondary">
        <a href="/stats">
          <RotateCcw aria-hidden />
          Retry
        </a>
      </Button>
    </div>
  );
}

export default async function StatsPage() {
  let stats: UsageStats | null = null;
  try {
    stats = await getUsageStats();
  } catch (err) {
    console.error("[stats] failed to load", err);
  }

  return (
    <div className="relative min-h-dvh">
      <StatsHeader
        status={
          stats && (
            <time
              dateTime={new Date(stats.now).toISOString()}
              title={formatTimestamp(stats.now)}
              className="hidden text-xs tabular-nums text-text-dim sm:block"
            >
              Updated {clock.format(stats.now)} UTC
            </time>
          )
        }
      />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 py-6 sm:px-6 lg:py-8">
        {stats ? <Dashboard stats={stats} /> : <StatsError />}
      </main>
    </div>
  );
}
