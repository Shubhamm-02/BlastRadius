"use client";

import {
  ChartColumn,
  Ellipsis,
  Link2,
  PanelLeft,
  PanelRight,
  Search,
} from "lucide-react";
import { GitHubMark } from "@/components/onboarding/GitHubMark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { copyText, shareUrl } from "@/lib/share";
import { useWorkspace } from "@/state/workspace";
import { Wordmark } from "./marks";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { ThemeItems, ThemeToggle } from "./ThemeToggle";
import { useModKey } from "./useModKey";
import { useProjectSummary } from "./useProjectSummary";

const openPalette = () => useWorkspace.getState().setPaletteOpen(true);
const copyShareLink = () => copyText(shareUrl(), "Link copied");

function SearchButton({ mod }: { mod: string | null }) {
  return (
    <Tip label="Search functions" keys={[mod ?? "Ctrl", "K"]}>
      <Button
        variant="outline"
        size="sm"
        onClick={openPalette}
        aria-label="Search functions"
        aria-keyshortcuts={mod === "⌘" ? "Meta+K" : "Control+K"}
        className="hidden h-8 text-text-dim md:inline-flex max-lg:w-8 max-lg:px-0 lg:w-56 lg:justify-between lg:pl-2 lg:pr-1"
      >
        <span className="flex items-center gap-1.5">
          <Search />
          <span className="hidden font-normal lg:inline">Search functions</span>
        </span>
        <span
          aria-hidden
          className={cn(
            "hidden gap-0.5 transition-opacity duration-fast ease-out lg:flex",
            !mod && "opacity-0",
          )}
        >
          <Kbd>{mod ?? "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </Button>
    </Tip>
  );
}

function OverflowMenu({
  mod,
  hasProject,
  repoUrl,
}: {
  mod: string | null;
  hasProject: boolean;
  repoUrl: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="More"
          className="md:hidden"
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={openPalette}>
          <Search />
          <span className="flex-1">Search functions</span>
          {mod && (
            <span className="flex gap-0.5">
              <Kbd>{mod}</Kbd>
              <Kbd>K</Kbd>
            </span>
          )}
        </DropdownMenuItem>
        {hasProject && (
          <DropdownMenuItem onSelect={copyShareLink}>
            <Link2 />
            Copy share link
          </DropdownMenuItem>
        )}
        {repoUrl && (
          <DropdownMenuItem asChild>
            <a href={repoUrl} target="_blank" rel="noreferrer">
              <GitHubMark />
              Open on GitHub
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href="/stats">
            <ChartColumn />
            Usage stats
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <ThemeItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PanelToggles({ inspectorOpen }: { inspectorOpen: boolean }) {
  const explorerOpen = useWorkspace((s) => s.panels.explorer);
  const togglePanel = useWorkspace((s) => s.togglePanel);
  return (
    <div className="hidden items-center gap-0.5 md:flex">
      <span aria-hidden className="mx-1.5 h-4 w-px bg-border" />
      <Tip
        label={explorerOpen ? "Hide explorer" : "Show explorer"}
        keys={["["]}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Explorer"
          aria-pressed={explorerOpen}
          aria-controls="explorer-panel"
          onClick={() => togglePanel("explorer")}
          className="aria-pressed:text-text"
        >
          <PanelLeft />
        </Button>
      </Tip>
      <Tip
        label={inspectorOpen ? "Hide inspector" : "Show inspector"}
        keys={["]"]}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Inspector"
          aria-pressed={inspectorOpen}
          onClick={() => togglePanel("inspector")}
          className="aria-pressed:text-text"
        >
          <PanelRight />
        </Button>
      </Tip>
    </div>
  );
}

export function TopBar({
  hasProject,
  inspectorOpen,
}: {
  hasProject: boolean;
  inspectorOpen: boolean;
}) {
  const mod = useModKey();
  const summary = useProjectSummary();
  const repoUrl = summary?.repoUrl ?? null;

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
      <Wordmark />
      <div className="flex min-w-0 flex-1 items-center">
        <ProjectSwitcher summary={summary} />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <SearchButton mod={mod} />
        <div className="ml-1.5 hidden items-center gap-0.5 md:flex">
          {hasProject && (
            <Tip label="Copy share link">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy share link"
                onClick={copyShareLink}
              >
                <Link2 />
              </Button>
            </Tip>
          )}
          {repoUrl && (
            <Tip label="Open on GitHub">
              <Button asChild variant="ghost" size="icon">
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${summary?.slug} on GitHub`}
                >
                  <GitHubMark />
                </a>
              </Button>
            </Tip>
          )}
          <Tip label="Usage stats">
            <Button asChild variant="ghost" size="icon">
              <a href="/stats" aria-label="Usage stats">
                <ChartColumn />
              </a>
            </Button>
          </Tip>
          <ThemeToggle />
        </div>
        {hasProject && <PanelToggles inspectorOpen={inspectorOpen} />}
        <OverflowMenu mod={mod} hasProject={hasProject} repoUrl={repoUrl} />
      </div>
    </header>
  );
}
