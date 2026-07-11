import { getDriver } from "@/lib/neo4j";
import { explainImpact, type Affected } from "@/lib/explain";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const id = url.searchParams.get("id");
  const anonId = url.searchParams.get("anonId") ?? undefined;
  if (!projectId || !id) {
    return Response.json({ error: "missing projectId or id" }, { status: 400 });
  }

  const session = getDriver().session();
  try {
    // Everything that transitively CALLS the target (up to 6 hops) is in the
    // blast radius. This variable-length traversal is the graph-native core.
    const res = await session.run(
      `MATCH (t:Function { projectId: $pid, id: $id })
       OPTIONAL MATCH (t)<-[:CALLS*1..6]-(a:Function { projectId: $pid })
       RETURN t.name AS name,
              collect(DISTINCT { id: a.id, name: a.name, file: a.file }) AS affected`,
      { pid: projectId, id },
    );

    const record = res.records[0];
    if (!record) {
      return Response.json({ error: "function not found" }, { status: 404 });
    }

    const targetName = (record.get("name") as string) ?? id;
    const affected: Affected[] = (record.get("affected") as Affected[]).filter(
      (a) => a && a.id,
    );

    const explanation = await explainImpact(targetName, affected);

    await logEvent(getDriver(), {
      type: "impact",
      anonId,
      functionId: id,
      projectId,
    });

    return Response.json({
      target: targetName,
      affectedIds: affected.map((a) => a.id),
      affected,
      explanation,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    await session.close();
  }
}
