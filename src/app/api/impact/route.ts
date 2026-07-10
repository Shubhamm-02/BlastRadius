import { getDriver } from "@/lib/neo4j";
import { explainImpact, type Affected } from "@/lib/explain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const session = getDriver().session();
  try {
    // Everything that transitively CALLS the target (up to 6 hops) is in the
    // blast radius of changing it. This variable-length traversal is the
    // graph-native core — awkward-to-impossible in plain SQL.
    const res = await session.run(
      `MATCH (t:Function {id: $id})
       OPTIONAL MATCH (t)<-[:CALLS*1..6]-(a:Function)
       RETURN t.name AS name,
              collect(DISTINCT { id: a.id, name: a.name, file: a.file }) AS affected`,
      { id },
    );

    const record = res.records[0];
    if (!record) {
      return Response.json({ error: "function not found" }, { status: 404 });
    }

    const targetName = (record.get("name") as string) ?? id;
    const affected: Affected[] = (
      record.get("affected") as Affected[]
    ).filter((a) => a && a.id);

    const explanation = await explainImpact(targetName, affected);

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
