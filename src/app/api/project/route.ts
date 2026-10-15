import { z } from "zod";
import {
  ApiError,
  handleRouteError,
  parseSearchParams,
  projectIdSchema,
} from "@/lib/http";
import { getDriver } from "@/lib/neo4j";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ projectId: projectIdSchema });

/** Slug + stats for a project, so deep links can show context. */
export async function GET(req: Request) {
  try {
    const { projectId } = parseSearchParams(querySchema, req);
    const project = await getProject(getDriver(), projectId);
    if (!project) {
      throw new ApiError(
        "not_found",
        "Project not found. It may have expired.",
        404,
      );
    }
    return Response.json(project);
  } catch (err) {
    return handleRouteError(err, "api/project");
  }
}
