import { createHash } from "node:crypto";
import { getDriver } from "@/lib/neo4j";

const ACTIVITY_DAYS = 30;
const DAY_MS = 86_400_000;

export interface DailyActivity {
  day: number;
  ingest: number;
  impact: number;
}

export interface RankedRepo {
  repo: string;
  count: number;
  projectId: string | null;
}

export interface RankedFunction {
  functionId: string;
  count: number;
  projectId: string | null;
}

export interface RecentEvent {
  type: "ingest" | "impact";
  repo: string | null;
  functionId: string | null;
  visitor: string;
  ts: number;
}

export interface UsageStats {
  now: number;
  visitors: number;
  visitorsWeek: number;
  ingest: number;
  impact: number;
  projects: number;
  projectsBySource: { source: string; count: number }[];
  activity: DailyActivity[];
  topRepos: RankedRepo[];
  topFunctions: RankedFunction[];
  recent: RecentEvent[];
}

const read = (query: string, params: Record<string, unknown> = {}) =>
  getDriver().executeQuery(query, params, { routing: "READ" });

export async function getUsageStats(): Promise<UsageStats> {
  const now = Date.now();
  const firstDay = Math.floor(now / DAY_MS) - (ACTIVITY_DAYS - 1);

  // executeQuery borrows its own session per call, so these can run together.
  const [totals, visitors, projects, daily, topRepos, topFunctions, recent] =
    await Promise.all([
      read("MATCH (e:Event) RETURN e.type AS type, count(*) AS c"),
      read(
        `MATCH (e:Event)
         RETURN count(DISTINCT e.anonId) AS total,
                count(DISTINCT CASE WHEN e.ts >= $weekAgo THEN e.anonId END) AS week`,
        { weekAgo: now - 7 * DAY_MS },
      ),
      read(
        "MATCH (p:Project) RETURN coalesce(p.source, 'legacy') AS source, count(*) AS c ORDER BY c DESC",
      ),
      // Integer division of epoch ms buckets events by UTC day.
      read(
        `MATCH (e:Event) WHERE e.ts >= $since
         RETURN e.ts / 86400000 AS day, e.type AS type, count(*) AS c`,
        { since: firstDay * DAY_MS },
      ),
      read(
        `MATCH (e:Event {type: 'ingest'}) WHERE e.repo IS NOT NULL
         WITH e ORDER BY e.ts DESC
         WITH e.repo AS repo, count(*) AS c, collect(e.projectId)[0] AS pid
         ORDER BY c DESC, repo LIMIT 10
         OPTIONAL MATCH (p:Project {id: pid}) WHERE p.status = 'ready'
         RETURN repo, c, p.id AS projectId
         ORDER BY c DESC, repo`,
      ),
      read(
        `MATCH (e:Event {type: 'impact'}) WHERE e.functionId IS NOT NULL
         WITH e ORDER BY e.ts DESC
         WITH e.functionId AS fn, count(*) AS c, collect(e.projectId)[0] AS pid
         ORDER BY c DESC, fn LIMIT 10
         OPTIONAL MATCH (p:Project {id: pid}) WHERE p.status = 'ready'
         RETURN fn, c, p.id AS projectId
         ORDER BY c DESC, fn`,
      ),
      read(
        `MATCH (e:Event)
         RETURN e.type AS type, e.repo AS repo, e.functionId AS fn,
                e.anonId AS anon, e.ts AS ts
         ORDER BY e.ts DESC LIMIT 50`,
      ),
    ]);

  const counts: Record<string, number> = {};
  for (const r of totals.records) counts[r.get("type")] = Number(r.get("c"));

  const activity: DailyActivity[] = Array.from(
    { length: ACTIVITY_DAYS },
    (_, i) => ({ day: (firstDay + i) * DAY_MS, ingest: 0, impact: 0 }),
  );
  for (const r of daily.records) {
    const bucket = activity[Math.floor(Number(r.get("day"))) - firstDay];
    const type: unknown = r.get("type");
    if (bucket && (type === "ingest" || type === "impact")) {
      bucket[type] += Number(r.get("c"));
    }
  }

  const projectsBySource = projects.records.map((r) => ({
    source: String(r.get("source")),
    count: Number(r.get("c")),
  }));

  return {
    now,
    visitors: Number(visitors.records[0]?.get("total") ?? 0),
    visitorsWeek: Number(visitors.records[0]?.get("week") ?? 0),
    ingest: counts.ingest ?? 0,
    impact: counts.impact ?? 0,
    projects: projectsBySource.reduce((sum, s) => sum + s.count, 0),
    projectsBySource,
    activity,
    topRepos: topRepos.records.map((r) => ({
      repo: r.get("repo"),
      count: Number(r.get("c")),
      projectId: r.get("projectId"),
    })),
    topFunctions: topFunctions.records.map((r) => ({
      functionId: r.get("fn"),
      count: Number(r.get("c")),
      projectId: r.get("projectId"),
    })),
    recent: recent.records.map((r) => ({
      type: r.get("type") === "ingest" ? "ingest" : "impact",
      repo: r.get("repo"),
      functionId: r.get("fn"),
      visitor: visitorLabel(r.get("anon")),
      ts: Number(r.get("ts")),
    })),
  };
}

/**
 * A stable pseudonym for a visitor. The raw anonId never leaves the server;
 * a truncated one-way hash still shows repeat visits.
 */
function visitorLabel(anonId: string | null): string {
  if (!anonId || anonId === "anon") return "anonymous";
  return "v-" + createHash("sha256").update(anonId).digest("hex").slice(0, 6);
}
