import { z } from "zod";

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "payload_too_large"
  | "repo_too_large"
  | "rate_limited"
  | "upstream_error"
  | "no_files"
  | "internal_error";

/** Body of every non-2xx JSON response. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

/**
 * An error whose message is safe to show the client. Anything that isn't an
 * ApiError is reported as a generic internal error.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorBody(code: ErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return Response.json(errorBody(code, message), { status, headers });
}

/** Map an ApiError (or anything else) to a safe error; logs the full error server-side. */
export function toApiError(err: unknown, route: string): ApiError {
  if (err instanceof ApiError) {
    if (err.status >= 500) console.error(`[${route}]`, err);
    return err;
  }
  console.error(`[${route}] unhandled error`, err);
  return new ApiError(
    "internal_error",
    "Something went wrong. Please try again.",
    500,
  );
}

export function handleRouteError(err: unknown, route: string): Response {
  const e = toApiError(err, route);
  return errorResponse(e.code, e.message, e.status, e.headers);
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) =>
      i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message,
    )
    .join("; ");
}

export function parseSearchParams<T extends z.ZodType>(
  schema: T,
  req: Request,
): z.infer<T> {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const r = schema.safeParse(params);
  if (!r.success)
    throw new ApiError("bad_request", describeIssues(r.error), 400);
  return r.data;
}

export async function parseJsonBody<T extends z.ZodType>(
  schema: T,
  req: Request,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("bad_request", "Request body must be valid JSON.", 400);
  }
  const r = schema.safeParse(raw);
  if (!r.success)
    throw new ApiError("bad_request", describeIssues(r.error), 400);
  return r.data;
}

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export const projectIdSchema = z.string().trim().min(1).max(200);
export const functionIdSchema = z.string().min(1).max(2000);
export const anonIdSchema = z.string().max(100).optional();
