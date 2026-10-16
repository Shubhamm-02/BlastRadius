"use client";

import { relativeTime } from "@/lib/format";
import {
  ChevronsUpDown,
  FolderClosed,
  History,
  Link2,
  Plus,
  Terminal,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GitHubMark } from "@/components/onboarding/GitHubMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectSource } from "@/lib/projects";
import { copyShareLink } from "@/lib/share";
import { SPRING } from "@/lib/motion";
import { startNewAnalysis, useIngest } from "@/state/ingest";
import { useProjectData } from "@/state/project";
import { useWorkspace } from "@/state/workspace";
import {
  readRecentProjects,
  rememberProject,
  type RecentProject,
} from "./recentProjects";
import type { ProjectSummary } from "./useProjectSummary";

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("en-US");

const SOURCE_LABEL: Record<ProjectSource, string> = {
  github: "GitHub",
  upload: "Uploaded folder",
  cli: "CLI",
  legacy: "Imported",
};

function SourceIcon({ source }: { source: ProjectSource }) {
  if (source === "github")
    return <GitHubMark className="size-3.5 shrink-0 text-text-muted" />;
  const Icon = source === "cli" ? Terminal : FolderClosed;
  return <Icon aria-hidden className="size-3.5 shrink-0 text-text-muted" />;
}

const openProject = (id: string) => useWorkspace.getState().setProject(id);

function RecentItems({ projects }: { projects: RecentProject[] }) {
  if (projects.length === 0) return null;
  return (
    <>
      <DropdownMenuLabel>Recent projects</DropdownMenuLabel>
      {projects.map((p) => (
        <DropdownMenuItem
          key={p.id}
          onSelect={() => openProject(p.id)}
          className="gap-3"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-sm">
            {p.slug}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-text-dim">
            {relativeTime(p.openedAt, Date.now())}
          </span>
        </DropdownMenuItem>
      ))}
    </>
  );
}

function ProjectDetails({ summary }: { summary: ProjectSummary }) {
  const counts: [string, number][] = [
    ["Files", summary.stats.files],
    ["Functions", summary.stats.functions],
    ["Edges", summary.stats.calls],
  ];
  return (
    <div className="px-2 pb-2.5 pt-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <SourceIcon source={summary.source} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-text">
          {summary.slug}
        </span>
        {summary.truncated && <Badge tone="accent">Partial</Badge>}
      </div>
      <p className="mt-0.5 pl-[22px] text-xs text-text-dim">
        {SOURCE_LABEL[summary.source]}
        {summary.commit && (
          <>
            {" at "}
            <span className="font-mono">{summary.commit.slice(0, 7)}</span>
          </>
        )}
      </p>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 rounded-sm border border-border bg-surface-2 px-2.5 py-2">
        {counts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-text-dim">{label}</dt>
            <dd className="truncate font-mono text-sm tabular-nums text-text">
              {full.format(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PillLabel({ summary }: { summary: ProjectSummary | null }) {
  const status = useProjectData((s) => s.status);
  if (summary) {
    const { files, functions, calls } = summary.stats;
    return (
      <>
        <SourceIcon source={summary.source} />
        <span className="min-w-0 truncate font-mono text-text">
          {summary.slug}
        </span>
        <span className="hidden shrink-0 text-xs tabular-nums text-text-dim xl:inline">
          {compact.format(files)} files · {compact.format(functions)} functions
          · {compact.format(calls)} edges
        </span>
      </>
    );
  }
  if (status === "error")
    return (
      <span className="truncate text-text-muted">Project unavailable</span>
    );
  return (
    <>
      <span className="sr-only">Loading project</span>
      <Skeleton className="h-3 w-28" />
    </>
  );
}

/**
 * Project pill in the top bar. Shares layoutId "project-pill" with the
 * onboarding success card, which renders it while ingest phase is "done";
 * the pill steps aside for that phase so motion morphs the card into it.
 */
export function ProjectSwitcher({
  summary,
}: {
  summary: ProjectSummary | null;
}) {
  const projectId = useWorkspace((s) => s.projectId);
  const info = useProjectData((s) => s.info);
  const handingOff = useIngest((s) => s.phase === "done");
  const [recent, setRecent] = useState<RecentProject[]>([]);

  useEffect(() => {
    if (info)
      rememberProject({
        id: info.id,
        slug: info.slug,
        stats: info.stats,
        openedAt: Date.now(),
      });
  }, [info]);

  useEffect(() => {
    setRecent(readRecentProjects());
  }, [projectId]);

  const refreshRecent = (open: boolean) => {
    if (open) setRecent(readRecentProjects());
  };
  const others = recent.filter((p) => p.id !== projectId);

  if (!projectId) {
    if (others.length === 0) return null;
    return (
      <DropdownMenu onOpenChange={refreshRecent}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="text-text-muted">
            <History />
            <span className="max-sm:sr-only">Recent</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-72 max-w-[calc(100vw-24px)]"
        >
          <RecentItems projects={others} />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (handingOff) return null;

  return (
    <DropdownMenu onOpenChange={refreshRecent}>
      <DropdownMenuTrigger asChild>
        <motion.button
          type="button"
          layoutId="project-pill"
          transition={SPRING}
          // Radius lives in style so motion can counter-scale it during the layout morph.
          style={{ borderRadius: 10 }}
          aria-label={
            summary ? `Project ${summary.slug}. Switch project` : "Project menu"
          }
          className="flex h-7 min-w-0 max-w-full items-center gap-2 border border-border bg-surface-1 pl-2 pr-1.5 text-sm shadow-raised transition-colors duration-fast ease-out hover:border-border-strong data-[state=open]:border-border-strong"
        >
          <PillLabel summary={summary} />
          <ChevronsUpDown
            aria-hidden
            className="size-3.5 shrink-0 text-text-dim"
          />
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80 max-w-[calc(100vw-24px)]"
      >
        {summary && (
          <>
            <ProjectDetails summary={summary} />
            <DropdownMenuSeparator />
          </>
        )}
        {others.length > 0 && (
          <>
            <RecentItems projects={others} />
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={startNewAnalysis}>
          <Plus />
          Analyze another repo
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyShareLink}>
          <Link2 />
          Copy share link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
