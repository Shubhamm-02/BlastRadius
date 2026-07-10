import zlib from "node:zlib";
import { extract } from "tar-stream";
import type { SourceFileInput } from "@/lib/analyze";

const CODE_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;
const SKIP_DIR =
  /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|\.git)\//;

const MAX_FILES = 2000;
const MAX_TOTAL_BYTES = 12_000_000; // ~12 MB of source

export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
}

/** Accepts "owner/repo", a full github.com URL, or an owner/repo/tree/branch URL. */
export function parseRepoInput(input: string): RepoRef {
  let s = input.trim();
  s = s.replace(/^git\+/, "");
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.replace(/\.git$/i, "");
  s = s.replace(/\/+$/, "");

  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Enter a repo as 'owner/repo' or a GitHub URL.");
  }
  const [owner, repo] = parts;
  let ref: string | undefined;
  if (parts[2] === "tree" && parts[3]) {
    ref = parts.slice(3).join("/"); // branch names can contain slashes
  }
  return { owner, repo, ref };
}

/** Download a repo tarball and return its TS/JS source files, in memory. */
export async function fetchRepoFiles(
  { owner, repo, ref }: RepoRef,
): Promise<SourceFileInput[]> {
  const url = ref
    ? `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`
    : `https://api.github.com/repos/${owner}/${repo}/tarball`;

  const headers: Record<string, string> = {
    "User-Agent": "BlastRadius",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `Repo not found (or private): ${owner}/${repo}. Set GITHUB_TOKEN for private repos.`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        "GitHub rate limit hit. Set a GITHUB_TOKEN env var and try again.",
      );
    }
    throw new Error(`GitHub fetch failed: ${res.status} ${res.statusText}`);
  }

  const gz = Buffer.from(await res.arrayBuffer());
  const tar = zlib.gunzipSync(gz);
  return extractCodeFiles(tar);
}

function extractCodeFiles(tarBuf: Buffer): Promise<SourceFileInput[]> {
  return new Promise((resolve, reject) => {
    const files: SourceFileInput[] = [];
    let totalBytes = 0;
    const ex = extract();

    ex.on("entry", (header, stream, next) => {
      // Tarball entries are prefixed with a top-level "owner-repo-sha/" dir.
      const rel = header.name.split("/").slice(1).join("/");
      const keep =
        header.type === "file" &&
        CODE_EXT.test(rel) &&
        !SKIP_DIR.test(rel) &&
        !rel.endsWith(".d.ts");

      if (!keep) {
        stream.resume();
        stream.on("end", next);
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        const content = Buffer.concat(chunks).toString("utf8");
        totalBytes += content.length;
        if (files.length < MAX_FILES && totalBytes < MAX_TOTAL_BYTES) {
          files.push({ path: rel, content });
        }
        next();
      });
      stream.on("error", reject);
    });

    ex.on("finish", () => resolve(files));
    ex.on("error", reject);
    ex.end(tarBuf);
  });
}
