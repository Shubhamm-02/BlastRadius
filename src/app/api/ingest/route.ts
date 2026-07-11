import { randomUUID } from "node:crypto";
import { getDriver } from "@/lib/neo4j";
import { parseRepoInput, fetchRepoFiles } from "@/lib/github";
import {
  analyzeProject,
  writeGraph,
  type SourceFileInput,
} from "@/lib/analyze";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_UPLOAD_FILES = 2000;

interface IngestBody {
  repo?: string;
  files?: SourceFileInput[];
  name?: string;
  anonId?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as IngestBody;

    let files: SourceFileInput[];
    let slug: string;

    if (Array.isArray(body.files)) {
      // Folder upload from the browser.
      files = body.files
        .filter(
          (f) =>
            f && typeof f.path === "string" && typeof f.content === "string",
        )
        .slice(0, MAX_UPLOAD_FILES);
      slug = body.name?.trim() || "uploaded";
    } else if (body.repo && typeof body.repo === "string") {
      // Public GitHub repo.
      const ref = parseRepoInput(body.repo);
      files = await fetchRepoFiles(ref);
      slug = `${ref.owner}/${ref.repo}${ref.ref ? "@" + ref.ref : ""}`;
    } else {
      return Response.json(
        { error: "Provide a 'repo' string or a 'files' array." },
        { status: 400 },
      );
    }

    if (files.length === 0) {
      return Response.json(
        { error: "No TypeScript/JavaScript files found." },
        { status: 400 },
      );
    }

    const result = analyzeProject(files);
    const projectId = randomUUID();
    await writeGraph(getDriver(), projectId, result);

    await logEvent(getDriver(), {
      type: "ingest",
      anonId: body.anonId,
      repo: slug,
      projectId,
    });

    return Response.json({
      projectId,
      slug,
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
