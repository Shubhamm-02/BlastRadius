import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/secrets";

/**
 * HTTP Basic auth for /stats. Any username works; the password must match
 * STATS_PASSWORD. Without STATS_PASSWORD the page is disabled (fail closed).
 */
export function middleware(req: NextRequest) {
  const password = process.env.STATS_PASSWORD;
  if (!password) {
    return new NextResponse(
      "Stats are disabled. Set STATS_PASSWORD to enable /stats.",
      {
        status: 503,
      },
    );
  }

  const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(given, password)) return NextResponse.next();
    } catch {
      // malformed base64 → fall through to the challenge
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="BlastRadius stats", charset="UTF-8"',
    },
  });
}

export const config = { matcher: ["/stats", "/stats/:path*"] };
