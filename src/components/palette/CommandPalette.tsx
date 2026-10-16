"use client";

import {
  ChevronLeft,
  Clock,
  FileCode,
  FolderGit2,
  RotateCcw,
  SquareFunction,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { GNode, LoadStatus } from "@/lib/graph-types";
import { parseRepoRef, type RepoRef } from "@/lib/repo-ref";
import { useIngest } from "@/state/ingest";
import { useProjectData } from "@/state/project";
import { useWorkspace } from "@/state/workspace";
import { matchPositions, tokenize } from "./fuzzy";
import {
  functionHighlights,
  mostCalled,
  rankFiles,
  rankFunctions,
  rankInFile,
  searchIndex,
  type FileEntry,
  type Ranked,
} from "./search";
import { KeyCombo, ShortcutKeys } from "./ShortcutKeys";
import { usePaletteActions, type PaletteAction } from "./usePaletteActions";

// cmdk item values must be unique across groups, and the same function can sit in
// both Recent and Functions, so the group is part of the value.
const FN_PREFIX = "fn:";
const fnValue = (group: string, id: string) => `${FN_PREFIX}${group}:${id}`;
const fnIdOf = (value: string): string | null =>
  value.startsWith(FN_PREFIX)
    ? value.slice(value.indexOf(":", FN_PREFIX.length) + 1)
    : null;

const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const LOADING_ROW_WIDTHS = ["w-28", "w-40", "w-24"];
const NO_TOKENS: string[] = [];
const NO_HITS = new Set<number>();

export function CommandPalette() {
  const open = useWorkspace((s) => s.paletteOpen);
  const setOpen = useWorkspace((s) => s.setPaletteOpen);
  const [query, setQuery] = useState("");
  const [fileScope, setFileScope] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setFileScope(null);
    }
  }

  const scopeTo = (file: string | null) => {
    setFileScope(file);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="top-[8vh] max-w-[640px] overflow-hidden sm:top-[16vh]"
        onEscapeKeyDown={(e) => {
          if (!fileScope) return;
          e.preventDefault();
          scopeTo(null);
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <PaletteBody
          query={query}
          onQueryChange={setQuery}
          fileScope={fileScope}
          onScope={scopeTo}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({
  query,
  onQueryChange,
  fileScope,
  onScope,
  onClose,
}: {
  query: string;
  onQueryChange(query: string): void;
  fileScope: string | null;
  onScope(file: string | null): void;
  onClose(): void;
}) {
  const projectId = useWorkspace((s) => s.projectId);
  const hover = useWorkspace((s) => s.hover);
  const nodes = useProjectData((s) => s.graph.nodes);
  const graphStatus = useProjectData((s) => s.status);
  const actions = usePaletteActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState("");

  const index = searchIndex(nodes);
  const tokens = useMemo(() => tokenize(query), [query]);
  const fileEntry = fileScope ? index.fileByPath.get(fileScope) : undefined;

  useEffect(() => () => hover(null), [hover]);

  // Previewing the highlighted function on the graph behind the dialog, for keyboard
  // and pointer alike; cmdk reports both through the active value.
  const onActiveChange = (value: string) => {
    setActive(value);
    hover(fnIdOf(value));
  };

  const chooseFunction = (id: string) => {
    const { select, graphControls } = useWorkspace.getState();
    select(id);
    graphControls?.centerOn(id);
    onClose();
  };

  const runAction = (action: PaletteAction) => {
    action.perform();
    onClose();
  };

  const leaveFile = () => {
    onScope(null);
    inputRef.current?.focus();
  };

  const placeholder = fileEntry
    ? "Filter functions in this file"
    : projectId
      ? "Search functions and files, run an action, or paste a repo"
      : "Paste a GitHub repo or search actions";

  return (
    <Command
      label="Command palette"
      shouldFilter={false}
      loop
      // Ctrl+K must reach the global handler so it can close the palette.
      vimBindings={false}
      value={active}
      onValueChange={onActiveChange}
    >
      {fileEntry && <ScopeBar entry={fileEntry} onBack={leaveFile} />}
      <CommandInput
        ref={inputRef}
        value={query}
        onValueChange={onQueryChange}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key !== "Backspace" || query || !fileEntry) return;
          e.preventDefault();
          leaveFile();
        }}
      />
      {/* Animates to the measured content height; +12px is the list's own p-1.5. */}
      <CommandList className="h-[calc(var(--cmdk-list-height)+12px)] transition-[height] duration-fast ease-out">
        {fileEntry ? (
          <FileResults
            entry={fileEntry}
            tokens={tokens}
            onChoose={chooseFunction}
          />
        ) : (
          <RootResults
            query={query}
            tokens={tokens}
            actions={actions}
            graphStatus={graphStatus}
            onChooseFunction={chooseFunction}
            onChooseFile={onScope}
            onRunAction={runAction}
            onClose={onClose}
          />
        )}
      </CommandList>
      <PaletteFooter scoped={Boolean(fileEntry)} />
    </Command>
  );
}

function ScopeBar({ entry, onBack }: { entry: FileEntry; onBack(): void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border py-1.5 pl-2 pr-4">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onBack}
        aria-label="Back to all results"
      >
        <ChevronLeft />
      </Button>
      <FileCode className="size-3.5 shrink-0 text-text-dim" aria-hidden />
      <span className="min-w-0 truncate font-mono text-xs text-text">
        {entry.file}
      </span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-text-dim">
        {plural(entry.fns.length, "function")}
      </span>
    </div>
  );
}

function RootResults({
  query,
  tokens,
  actions,
  graphStatus,
  onChooseFunction,
  onChooseFile,
  onRunAction,
  onClose,
}: {
  query: string;
  tokens: string[];
  actions: PaletteAction[];
  graphStatus: LoadStatus;
  onChooseFunction(id: string): void;
  onChooseFile(file: string): void;
  onRunAction(action: PaletteAction): void;
  onClose(): void;
}) {
  const projectId = useWorkspace((s) => s.projectId);
  const selectedId = useWorkspace((s) => s.selectedId);
  const recent = useWorkspace((s) => s.recent);
  const nodes = useProjectData((s) => s.graph.nodes);
  const nodeById = useProjectData((s) => s.nodeById);
  const degree = useProjectData((s) => s.degree);

  const searching = tokens.length > 0;
  const index = searchIndex(nodes);
  const functionHits = useMemo(
    () => (searching ? rankFunctions(index, tokens) : null),
    [index, tokens, searching],
  );
  const fileHits = useMemo(
    () => (searching ? rankFiles(index, tokens) : null),
    [index, tokens, searching],
  );

  const recentNodes = searching ? [] : nodesFor(recent, nodeById);
  const calledNodes = searching ? [] : nodesFor(mostCalled(degree), nodeById);
  const visibleActions = searching
    ? actions.filter((a) => {
        const haystack = `${a.label} ${a.keywords}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      })
    : actions;

  const repoRef = searching ? parseRepoRef(query) : null;
  // "src/lib" also parses as owner/repo, so a bare pair only leads the list when
  // nothing in the graph matches; URLs and the empty workspace always lead with it.
  const analyzeFirst =
    !projectId ||
    /github\.com/i.test(query) ||
    (functionHits?.total === 0 && fileHits?.total === 0);
  const analyzeGroup = repoRef && (
    <AnalyzeGroup repoRef={repoRef} input={query} onClose={onClose} />
  );

  return (
    <>
      {graphStatus !== "loading" && (
        <CommandEmpty>
          {projectId
            ? `No functions, files or actions match "${query.trim()}"`
            : "No matching actions. Paste owner/repo or a GitHub URL to analyze it."}
        </CommandEmpty>
      )}
      {graphStatus === "error" && <GraphFailed />}
      {analyzeFirst && analyzeGroup}
      {graphStatus === "loading" && <FunctionsLoading />}

      {recentNodes.length > 0 && (
        <CommandGroup heading="Recent">
          {recentNodes.map((node) => (
            <FunctionItem
              key={node.id}
              group="recent"
              node={node}
              icon={Clock}
              isTarget={node.id === selectedId}
              onChoose={onChooseFunction}
            />
          ))}
        </CommandGroup>
      )}
      {calledNodes.length > 0 && (
        <CommandGroup heading="Most called">
          {calledNodes.map((node) => (
            <FunctionItem
              key={node.id}
              group="called"
              node={node}
              isTarget={node.id === selectedId}
              meta={plural(degree.get(node.id)?.in ?? 0, "caller")}
              onChoose={onChooseFunction}
            />
          ))}
        </CommandGroup>
      )}

      {functionHits && functionHits.items.length > 0 && (
        <CommandGroup
          heading={<GroupHeading label="Functions" hits={functionHits} />}
        >
          {functionHits.items.map((node) => (
            <FunctionItem
              key={node.id}
              group="search"
              node={node}
              tokens={tokens}
              isTarget={node.id === selectedId}
              onChoose={onChooseFunction}
            />
          ))}
        </CommandGroup>
      )}
      {fileHits && fileHits.items.length > 0 && (
        <CommandGroup heading={<GroupHeading label="Files" hits={fileHits} />}>
          {fileHits.items.map((entry) => (
            <CommandItem
              key={entry.file}
              value={`file:${entry.file}`}
              onSelect={() => onChooseFile(entry.file)}
            >
              <FileCode aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-text">
                <MatchText
                  text={entry.file}
                  hits={matchPositions(tokens, entry.file)}
                />
              </span>
              <span className="shrink-0 text-xs tabular-nums text-text-dim">
                {plural(entry.fns.length, "function")}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}

      {visibleActions.length > 0 && (
        <CommandGroup heading="Actions">
          {visibleActions.map((action) => (
            <CommandItem
              key={action.id}
              value={`action:${action.id}`}
              onSelect={() => onRunAction(action)}
            >
              <action.icon aria-hidden />
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
              {action.shortcut && (
                <ShortcutKeys id={action.shortcut} className="max-sm:hidden" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {!analyzeFirst && analyzeGroup}
    </>
  );
}

function nodesFor(ids: string[], nodeById: Map<string, GNode>): GNode[] {
  const found: GNode[] = [];
  for (const id of ids) {
    const node = nodeById.get(id);
    if (node) found.push(node);
  }
  return found;
}

function GraphFailed() {
  const error = useProjectData((s) => s.error);
  return (
    <CommandGroup heading="Graph">
      <CommandItem
        value="action:reload"
        onSelect={() => useProjectData.getState().reload()}
      >
        <RotateCcw aria-hidden />
        <span className="shrink-0">Retry loading graph</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-danger-ink">
          {error || "The graph failed to load"}
        </span>
      </CommandItem>
    </CommandGroup>
  );
}

function GroupHeading<T>({ label, hits }: { label: string; hits: Ranked<T> }) {
  return (
    <span className="flex items-center justify-between gap-2">
      {label}
      <span className="font-normal tabular-nums">
        {hits.total > hits.items.length
          ? `Top ${hits.items.length} of ${hits.total.toLocaleString()}`
          : hits.total.toLocaleString()}
      </span>
    </span>
  );
}

function AnalyzeGroup({
  repoRef,
  input,
  onClose,
}: {
  repoRef: RepoRef;
  input: string;
  onClose(): void;
}) {
  const busy = useIngest(
    (s) => s.phase === "preparing" || s.phase === "running",
  );
  return (
    <CommandGroup heading="GitHub">
      <CommandItem
        value="action:analyze"
        disabled={busy}
        onSelect={() => {
          useIngest.getState().analyzeRepo(input.trim());
          onClose();
        }}
      >
        <FolderGit2 aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          Analyze{" "}
          <span className="font-mono text-text">
            {repoRef.owner}/{repoRef.repo}
          </span>
          {repoRef.ref && (
            <span className="font-mono text-text-dim">@{repoRef.ref}</span>
          )}
        </span>
        {busy && (
          <span className="shrink-0 text-xs text-text-dim">
            Analysis running
          </span>
        )}
      </CommandItem>
    </CommandGroup>
  );
}

function FileResults({
  entry,
  tokens,
  onChoose,
}: {
  entry: FileEntry;
  tokens: string[];
  onChoose(id: string): void;
}) {
  const selectedId = useWorkspace((s) => s.selectedId);
  const fns = useMemo(() => rankInFile(entry, tokens), [entry, tokens]);
  return (
    <>
      <CommandEmpty>No functions in this file match</CommandEmpty>
      {fns.map((node) => (
        <FunctionItem
          key={node.id}
          group="file"
          node={node}
          tokens={tokens}
          inFile
          isTarget={node.id === selectedId}
          onChoose={onChoose}
        />
      ))}
    </>
  );
}

function FunctionItem({
  group,
  node,
  tokens = NO_TOKENS,
  inFile = false,
  icon: Icon = SquareFunction,
  meta,
  isTarget,
  onChoose,
}: {
  group: string;
  node: GNode;
  tokens?: string[];
  inFile?: boolean;
  icon?: LucideIcon;
  meta?: string;
  isTarget: boolean;
  onChoose(id: string): void;
}) {
  const hits = inFile
    ? { name: matchPositions(tokens, node.name), file: NO_HITS }
    : functionHighlights(node, tokens);
  return (
    <CommandItem
      value={fnValue(group, node.id)}
      onSelect={() => onChoose(node.id)}
    >
      <Icon aria-hidden />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="max-w-[70%] shrink-0 truncate font-mono text-text">
          <MatchText text={node.name} hits={hits.name} />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-dim">
          {inFile ? (
            `L${node.line}`
          ) : (
            <>
              <MatchText text={node.file} hits={hits.file} />:{node.line}
            </>
          )}
        </span>
      </span>
      {isTarget && <Badge tone="danger">Target</Badge>}
      {meta && (
        <span className="shrink-0 text-xs tabular-nums text-text-dim">
          {meta}
        </span>
      )}
    </CommandItem>
  );
}

function MatchText({ text, hits }: { text: string; hits: Set<number> }) {
  if (hits.size === 0) return text;

  const parts: ReactNode[] = [];
  let start = 0;
  while (start < text.length) {
    const hit = hits.has(start);
    let end = start;
    while (end < text.length && hits.has(end) === hit) end++;
    const run = text.slice(start, end);
    parts.push(
      hit ? (
        <mark key={start} className="bg-transparent text-accent-ink">
          {run}
        </mark>
      ) : (
        run
      ),
    );
    start = end;
  }
  return parts;
}

function FunctionsLoading() {
  return (
    <div role="status" className="px-2 pb-1 pt-2">
      <p className="pb-1 text-xs font-medium text-text-dim">
        Loading functions
      </p>
      {LOADING_ROW_WIDTHS.map((width) => (
        <div key={width} className="flex items-center gap-2.5 py-2">
          <Skeleton className="size-4" />
          <Skeleton className={`h-3 ${width}`} />
          <Skeleton className="h-3 w-32 opacity-60" />
        </div>
      ))}
    </div>
  );
}

function PaletteFooter({ scoped }: { scoped: boolean }) {
  return (
    <div className="hidden items-center gap-4 border-t border-border px-3 py-2 text-xs text-text-dim sm:flex">
      <FooterHint keys={["↑", "↓"]} label="Navigate" />
      <FooterHint keys={["↵"]} label="Select" />
      <FooterHint keys={["Esc"]} label={scoped ? "Back" : "Close"} />
      {scoped && <FooterHint keys={["⌫"]} label="All results" />}
    </div>
  );
}

function FooterHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <KeyCombo keys={keys} />
      {label}
    </span>
  );
}
