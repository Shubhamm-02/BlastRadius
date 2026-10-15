import { errorResponse, handleRouteError } from "@/lib/http";
import { getDriver } from "@/lib/neo4j";
import { deleteExpiredProjects } from "@/lib/projects";
import { safeEqual } from "@/lib/secrets";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEFAULT_TTL_DAYS = 7;

/**
 * Deletes projects older than PROJECT_TTL_DAYS. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET` (see vercel.json).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return errorResponse("unauthorized", "Unauthorized.", 401);
  }

  const raw = Number(process.env.PROJECT_TTL_DAYS);
  const ttlDays = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_DAYS;

  try {
    const result = await deleteExpiredProjects(getDriver(), {
      ttlDays,
      budgetMs: 45_000, // leave headroom under maxDuration
    });
    console.log(
      `[cron/cleanup] deleted ${result.deleted.length} project(s); remaining=${result.remaining}`,
    );
    return Response.json({ ttlDays, ...result });
  } catch (err) {
    return handleRouteError(err, "api/cron/cleanup");
  }
}
