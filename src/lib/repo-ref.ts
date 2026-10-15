export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
}

const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const REF_RE = /^[A-Za-z0-9_./-]{1,250}$/;

/**
 * Accepts "owner/repo", a github.com URL, or an owner/repo/tree/branch URL.
 * Returns null for anything else. Safe to import from client components.
 */
export function parseRepoRef(input: string): RepoRef | null {
  const s = input
    .trim()
    .replace(/^git\+/, "")
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  // Branch names can contain slashes.
  const ref = parts[2] === "tree" && parts[3] ? parts.slice(3).join("/") : undefined;
  if (
    !NAME_RE.test(owner) ||
    !NAME_RE.test(repo) ||
    (ref !== undefined && (!REF_RE.test(ref) || ref.includes("..")))
  ) {
    return null;
  }
  return { owner, repo, ref };
}

export function formatRepoRef({ owner, repo, ref }: RepoRef): string {
  return `${owner}/${repo}${ref ? "@" + ref : ""}`;
}

/** Inverse of formatRepoRef, used to rebuild GitHub links from a project slug. */
export function repoFromSlug(slug: string): RepoRef | null {
  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@(.+))?$/.exec(slug);
  return m ? { owner: m[1], repo: m[2], ref: m[3] } : null;
}
