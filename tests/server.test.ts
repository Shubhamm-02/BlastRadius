import zlib from "node:zlib";
import { pack } from "tar-stream";
import type { Driver } from "neo4j-driver";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deterministicExplanation, explainImpact } from "@/lib/explain";
import { fetchRepoFiles, parseRepoInput } from "@/lib/github";
import { ApiError } from "@/lib/http";
import type { ImpactResult } from "@/lib/impact";
import { MemorySlidingWindow } from "@/lib/rateLimit";
import { safeEqual } from "@/lib/secrets";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("MemorySlidingWindow", () => {
  it("allows `max` hits per window per key, then recovers", async () => {
    vi.useFakeTimers();
    const rl = new MemorySlidingWindow(2, 1000);
    expect((await rl.limit("a")).success).toBe(true);
    expect((await rl.limit("a")).success).toBe(true);
    const blocked = await rl.limit("a");
    expect(blocked).toMatchObject({ success: false, remaining: 0 });
    expect((await rl.limit("b")).success).toBe(true); // independent key
    vi.advanceTimersByTime(1001);
    expect((await rl.limit("a")).success).toBe(true);
  });

  it("evicts least-recently-used keys beyond maxKeys", async () => {
    const rl = new MemorySlidingWindow(1, 60_000, 2);
    await rl.limit("a");
    await rl.limit("b");
    await rl.limit("c"); // evicts "a"
    expect((await rl.limit("a")).success).toBe(true);
    expect((await rl.limit("c")).success).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares exactly", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer ab", "Bearer abc")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
    expect(safeEqual("Bearer abd", "Bearer abc")).toBe(false);
  });
});

describe("parseRepoInput", () => {
  it("accepts owner/repo, URLs and tree refs", () => {
    expect(parseRepoInput("pmndrs/zustand")).toEqual({
      owner: "pmndrs",
      repo: "zustand",
      ref: undefined,
    });
    expect(parseRepoInput("https://github.com/a/b.git")).toMatchObject({
      owner: "a",
      repo: "b",
    });
    expect(
      parseRepoInput("github.com/a/b/tree/feat/x".replace(/^/, "https://")),
    ).toMatchObject({ ref: "feat/x" });
  });
  it("rejects junk with a safe ApiError", () => {
    expect(() => parseRepoInput("nope")).toThrow(ApiError);
    expect(() => parseRepoInput("a/b?c")).toThrow(/doesn't look like/);
    expect(() => parseRepoInput("a/b/tree/../../etc")).toThrow(ApiError);
  });
});

async function tarball(entries: Record<string, string>): Promise<Buffer> {
  const p = pack();
  for (const [name, content] of Object.entries(entries))
    p.entry({ name: `top-sha/${name}` }, content);
  p.finalize();
  const chunks: Buffer[] = [];
  for await (const c of p.pipe(zlib.createGzip())) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe("fetchRepoFiles", () => {
  it("rejects repos over the size limit before downloading", async () => {
    vi.stubEnv("GITHUB_MAX_REPO_MB", "10");
    const fetchMock = vi.fn(async () => Response.json({ size: 50 * 1024 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchRepoFiles({ owner: "a", repo: "b" }),
    ).rejects.toMatchObject({
      code: "repo_too_large",
      status: 413,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("streams the tarball and reports files dropped by the byte limit", async () => {
    const big = "x".repeat(5_000_000);
    const gz = await tarball({
      "src/a.ts": big,
      "src/b.ts": big,
      "src/c.ts": big, // pushes past MAX_TOTAL_BYTES (12 MB)
      "node_modules/x/index.js": "skip",
      "src/types.d.ts": "skip",
      "tsconfig.json": "{}",
      "README.md": "skip",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/tarball")
          ? new Response(new Uint8Array(gz))
          : Response.json({ size: 100 }),
      ),
    );
    const { files, stats } = await fetchRepoFiles({ owner: "a", repo: "b" });
    expect(files.map((f) => f.path).sort()).toEqual([
      "src/a.ts",
      "src/b.ts",
      "tsconfig.json",
    ]);
    expect(stats).toMatchObject({
      candidates: 4,
      kept: 3,
      skipped: 1,
      truncated: true,
    });
  });
});

const impact: ImpactResult = {
  target: { id: "a.ts#t", name: "t", file: "a.ts", line: 1 },
  direction: "upstream",
  depth: 6,
  total: 2,
  truncated: false,
  affected: [
    { id: "a.ts#x", name: "x", file: "a.ts", line: 2, hops: 1 },
    { id: "b.ts#y", name: "y", file: "b.ts", line: 3, hops: 2 },
  ],
};

function fakeDriver() {
  const executeQuery = vi.fn(async () => ({ records: [] }));
  return { driver: { executeQuery } as unknown as Driver, executeQuery };
}

function sse(frames: string[], opts: { hang?: boolean } = {}): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const f of frames) c.enqueue(enc.encode(f));
        if (!opts.hang) c.close();
      },
    }),
  );
}

describe("explainImpact", () => {
  it("falls back to a deterministic summary without SARVAM_API_KEY", async () => {
    vi.stubEnv("SARVAM_API_KEY", "");
    const { driver } = fakeDriver();
    const text = await explainImpact(driver, "p", impact);
    expect(text).toBe(deterministicExplanation(impact));
    expect(text).toMatch(
      /affects 2 function\(s\) across 2 file\(s\), 1 of them direct callers: x, y/,
    );
  });

  it("streams content deltas (skipping reasoning) and caches the result", async () => {
    vi.stubEnv("SARVAM_API_KEY", "k");
    const { driver, executeQuery } = fakeDriver();
    const fetchMock = vi.fn(async () =>
      sse([
        'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"  Changing t"}}]}\n',
        '\ndata: {"choices":[{"delta":{"content":" affects x."}}]}\n\ndata: [DONE]\n\n',
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await explainImpact(driver, "p", impact)).toBe(
      "Changing t affects x.",
    );

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.stream).toBe(true);
    expect(body.messages[0].content).toContain("- x (a.ts, 1 hop)");
    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("MERGE (e:Explanation"),
      expect.objectContaining({
        pid: "p",
        fid: "a.ts#t",
        variant: "upstream:6",
        text: "Changing t affects x.",
      }),
    );
  });

  it("uses the deterministic summary when the API times out before answering", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SARVAM_API_KEY", "k");
    const { driver, executeQuery } = fakeDriver();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_, reject) =>
            init.signal!.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      ),
    );
    const pending = explainImpact(driver, "p", impact);
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await pending).toBe(deterministicExplanation(impact));
    expect(executeQuery).not.toHaveBeenCalled();
  });

  it("returns the cached explanation without calling the API", async () => {
    vi.stubEnv("SARVAM_API_KEY", "k");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { driver } = fakeDriver();
    expect(
      await explainImpact(driver, "p", impact, { cached: "from cache" }),
    ).toBe("from cache");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
