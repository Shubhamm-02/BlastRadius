import { z } from "zod";
import {
  ApiError,
  handleRouteError,
  parseSearchParams,
  projectIdSchema,
} from "@/lib/http";
import { getDriver } from "@/lib/neo4j";
import { isProjectReady } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ projectId: projectIdSchema });

export async function GET(req: Request) {
  try {
    const { projectId } = parseSearchParams(querySchema, req);
    const driver = getDriver();
    if (!(await isProjectReady(driver, projectId))) {
      throw new ApiError(
        "not_found",
        "Project not found. It may have expired.",
        404,
      );
    }

    const [nodesRes, linksRes] = await Promise.all([
      driver.executeQuery(
        `MATCH (fn:Function { projectId: $pid })
         RETURN fn.id AS id, fn.name AS name, fn.file AS file, fn.line AS line`,
        { pid: projectId },
        { routing: "READ" },
      ),
      // One link per caller/callee pair; `kinds` lists how it's used.
      driver.executeQuery(
        `MATCH (a:Function { projectId: $pid })-[r:CALLS]->(b:Function)
         RETURN a.id AS source, b.id AS target,
                collect(DISTINCT coalesce(r.kind, 'call')) AS kinds`,
        { pid: projectId },
        { routing: "READ" },
      ),
    ]);

    const nodes = nodesRes.records.map((r) => ({
      id: r.get("id") as string,
      name: r.get("name") as string,
      file: r.get("file") as string,
      line: r.get("line") as number,
    }));
    const links = linksRes.records.map((r) => ({
      source: r.get("source") as string,
      target: r.get("target") as string,
      kinds: r.get("kinds") as string[],
    }));

    return Response.json({ nodes, links });
  } catch (err) {
    return handleRouteError(err, "api/graph");
  }
}
