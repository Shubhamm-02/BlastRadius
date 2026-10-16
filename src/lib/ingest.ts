import { randomUUID } from "node:crypto";
import {
  analyzeProjectAsync,
  writeGraph,
  type SourceFileInput,
} from "@/lib/analyze";
import { fetchRepoFiles, parseRepoInput } from "@/lib/github";
import { ApiError } from "@/lib/http";
import { getDriver } from "@/lib/neo4j";
import type { ProjectSource, ProjectStats } from "@/lib/projects";

export const MAX_UPLOAD_FILES = 2000;

export type IngestStage =
  "fetch" | "extract" | "parse" | "resolve" | "write" | "done";

export interface IngestProgressEvent {
  stage: Exclude<IngestStage, "done">;
  progress: number; // overall 0..1 across all stages
  detail: string;
}

export interface IngestResult {
  projectId: string;
  slug: string;
  source: ProjectSource;
  stats: ProjectStats;
  /** Some source files were dropped by size/count limits. */
  truncated: boolean;
  files: { kept: number; skipped: number };
}

/** One line of the NDJSON stream from POST /api/ingest. */
export type IngestStreamEvent =
  | IngestProgressEvent
  | { stage: "done"; progress: 1; detail: string; result: IngestResult }
  | { stage: "error"; error: { code: string; message: string } };

export type IngestInput =
  | { kind: "github"; repo: string }
  | {
      kind: "upload";
      files: SourceFileInput[];
      name?: string;
      /** Files the browser already dropped before uploading. */
      clientSkipped?: number;
    };

/** Overall-progress window for each stage. */
const STAGE_SPAN: Record<IngestStage, [number, number]> = {
  fetch: [0, 0.1],
  extract: [0.1, 0.3],
  parse: [0.3, 0.55],
  resolve: [0.55, 0.75],
  write: [0.75, 1],
  done: [1, 1],
};

/**
 * Fetch (or accept uploaded) source, analyze it, and write a new project to
 * Neo4j, reporting progress through `emit`. Shared by the streaming and
 * plain-JSON variants of POST /api/ingest.
 */
export async function runIngest(
  input: IngestInput,
  emit: (e: IngestProgressEvent) => void = () => {},
  signal?: AbortSignal,
): Promise<IngestResult> {
  // Throwing from a progress callback unwinds the analyzer and rolls back
  // the current write transaction; writeGraph then deletes the partial project.
  const report = (
    stage: IngestProgressEvent["stage"],
    within: number,
    detail: string,
  ) => {
    signal?.throwIfAborted();
    const [a, b] = STAGE_SPAN[stage];
    const clamped = Math.min(1, Math.max(0, within));
    emit({
      stage,
      progress: Number((a + (b - a) * clamped).toFixed(3)),
      detail,
    });
  };

  let files: SourceFileInput[];
  let slug: string;
  let source: ProjectSource;
  let skipped = 0;
  let commit: string | undefined;

  if (input.kind === "github") {
    const ref = parseRepoInput(input.repo);
    slug = `${ref.owner}/${ref.repo}${ref.ref ? "@" + ref.ref : ""}`;
    source = "github";
    let extracted = 0;
    const fetched = await fetchRepoFiles(
      ref,
      (stage, detail) => {
        // Extraction has no known total; creep toward the end of its window.
        if (stage === "extract") extracted++;
        report(
          stage,
          stage === "fetch" ? 0.5 : 1 - 1 / (1 + extracted / 10),
          detail,
        );
      },
      signal,
    );
    files = fetched.files;
    skipped = fetched.stats.skipped;
    commit = fetched.stats.commit;
  } else {
    slug = input.name?.trim() || "uploaded";
    source = "upload";
    files = input.files.slice(0, MAX_UPLOAD_FILES);
    skipped = (input.clientSkipped ?? 0) + (input.files.length - files.length);
    report("extract", 1, `Received ${files.length} files`);
  }

  if (!files.some((f) => /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i.test(f.path))) {
    throw new ApiError(
      "no_files",
      "No TypeScript/JavaScript files found.",
      400,
    );
  }

  const result = await analyzeProjectAsync(files, (stage, p, detail) =>
    report(stage, p, detail),
  );

  const projectId = randomUUID();
  const truncated = skipped > 0;
  await writeGraph(
    getDriver(),
    projectId,
    result,
    { slug, source, truncated, skippedFiles: skipped, commit },
    (p, detail) => report("write", p, detail),
  );

  const stats: ProjectStats = {
    files: result.files.length,
    functions: result.funcs.length,
    imports: result.imports.length,
    calls: result.calls.length,
  };
  return {
    projectId,
    slug,
    source,
    stats,
    truncated,
    files: { kept: files.length, skipped },
  };
}
