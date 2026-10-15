import neo4j, { type Driver } from "neo4j-driver";

export type ProjectSource = "github" | "upload" | "cli" | "legacy";

export interface ProjectStats {
  files: number;
  functions: number;
  imports: number;
  calls: number;
}

export interface ProjectInfo {
  id: string;
  slug: string;
  source: ProjectSource;
  createdAt: number; // epoch ms
  stats: ProjectStats;
  truncated: boolean;
  skippedFiles: number;
}

/** Per-project node labels, deleted children-first so the Project node goes last. */
const PROJECT_LABELS = ["Explanation", "Function", "File"] as const;

/**
 * Delete a project's graph without touching other projects. Uses labelled,
 * index-backed matches and batches deletes so huge projects don't blow the
 * transaction memory limit. Must run outside an explicit transaction.
 */
export async function deleteProjectData(
  driver: Driver,
  projectId: string,
): Promise<void> {
  const session = driver.session();
  try {
    for (const label of PROJECT_LABELS) {
      await session.run(
        `MATCH (n:${label} { projectId: $pid })
         CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 2000 ROWS`,
        { pid: projectId },
      );
    }
  } finally {
    await session.close();
  }
}

export async function deleteProject(
  driver: Driver,
  projectId: string,
): Promise<void> {
  await deleteProjectData(driver, projectId);
  await driver.executeQuery("MATCH (p:Project { id: $pid }) DETACH DELETE p", {
    pid: projectId,
  });
}

/** A project that has finished writing, or null. */
export async function getProject(
  driver: Driver,
  projectId: string,
): Promise<ProjectInfo | null> {
  const res = await driver.executeQuery(
    `MATCH (p:Project { id: $pid }) WHERE p.status = 'ready'
     RETURN p { .* } AS p`,
    { pid: projectId },
    { routing: "READ" },
  );
  const p = res.records[0]?.get("p") as Record<string, unknown> | undefined;
  if (!p) return null;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    id: String(p.id),
    slug: String(p.slug ?? p.id),
    source: (p.source as ProjectSource) ?? "legacy",
    createdAt: num(p.createdAt),
    stats: {
      files: num(p.files),
      functions: num(p.functions),
      imports: num(p.imports),
      calls: num(p.calls),
    },
    truncated: p.truncated === true,
    skippedFiles: num(p.skippedFiles),
  };
}

/** Whether a project exists and has finished writing. */
export async function isProjectReady(
  driver: Driver,
  projectId: string,
): Promise<boolean> {
  const res = await driver.executeQuery(
    "MATCH (p:Project { id: $pid }) WHERE p.status = 'ready' RETURN count(p) > 0 AS ok",
    { pid: projectId },
    { routing: "READ" },
  );
  return res.records[0]?.get("ok") === true;
}

/** Abandoned writes (crashed ingest) are swept after this long. */
const STALE_WRITE_MS = 60 * 60 * 1000;

/**
 * Delete projects older than `ttlDays`, plus any write that never finished.
 * Stops early when the time budget runs out; the next run picks up the rest.
 */
export async function deleteExpiredProjects(
  driver: Driver,
  opts: { ttlDays: number; budgetMs: number; maxProjects?: number },
): Promise<{ deleted: string[]; remaining: boolean }> {
  const started = Date.now();
  const max = opts.maxProjects ?? 50;
  const res = await driver.executeQuery(
    `MATCH (p:Project)
     WHERE p.createdAt < $cutoff
        OR (p.status <> 'ready' AND p.createdAt < $staleCutoff)
     RETURN p.id AS id
     ORDER BY p.createdAt
     LIMIT $limit`,
    {
      cutoff: neo4j.int(started - opts.ttlDays * 24 * 60 * 60 * 1000),
      staleCutoff: neo4j.int(started - STALE_WRITE_MS),
      limit: neo4j.int(max + 1),
    },
  );
  const ids = res.records.map((r) => r.get("id") as string);
  const deleted: string[] = [];
  for (const id of ids.slice(0, max)) {
    if (Date.now() - started > opts.budgetMs) break;
    await deleteProject(driver, id);
    deleted.push(id);
  }
  return { deleted, remaining: ids.length > deleted.length };
}
