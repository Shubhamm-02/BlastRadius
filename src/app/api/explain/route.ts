import { z } from "zod";
import {
  explainImpactStream,
  explanationSource,
  getCachedExplanation,
} from "@/lib/explain";
import { ApiError, handleRouteError, parseSearchParams } from "@/lib/http";
import { impactQuerySchema, queryImpact } from "@/lib/impact";
import { getDriver } from "@/lib/neo4j";
import { enforceRateLimit, rateLimiters } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Plain-English explanation of a blast radius, streamed as text/plain so the
 * UI can render tokens as they arrive. `stream=0` returns JSON instead.
 * Cached per (project, function, direction, depth) in Neo4j.
 */
export async function GET(req: Request) {
  try {
    await enforceRateLimit(rateLimiters.explain, req);
    const q = parseSearchParams(
      impactQuerySchema.extend({ stream: z.enum(["0", "1"]).default("1") }),
      req,
    );

    const driver = getDriver();
    const impact = await queryImpact(driver, q);
    if (!impact)
      throw new ApiError(
        "not_found",
        "Function not found in this project.",
        404,
      );

    const cached = await getCachedExplanation(driver, q.projectId, impact);
    const source = explanationSource(cached);
    const text = explainImpactStream(driver, q.projectId, impact, {
      cached,
      signal: req.signal,
    });

    if (q.stream === "0") {
      let explanation = "";
      const reader = text.getReader();
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        explanation += r.value;
      }
      return Response.json({ explanation: explanation.trim(), source });
    }

    return new Response(text.pipeThrough(new TextEncoderStream()), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Explanation-Source": source,
      },
    });
  } catch (err) {
    return handleRouteError(err, "api/explain");
  }
}
