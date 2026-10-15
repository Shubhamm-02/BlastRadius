import type { Driver } from "neo4j-driver";

/**
 * Constraints and indexes, applied once by `npm run db:migrate`. Every
 * statement is idempotent, so re-running the migration is safe.
 */
export const SCHEMA_STATEMENTS: string[] = [
  // Legacy global-unique constraints conflict with per-project ids.
  "DROP CONSTRAINT file_path IF EXISTS",
  "DROP CONSTRAINT func_id IF EXISTS",

  "CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE",
  "CREATE CONSTRAINT file_key IF NOT EXISTS FOR (f:File) REQUIRE (f.projectId, f.path) IS UNIQUE",
  "CREATE CONSTRAINT func_key IF NOT EXISTS FOR (fn:Function) REQUIRE (fn.projectId, fn.id) IS UNIQUE",
  "CREATE CONSTRAINT explanation_key IF NOT EXISTS FOR (e:Explanation) REQUIRE (e.projectId, e.functionId, e.variant) IS UNIQUE",

  "CREATE INDEX function_project IF NOT EXISTS FOR (n:Function) ON (n.projectId)",
  "CREATE INDEX file_project IF NOT EXISTS FOR (n:File) ON (n.projectId)",
  "CREATE INDEX explanation_project IF NOT EXISTS FOR (n:Explanation) ON (n.projectId)",
  "CREATE INDEX project_created IF NOT EXISTS FOR (n:Project) ON (n.createdAt)",
  "CREATE INDEX event_ts IF NOT EXISTS FOR (n:Event) ON (n.ts)",
  "CREATE INDEX event_type IF NOT EXISTS FOR (n:Event) ON (n.type)",
];

/** Constraints the write path depends on (without them every MATCH is a label scan). */
const REQUIRED_CONSTRAINTS = ["project_id", "file_key", "func_key"];

const globalForSchema = global as unknown as { _schemaChecked?: Promise<void> };

/**
 * Fail fast with an actionable message if `npm run db:migrate` hasn't been
 * run. Checked once per process.
 */
export function assertSchema(driver: Driver): Promise<void> {
  if (!globalForSchema._schemaChecked) {
    globalForSchema._schemaChecked = (async () => {
      const res = await driver.executeQuery(
        "SHOW CONSTRAINTS YIELD name RETURN collect(name) AS names",
        {},
        { routing: "READ" },
      );
      const names = new Set(res.records[0]?.get("names") as string[]);
      const missing = REQUIRED_CONSTRAINTS.filter((n) => !names.has(n));
      if (missing.length) {
        throw new Error(
          `Neo4j schema is missing (${missing.join(", ")}). Run \`npm run db:migrate\` first.`,
        );
      }
    })().catch((err) => {
      globalForSchema._schemaChecked = undefined; // re-check after a fix
      throw err;
    });
  }
  return globalForSchema._schemaChecked;
}
