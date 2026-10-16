import { ActivitySkeleton } from "@/components/stats/ActivityChart";
import { KPIS, KpiCard } from "@/components/stats/KpiCard";
import { RankedListSkeleton } from "@/components/stats/RankedList";
import { RecentActivitySkeleton } from "@/components/stats/RecentActivity";
import { StatsHeader } from "@/components/stats/StatsHeader";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatsLoading() {
  return (
    <div className="relative min-h-dvh">
      <StatsHeader />
      <main
        aria-busy
        className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 py-6 sm:px-6 lg:py-8"
      >
        <p className="sr-only" role="status">
          Loading usage data
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPIS.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              value={<Skeleton className="h-6 w-20" />}
              detail={<Skeleton className="h-3 w-32 max-w-full" />}
            />
          ))}
        </div>
        <ActivitySkeleton />
        <div className="grid gap-4 lg:grid-cols-2">
          <RankedListSkeleton title="Top repos" />
          <RankedListSkeleton title="Top functions" />
        </div>
        <RecentActivitySkeleton />
      </main>
    </div>
  );
}
