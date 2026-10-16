import dotenv from "dotenv";
import neo4j from "neo4j-driver";
import { SCHEMA_STATEMENTS } from "../src/lib/schema";

// Same files Next reads. dotenv never overwrites a set variable, so .env.local wins.
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

/**
 * One-time (idempotent) schema setup: constraints + indexes, then a backfill
 * of (:Project) nodes for graphs ingested before projects were tracked, so
 * their deep links keep working and the TTL cleanup can see them.
 */
async function main() {
  const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
    console.error(
      "Missing NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD. Add them to .env.local.",
    );
    process.exit(1);
  }

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
    { disableLosslessIntegers: true },
  );
  try {
    for (const stmt of SCHEMA_STATEMENTS) {
      await driver.executeQuery(stmt);
      console.log(`applied: ${stmt}`);
    }
    await driver.executeQuery("CALL db.awaitIndexes(300)");

    const res = await driver.executeQuery(
      `MATCH (f:Function) WHERE f.projectId IS NOT NULL
       WITH DISTINCT f.projectId AS pid
       WHERE NOT EXISTS { MATCH (:Project { id: pid }) }
       CALL (pid) {
         OPTIONAL MATCH (e:Event { type: 'ingest', projectId: pid })
         RETURN e.repo AS repo LIMIT 1
       }
       CALL (pid) { MATCH (n:Function { projectId: pid }) RETURN count(n) AS functions }
       CALL (pid) { MATCH (n:File { projectId: pid }) RETURN count(n) AS files }
       CALL (pid) {
         MATCH (:Function { projectId: pid })-[c:CALLS]->() RETURN count(c) AS calls
       }
       CALL (pid) {
         MATCH (:File { projectId: pid })-[i:IMPORTS]->() RETURN count(i) AS imports
       }
       CREATE (:Project {
         id: pid,
         slug: coalesce(repo, CASE WHEN pid STARTS WITH 'cli-' THEN substring(pid, 4) ELSE pid END),
         source: CASE WHEN pid STARTS WITH 'cli-' THEN 'cli' ELSE 'legacy' END,
         status: 'ready',
         createdAt: $now,
         files: files, functions: functions, imports: imports, calls: calls,
         truncated: false, skippedFiles: 0
       })
       RETURN count(*) AS created`,
      { now: neo4j.int(Date.now()) },
    );
    console.log(
      `Backfilled ${res.records[0]?.get("created") ?? 0} legacy project node(s).`,
    );
  } finally {
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
