import neo4j, { type Driver } from "neo4j-driver";

export interface EventInput {
  type: "ingest" | "impact";
  anonId?: string;
  repo?: string;
  functionId?: string;
  projectId?: string;
}

/**
 * Record a usage event as an (:Event) node. Analytics must never break the
 * user's request, so all errors are swallowed.
 */
export async function logEvent(driver: Driver, ev: EventInput): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
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
    // ignore — never let telemetry affect the response
  } finally {
    await session.close();
  }
}
