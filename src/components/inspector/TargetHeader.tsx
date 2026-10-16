"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/tooltip";
import type { Risk } from "@/lib/graph-metrics";
import type { FunctionRef } from "@/lib/impact";
import type { ProjectInfo } from "@/lib/projects";
import { repoFromSlug } from "@/lib/repo-ref";
import { copyText } from "@/lib/share";
import { useProjectData } from "@/state/project";
import { FilePath } from "./FilePath";

const RISK_TONE = { low: "ok", medium: "accent", high: "danger" } as const;
const RISK_LABEL = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

function githubBlobUrl(info: ProjectInfo, fn: FunctionRef) {
  const repo = repoFromSlug(info.slug);
  if (!repo) return null;
  const path = fn.file.split("/").map(encodeURIComponent).join("/");
  const rev = info.commit ?? repo.ref ?? "HEAD";
  return `https://github.com/${repo.owner}/${repo.repo}/blob/${rev}/${path}#L${fn.line}`;
}

function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <Tip
      side="bottom"
      label={
        <span className="block max-w-56">
          Based on how many functions and files are reached. Medium at 6+
          functions or 3+ files, high at 25+ functions or 8+ files.
        </span>
      }
    >
      <button type="button" className="shrink-0 rounded-sm">
        <Badge tone={RISK_TONE[risk]}>{RISK_LABEL[risk]}</Badge>
      </button>
    </Tip>
  );
}

export function TargetHeader({
  target,
  risk,
}: {
  target: FunctionRef;
  risk: Risk | null;
}) {
  const info = useProjectData((s) => s.info);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const githubUrl =
    info?.source === "github" ? githubBlobUrl(info, target) : null;
  const location = `${target.file}:${target.line}`;

  // Re-targeting from the list unmounts the focused row; keep keyboard users
  // inside the inspector instead of dropping focus to <body>.
  useEffect(() => {
    const heading = headingRef.current;
    const panel = heading?.closest("[data-inspector]");
    if (heading && panel?.contains(document.activeElement)) {
      heading.focus({ preventScroll: true });
    }
  }, []);

  return (
    <header className="flex shrink-0 flex-col gap-1.5 border-b border-border px-4 pb-3 pt-4">
      <div className="flex items-start justify-between gap-3">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 break-all rounded-sm font-mono text-md font-medium text-text"
        >
          {target.name}
        </h2>
        {risk && <RiskBadge risk={risk} />}
      </div>
      <div className="-mr-1.5 flex min-w-0 items-center gap-1">
        <FilePath file={location} className="flex-1 text-xs" />
        <Tip label="Copy location">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy file location"
            onClick={() => copyText(location, "Location copied")}
          >
            <Copy />
          </Button>
        </Tip>
        {githubUrl && (
          <Button asChild variant="ghost" size="sm" className="px-2">
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open on GitHub"
            >
              <ExternalLink />
              GitHub
            </a>
          </Button>
        )}
      </div>
    </header>
  );
}

export function TargetHeaderSkeleton() {
  return (
    <header className="flex shrink-0 flex-col gap-2.5 border-b border-border px-4 pb-4 pt-5">
      <span className="sr-only">Loading function</span>
      <Skeleton className="h-5 w-44" />
      <Skeleton className="h-3.5 w-60 max-w-full" />
    </header>
  );
}
