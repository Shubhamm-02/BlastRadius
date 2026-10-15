import neo4j, { type Driver } from "neo4j-driver";
import { z } from "zod";
import {
  DEPTH_DEFAULT,
  DEPTH_MAX,
  DEPTH_MIN,
  IMPACT_LIMIT,
} from "@/lib/constants";
import { anonIdSchema, functionIdSchema, projectIdSchema } from "@/lib/http";

export { DEPTH_DEFAULT, DEPTH_MAX, DEPTH_MIN, IMPACT_LIMIT };

export type Direction = "upstream" | "downstream";

/** Query params shared by /api/impact and /api/explain. */
export const impactQuerySchema = z.object({
  projectId: projectIdSchema,
  id: functionIdSchema,
  depth: z.coerce
    .number()
    .int()
    .min(DEPTH_MIN)
    .max(DEPTH_MAX)
    .default(DEPTH_DEFAULT),
  direction: z.enum(["upstream", "downstream"]).default("upstream"),
  anonId: anonIdSchema,
});

export interface FunctionRef {
  id: string;
  name: string;
  file: string;
  line: number;
}

export interface AffectedFunction extends FunctionRef {
  hops: number; // minimum number of CALLS edges from the target
}

export interface ImpactResult {
  target: FunctionRef;
  direction: Direction;
  depth: number;
  affected: AffectedFunction[]; // sorted by hops, capped at IMPACT_LIMIT
  total: number; // before the cap
  truncated: boolean;
}

/**
 * The blast radius: every function reachable over CALLS edges within `depth`
 * hops, with its minimum hop distance. `upstream` follows callers (what breaks
 * if the target changes); `downstream` follows callees (what the target
 * depends on).
 *
 * `ANY SHORTEST` keeps one shortest path per reachable function, so the
 * traversal is a BFS instead of enumerating every path (Neo4j 5.21+ / AuraDB).
 *
 * Returns null if the project or function doesn't exist.
 */
export async function queryImpact(
  driver: Driver,
  p: { projectId: string; id: string; depth: number; direction: Direction },
): Promise<ImpactResult | null> {
  // Variable-length bounds can't be parameters; clamp before interpolating.
  const depth = Math.min(DEPTH_MAX, Math.max(DEPTH_MIN, Math.trunc(p.depth)));
  const pattern =
    p.direction === "downstream"
      ? `(t)-[:CALLS]->{1,${depth}}(a:Function)`
      : `(t)<-[:CALLS]-{1,${depth}}(a:Function)`;

  const res = await driver.executeQuery(
    `MATCH (:Project { id: $pid, status: 'ready' })
     MATCH (t:Function { projectId: $pid, id: $id })
     CALL (t) {
       MATCH path = ANY SHORTEST ${pattern}
       WHERE a <> t
       WITH a, length(path) AS hops
       ORDER BY hops, a.file, a.name
       RETURN collect(a { .id, .name, .file, .line, hops: hops }) AS reached
     }
     RETURN t { .id, .name, .file, .line } AS target,
            size(reached) AS total,
            reached[0..$limit] AS affected`,
    { pid: p.projectId, id: p.id, limit: neo4j.int(IMPACT_LIMIT) },
    { routing: "READ" },
  );

  const rec = res.records[0];
  if (!rec) return null;
  const total = rec.get("total") as number;
  return {
    target: rec.get("target") as FunctionRef,
    direction: p.direction,
    depth,
    affected: rec.get("affected") as AffectedFunction[],
    total,
    truncated: total > IMPACT_LIMIT,
  };
}
