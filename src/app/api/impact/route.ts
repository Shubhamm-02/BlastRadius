import { z } from "zod";
import { explainImpact, getCachedExplanation } from "@/lib/explain";
import { logEvent } from "@/lib/events";
import { ApiError, handleRouteError, parseSearchParams } from "@/lib/http";
import { impactQuerySchema, queryImpact } from "@/lib/impact";
import { getDriver } from "@/lib/neo4j";
import { enforceRateLimit, rateLimiters } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The blast radius of a function. Add `explain=1` to include a (non-streamed)
 * explanation; the UI streams it from /api/explain instead.
 */
export async function GET(req: Request) {
  try {
    await enforceRateLimit(rateLimiters.impact, req);
    const q = parseSearchParams(
      impactQuerySchema.extend({ explain: z.enum(["0", "1"]).default("0") }),
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

    logEvent({
      type: "impact",
      anonId: q.anonId,
      functionId: q.id,
      projectId: q.projectId,
    });

    const explanation =
      q.explain === "1"
        ? await explainImpact(driver, q.projectId, impact, {
            cached: await getCachedExplanation(driver, q.projectId, impact),
            signal: req.signal,
          })
        : undefined;

    return Response.json({ ...impact, explanation });
  } catch (err) {
    return handleRouteError(err, "api/impact");
  }
}
