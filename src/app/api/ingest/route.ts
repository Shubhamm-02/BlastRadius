import { z } from "zod";
import { logEvent } from "@/lib/events";
import {
  ApiError,
  anonIdSchema,
  handleRouteError,
  parseJsonBody,
  toApiError,
} from "@/lib/http";
import {
  runIngest,
  type IngestInput,
  type IngestResult,
  type IngestStreamEvent,
} from "@/lib/ingest";
import { enforceRateLimit, rateLimiters } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 5_000_000; // Vercel rejects bodies over ~4.5 MB anyway

const bodySchema = z
  .object({
    repo: z.string().trim().min(1).max(500).optional(),
    files: z
      .array(
        z.object({
          path: z.string().min(1).max(1024),
          content: z.string(),
        }),
      )
      .max(20_000)
      .optional(),
    name: z.string().trim().max(200).optional(),
    /** Files the browser dropped before uploading (size cap). */
    skipped: z.number().int().min(0).max(1_000_000).optional(),
    anonId: anonIdSchema,
  })
  .refine((b) => (b.repo === undefined) !== (b.files === undefined), {
    message: "Provide either a 'repo' string or a 'files' array.",
  });

/**
 * Analyze a GitHub repo or uploaded files into a new project.
 *
 * With `Accept: application/x-ndjson` the response streams one JSON object
 * per line: progress events `{stage, progress, detail}` for fetch → extract →
 * parse → resolve → write, then `{stage: "done", result}` or
 * `{stage: "error", error}`. Otherwise it responds once with the result JSON.
 */
export async function POST(req: Request) {
  try {
    await enforceRateLimit(rateLimiters.ingest, req);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      throw new ApiError(
        "payload_too_large",
        "Upload is too large. Use a GitHub URL or the local CLI for big repos.",
        413,
      );
    }
    const body = await parseJsonBody(bodySchema, req);
    const input: IngestInput = body.files
      ? {
          kind: "upload",
          files: body.files,
          name: body.name,
          clientSkipped: body.skipped,
        }
      : { kind: "github", repo: body.repo! };

    const logIngest = (r: IngestResult) =>
      logEvent({
        type: "ingest",
        anonId: body.anonId,
        repo: r.slug,
        projectId: r.projectId,
      });

    if (!(req.headers.get("accept") ?? "").includes("application/x-ndjson")) {
      const result = await runIngest(input);
      logIngest(result);
      return Response.json(result);
    }

    return new Response(streamIngest(input, logIngest), {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return handleRouteError(err, "api/ingest");
  }
}

function streamIngest(
  input: IngestInput,
  onDone: (r: IngestResult) => void,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let open = true;
  return new ReadableStream<Uint8Array>({
    cancel() {
      open = false; // client went away; the ingest still finishes server-side
    },
    async start(controller) {
      const send = (ev: IngestStreamEvent) => {
        if (open) controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      };
      try {
        const result = await runIngest(input, send);
        onDone(result);
        send({
          stage: "done",
          progress: 1,
          detail: `${result.stats.functions} functions, ${result.stats.calls} edges`,
          result,
        });
      } catch (err) {
        const e = toApiError(err, "api/ingest");
        send({ stage: "error", error: { code: e.code, message: e.message } });
      } finally {
        if (open) controller.close();
      }
    },
  });
}
