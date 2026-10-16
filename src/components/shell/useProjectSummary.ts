"use client";

import { useEffect, useState } from "react";
import type { IngestResult } from "@/lib/ingest";
import type { ProjectSource, ProjectStats } from "@/lib/projects";
import { repoFromSlug } from "@/lib/repo-ref";
import { useIngest } from "@/state/ingest";
import { useProjectData } from "@/state/project";
import { useWorkspace } from "@/state/workspace";

export interface ProjectSummary {
  id: string;
  slug: string;
  source: ProjectSource;
  stats: ProjectStats;
  truncated: boolean;
  commit: string | null;
  repoUrl: string | null;
}

function githubUrl(slug: string, source: ProjectSource): string | null {
  const ref = source === "github" ? repoFromSlug(slug) : null;
  if (!ref) return null;
  const base = `https://github.com/${ref.owner}/${ref.repo}`;
  return ref.ref ? `${base}/tree/${ref.ref}` : base;
}

/**
 * The loaded project's metadata, falling back to the ingest result while
 * /api/project is still in flight. The ingest store clears its result on
 * reset(), right when the success card hands off to the top bar, so the last
 * one is kept here.
 */
export function useProjectSummary(): ProjectSummary | null {
  const projectId = useWorkspace((s) => s.projectId);
  const info = useProjectData((s) => s.info);
  const ingested = useIngest((s) => s.result);
  const [handoff, setHandoff] = useState<IngestResult | null>(null);

  useEffect(() => {
    if (ingested) setHandoff(ingested);
  }, [ingested]);

  if (!projectId) return null;
  if (info?.id === projectId) {
    return {
      id: info.id,
      slug: info.slug,
      source: info.source,
      stats: info.stats,
      truncated: info.truncated,
      commit: info.commit,
      repoUrl: githubUrl(info.slug, info.source),
    };
  }
  const fallback = ingested ?? handoff;
  if (fallback?.projectId !== projectId) return null;
  return {
    id: fallback.projectId,
    slug: fallback.slug,
    source: fallback.source,
    stats: fallback.stats,
    truncated: fallback.truncated,
    commit: null,
    repoUrl: githubUrl(fallback.slug, fallback.source),
  };
}
