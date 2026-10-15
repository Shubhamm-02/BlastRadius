import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { extract } from "tar-stream";
import type { SourceFileInput } from "@/lib/analyze";
import { ApiError } from "@/lib/http";

const CODE_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;
const CONFIG_RE = /(^|\/)(tsconfig|jsconfig)[^/]*\.json$/i;
const SKIP_DIR =
  /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|\.git)\//;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9_./-]{1,250}$/;

export const MAX_FILES = 2000;
export const MAX_TOTAL_BYTES = 12_000_000; // ~12 MB of source
const DEFAULT_MAX_REPO_MB = 250;

export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
}

/** What was kept vs. dropped while extracting, reported back to the client. */
export interface FetchStats {
  candidates: number; // code/config files seen in the tarball
  kept: number;
  skipped: number; // dropped by MAX_FILES / MAX_TOTAL_BYTES
  bytes: number; // bytes of source kept
  truncated: boolean;
}

export type FetchProgress = (
  stage: "fetch" | "extract",
  detail: string,
) => void;

/** Accepts "owner/repo", a full github.com URL, or an owner/repo/tree/branch URL. */
export function parseRepoInput(input: string): RepoRef {
  let s = input.trim();
  s = s.replace(/^git\+/, "");
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.replace(/\.git$/i, "");
  s = s.replace(/\/+$/, "");

  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new ApiError(
      "bad_request",
      "Enter a repo as 'owner/repo' or a GitHub URL.",
      400,
    );
  }
  const [owner, repo] = parts;
  let ref: string | undefined;
  if (parts[2] === "tree" && parts[3]) {
    ref = parts.slice(3).join("/"); // branch names can contain slashes
  }
  if (
    !NAME_RE.test(owner) ||
    !NAME_RE.test(repo) ||
    (ref !== undefined && (!REF_RE.test(ref) || ref.includes("..")))
  ) {
    throw new ApiError(
      "bad_request",
      "That doesn't look like a GitHub repo.",
      400,
    );
  }
  return { owner, repo, ref };
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "BlastRadius",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function githubError(status: number, owner: string, repo: string): ApiError {
  if (status === 404) {
    return new ApiError(
      "not_found",
      `Repo not found (or private): ${owner}/${repo}. Set GITHUB_TOKEN for private repos.`,
      404,
    );
  }
  if (status === 403 || status === 429) {
    return new ApiError(
      "rate_limited",
      "GitHub rate limit hit. Set a GITHUB_TOKEN env var and try again.",
      429,
    );
  }
  return new ApiError(
    "upstream_error",
    `GitHub request failed (${status}).`,
    502,
  );
}

function maxRepoMb(): number {
  const n = Number(process.env.GITHUB_MAX_REPO_MB);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_REPO_MB;
}

/**
 * Check the repo's size via the GitHub API, then stream its tarball through
 * gunzip + untar, keeping TS/JS source files in memory.
 */
export async function fetchRepoFiles(
  { owner, repo, ref }: RepoRef,
  onProgress?: FetchProgress,
): Promise<{ files: SourceFileInput[]; stats: FetchStats }> {
  const headers = githubHeaders();
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  onProgress?.("fetch", `Checking ${owner}/${repo}`);
  const meta = await fetch(base, { headers });
  if (!meta.ok) throw githubError(meta.status, owner, repo);
  const info = (await meta.json()) as { size?: number };
  // `size` is in KB and includes git history, so it over-estimates the tarball.
  const sizeMb = (info.size ?? 0) / 1024;
  const limitMb = maxRepoMb();
  if (sizeMb > limitMb) {
    throw new ApiError(
      "repo_too_large",
      `${owner}/${repo} is ~${Math.round(sizeMb)} MB; the hosted limit is ${limitMb} MB. Use the local CLI (npm run ingest) for large repos.`,
      413,
    );
  }

  onProgress?.(
    "fetch",
    `Downloading ${owner}/${repo} (~${Math.max(1, Math.round(sizeMb))} MB)`,
  );
  const url = ref ? `${base}/tarball/${ref}` : `${base}/tarball`;
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok || !res.body) throw githubError(res.status, owner, repo);

  return extractCodeFiles(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    onProgress,
  );
}

async function extractCodeFiles(
  gz: Readable,
  onProgress?: FetchProgress,
): Promise<{ files: SourceFileInput[]; stats: FetchStats }> {
  const files: SourceFileInput[] = [];
  const stats: FetchStats = {
    candidates: 0,
    kept: 0,
    skipped: 0,
    bytes: 0,
    truncated: false,
  };
  let lastReport = 0;

  const ex = extract();
  ex.on("entry", (header, stream, next) => {
    // Tarball entries are prefixed with a top-level "owner-repo-sha/" dir.
    const rel = header.name.split("/").slice(1).join("/");
    const isCode = CODE_EXT.test(rel) && !rel.endsWith(".d.ts");
    const isConfig = CONFIG_RE.test(rel); // for path-alias resolution
    const wanted =
      header.type === "file" && (isCode || isConfig) && !SKIP_DIR.test(rel);
    if (wanted) stats.candidates++;

    const size = header.size ?? 0;
    const fits =
      files.length < MAX_FILES && stats.bytes + size <= MAX_TOTAL_BYTES;
    if (!wanted || !fits) {
      if (wanted) {
        stats.skipped++;
        stats.truncated = true;
      }
      stream.on("end", next);
      stream.resume();
      return;
    }

    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      const content = Buffer.concat(chunks).toString("utf8");
      files.push({ path: rel, content });
      stats.kept++;
      stats.bytes += size;
      if (Date.now() - lastReport > 250) {
        lastReport = Date.now();
        onProgress?.(
          "extract",
          `Extracted ${stats.kept} files (${(stats.bytes / 1e6).toFixed(1)} MB)`,
        );
      }
      next();
    });
  });

  // tar-stream's extractor is a Writable; pipeline handles backpressure and errors.
  await pipeline(gz, zlib.createGunzip(), ex as unknown as Writable);
  onProgress?.(
    "extract",
    `Extracted ${stats.kept} files${stats.truncated ? `, skipped ${stats.skipped} over the limit` : ""}`,
  );
  return { files, stats };
}
