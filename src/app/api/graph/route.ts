import { getDriver } from "@/lib/neo4j";

// Never cache — always read the live graph.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = getDriver().session();
  try {
    const nodesRes = await session.run(
      "MATCH (fn:Function) RETURN fn.id AS id, fn.name AS name, fn.file AS file",
    );
    const linksRes = await session.run(
      "MATCH (a:Function)-[:CALLS]->(b:Function) RETURN a.id AS source, b.id AS target",
    );

    const nodes = nodesRes.records.map((r) => ({
      id: r.get("id") as string,
      name: r.get("name") as string,
      file: r.get("file") as string,
    }));
    const links = linksRes.records.map((r) => ({
      source: r.get("source") as string,
      target: r.get("target") as string,
    }));

    return Response.json({ nodes, links });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  } finally {
    await session.close();
  }
}
