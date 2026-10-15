import { ApiError, clientIp } from "./http";

/** Same shape as `@upstash/ratelimit`'s result, so it can be swapped in. */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms when the oldest request leaves the window
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

/**
 * In-memory sliding-window log. State is per server instance, so on
 * serverless this is a per-instance best effort; swap in a shared store
 * (e.g. Upstash) by implementing RateLimiter.
 */
export class MemorySlidingWindow implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  async limit(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    const success = recent.length < this.max;
    if (success) recent.push(now);

    // Re-insert so Map order is least-recently-used first, then evict.
    this.hits.delete(key);
    this.hits.set(key, recent);
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }

    return {
      success,
      limit: this.max,
      remaining: Math.max(0, this.max - recent.length),
      reset: (recent[0] ?? now) + this.windowMs,
    };
  }
}

function perMinute(envVar: string, fallback: number): number {
  const n = Number(process.env[envVar]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const globalForLimits = global as unknown as {
  _rateLimiters?: Record<"ingest" | "impact" | "explain", RateLimiter>;
};

/** Shared across hot reloads in dev, like the Neo4j driver. */
export const rateLimiters = (globalForLimits._rateLimiters ??= {
  ingest: new MemorySlidingWindow(
    perMinute("RATE_LIMIT_INGEST_PER_MIN", 5),
    60_000,
  ),
  impact: new MemorySlidingWindow(
    perMinute("RATE_LIMIT_IMPACT_PER_MIN", 60),
    60_000,
  ),
  explain: new MemorySlidingWindow(
    perMinute("RATE_LIMIT_EXPLAIN_PER_MIN", 20),
    60_000,
  ),
});

/** Throws a 429 ApiError (with Retry-After) when the caller's IP is over the limit. */
export async function enforceRateLimit(
  limiter: RateLimiter,
  req: Request,
): Promise<void> {
  const r = await limiter.limit(clientIp(req));
  if (!r.success) {
    const retryAfter = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
    throw new ApiError(
      "rate_limited",
      `Too many requests. Try again in ${retryAfter}s.`,
      429,
      {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(r.limit),
        "X-RateLimit-Remaining": "0",
      },
    );
  }
}
