import type { ProjectStats } from "@/lib/projects";

export interface RecentProject {
  id: string;
  slug: string;
  stats: ProjectStats;
  openedAt: number;
}

const STORAGE_KEY = "br:projects";
const MAX_RECENT = 8;

const isRecentProject = (v: unknown): v is RecentProject => {
  const p = v as Partial<RecentProject> | null;
  return (
    typeof p?.id === "string" &&
    typeof p.slug === "string" &&
    typeof p.openedAt === "number" &&
    typeof p.stats === "object"
  );
};

// Storage can throw (private mode, quota) and holds whatever was last written
// under the key, so reads validate and writes are best-effort.
export function readRecentProjects(): RecentProject[] {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(saved) ? saved.filter(isRecentProject) : [];
  } catch {
    return [];
  }
}

export function rememberProject(project: RecentProject): void {
  const rest = readRecentProjects().filter((p) => p.id !== project.id);
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([project, ...rest].slice(0, MAX_RECENT)),
    );
  } catch {
    // The switcher just shows fewer recents.
  }
}

export function openedAgo(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
