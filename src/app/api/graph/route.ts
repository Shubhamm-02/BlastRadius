import { getDriver } from "@/lib/neo4j";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ nodes: [], links: [] });
  }

  const session = getDriver().session();
  try {
    const nodesRes = await session.run(
      "MATCH (fn:Function { projectId: $pid }) RETURN fn.id AS id, fn.name AS name, fn.file AS file",
      { pid: projectId },
    );
    const linksRes = await session.run(
      `MATCH (a:Function { projectId: $pid })-[:CALLS]->(b:Function { projectId: $pid })
       RETURN a.id AS source, b.id AS target`,
      { pid: projectId },
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
