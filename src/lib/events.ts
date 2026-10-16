import { waitUntil } from "@vercel/functions";
import neo4j from "neo4j-driver";
import { getDriver } from "@/lib/neo4j";

export interface EventInput {
  type: "ingest" | "impact";
  anonId?: string;
  repo?: string;
  functionId?: string;
  projectId?: string;
}

/**
 * Record a usage event as an (:Event) node without blocking the response.
 * On Vercel, waitUntil keeps the function alive until the write finishes;
 * elsewhere it's a plain fire-and-forget. Analytics must never break the
 * user's request, so all errors are swallowed.
 */
export function logEvent(ev: EventInput): void {
  const write = (async () => {
    try {
      await getDriver().executeQuery(
        `CREATE (e:Event {
           type: $type,
           anonId: $anonId,
           repo: $repo,
           functionId: $functionId,
           projectId: $projectId,
           ts: $ts
         })`,
        {
          type: ev.type,
          anonId: ev.anonId ?? "anon",
          repo: ev.repo ?? null,
          functionId: ev.functionId ?? null,
          projectId: ev.projectId ?? null,
          ts: neo4j.int(Date.now()),
        },
      );
    } catch {
      // telemetry must never affect the response
    }
  })();
  waitUntil(write);
}
