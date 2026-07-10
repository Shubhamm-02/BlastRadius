import { randomUUID } from "node:crypto";
import { getDriver } from "@/lib/neo4j";
import { parseRepoInput, fetchRepoFiles } from "@/lib/github";
import { analyzeProject, writeGraph } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { repo?: string };
    const repo = body.repo;
    if (!repo || typeof repo !== "string") {
      return Response.json({ error: "Missing 'repo'." }, { status: 400 });
    }

    const ref = parseRepoInput(repo);
    const files = await fetchRepoFiles(ref);
    if (files.length === 0) {
      return Response.json(
        { error: "No TypeScript/JavaScript files found in that repo." },
        { status: 400 },
      );
    }

    const result = analyzeProject(files);
    const projectId = randomUUID();
    await writeGraph(getDriver(), projectId, result);

    return Response.json({
      projectId,
      slug: `${ref.owner}/${ref.repo}${ref.ref ? "@" + ref.ref : ""}`,
      stats: {
        files: result.files.length,
        functions: result.funcs.length,
        imports: result.imports.length,
        calls: result.calls.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
