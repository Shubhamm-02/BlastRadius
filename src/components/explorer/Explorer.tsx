"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { RotateCw, Search, TriangleAlert, X } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { useImpact } from "@/state/impact";
import { useProjectData } from "@/state/project";
import { useWorkspace } from "@/state/workspace";
import { FunctionRow, ROW_HEIGHT, optionId } from "./FunctionRow";
import { tokenize } from "@/lib/fuzzy";
import type { GNode } from "@/lib/graph-types";
import { rankFunctions, searchIndex } from "@/lib/function-search";

const LISTBOX_ID = "explorer-listbox";
const HEADING_ID = "explorer-heading";
const LIST_PADDING = 6;
const PAGE_ROWS = 10;

const formatCount = new Intl.NumberFormat("en-US").format;

const byNameThenFile = (a: GNode, b: GNode) =>
  a.name.localeCompare(b.name) ||
  a.file.localeCompare(b.file) ||
  a.line - b.line;

const functionCount = (n: number) =>
  `${formatCount(n)} ${n === 1 ? "function" : "functions"}`;

export function Explorer() {
  const projectId = useWorkspace((s) => s.projectId);
  // Remount per project so the query, cursor and scroll position start fresh.
  return <FunctionExplorer key={projectId ?? ""} hasProject={!!projectId} />;
}

function FunctionExplorer({ hasProject }: { hasProject: boolean }) {
  const selectedId = useWorkspace((s) => s.selectedId);
  const status = useProjectData((s) => s.status);
  const nodes = useProjectData((s) => s.graph.nodes);
  const hopById = useImpact((s) => s.hopById);

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState({ query: "", index: -1 });
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const revealedId = useRef<string | null>(null);
  const listHoverId = useRef<string | null>(null);

  const searchQuery = useDeferredValue(query.trim().toLowerCase());
  // Same ranking as the command palette, uncapped; alphabetical when empty.
  const alphabetical = useMemo(() => [...nodes].sort(byNameThenFile), [nodes]);
  const matches = useMemo(
    () =>
      searchQuery
        ? rankFunctions(searchIndex(nodes), tokenize(searchQuery), Infinity)
            .items
        : alphabetical,
    [nodes, alphabetical, searchQuery],
  );
  const selectedIndex = useMemo(
    () => (selectedId ? matches.findIndex((n) => n.id === selectedId) : -1),
    [matches, selectedId],
  );
  // A new query puts the cursor on the best match so Enter picks it.
  const activeIndex = Math.min(
    cursor.query === searchQuery ? cursor.index : searchQuery ? 0 : -1,
    matches.length - 1,
  );

  const virtualizer = useVirtualizer({
    count: matches.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    paddingStart: LIST_PADDING,
    paddingEnd: LIST_PADDING,
  });
  const rows = virtualizer.getVirtualItems();

  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [searchQuery, virtualizer]);

  // Reveal selections made elsewhere (graph, palette, URL) once per target,
  // so typing a query afterwards does not keep yanking the list back.
  useEffect(() => {
    if (!selectedId) revealedId.current = null;
    if (selectedIndex < 0 || revealedId.current === selectedId) return;
    revealedId.current = selectedId;
    virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
  }, [selectedId, selectedIndex, virtualizer]);

  const commit = useCallback(
    (index: number) => {
      const { id } = matches[index];
      setCursor({ query: searchQuery, index });
      const workspace = useWorkspace.getState();
      workspace.select(id);
      workspace.graphControls?.centerOn(id);
    },
    [matches, searchQuery],
  );

  const hover = useCallback((id: string | null) => {
    listHoverId.current = id;
    useWorkspace.getState().hover(id);
  }, []);

  const releaseHover = useCallback(() => {
    const workspace = useWorkspace.getState();
    if (listHoverId.current && workspace.hoveredId === listHoverId.current) {
      workspace.hover(null);
    }
    listHoverId.current = null;
  }, []);

  // Rows that vanish under the pointer (filtering, the panel closing) never
  // fire pointerleave, so the graph would keep highlighting them.
  useEffect(() => releaseHover, [searchQuery, releaseHover]);

  function moveTo(index: number) {
    const next = Math.max(0, Math.min(index, matches.length - 1));
    setCursor({ query: searchQuery, index: next });
    virtualizer.scrollToIndex(next, { align: "auto" });
    // Arrowing through the list previews each function on the graph.
    hover(matches[next].id);
  }

  function step(delta: number) {
    if (activeIndex >= 0) moveTo(activeIndex + delta);
    else moveTo(Math.max(selectedIndex, 0));
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    const hasMatches = matches.length > 0;
    if (e.key === "ArrowDown" && hasMatches) step(1);
    else if (e.key === "ArrowUp" && hasMatches) step(-1);
    else if (e.key === "PageDown" && hasMatches) step(PAGE_ROWS);
    else if (e.key === "PageUp" && hasMatches) step(-PAGE_ROWS);
    else if (e.key === "Enter" && hasMatches) commit(Math.max(activeIndex, 0));
    else if (e.key === "Escape" && query) setQuery("");
    else if (e.key === "Escape") e.currentTarget.blur();
    else return;
    // Keep global shortcuts (Escape deselects) from acting on keys handled here.
    e.preventDefault();
    e.stopPropagation();
  }

  function onSearchBlur() {
    setFocused(false);
    releaseHover();
  }

  function clearQuery() {
    setQuery("");
    inputRef.current?.focus();
  }

  const ready = hasProject && status === "ready";
  const activeRendered =
    focused && rows.some((row) => row.index === activeIndex);

  let countLabel = "";
  if (hasProject && status !== "ready" && status !== "error") {
    countLabel = "Loading";
  } else if (ready) {
    countLabel = searchQuery
      ? `${formatCount(matches.length)} of ${formatCount(nodes.length)}`
      : formatCount(nodes.length);
  }

  let body: ReactNode;
  if (!hasProject) {
    body = <ListNotice>Analyze a repo to list its functions</ListNotice>;
  } else if (status === "error") {
    body = <LoadError />;
  } else if (status !== "ready") {
    body = <SkeletonRows />;
  } else if (nodes.length === 0) {
    body = <ListNotice>No functions found in this project</ListNotice>;
  } else if (matches.length === 0) {
    body = (
      <ListNotice>
        No functions match{" "}
        <span className="break-all font-mono text-text-muted">
          &apos;{query.trim()}&apos;
        </span>
      </ListNotice>
    );
  } else {
    body = (
      <div
        role="listbox"
        id={LISTBOX_ID}
        aria-labelledby={HEADING_ID}
        // Clicking a row keeps focus in the search box so arrows keep working.
        onMouseDown={(e) => e.preventDefault()}
        className="relative w-full animate-in fade-in-0 duration-base"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {rows.map((row) => {
          const node = matches[row.index];
          return (
            <FunctionRow
              key={node.id}
              node={node}
              index={row.index}
              offset={row.start}
              query={searchQuery}
              hopDepth={hopById.get(node.id)}
              isTarget={node.id === selectedId}
              isActive={focused && row.index === activeIndex}
              onCommit={commit}
              onHover={hover}
            />
          );
        })}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={HEADING_ID}
      className="flex h-full min-h-0 w-full flex-col"
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 pb-3 pt-2.5">
        <div className="flex h-5 items-center justify-between gap-2">
          <h2 id={HEADING_ID} className="text-sm font-medium text-text">
            Functions
          </h2>
          {countLabel && (
            <span className="truncate font-mono text-xs tabular-nums text-text-dim">
              {countLabel}
            </span>
          )}
        </div>
        <div className="relative">
          <Input
            ref={inputRef}
            id="explorer-search"
            type="text"
            role="combobox"
            aria-label="Search functions"
            aria-autocomplete="list"
            aria-expanded={ready && matches.length > 0}
            aria-controls={ready && matches.length > 0 ? LISTBOX_ID : undefined}
            aria-activedescendant={
              activeRendered ? optionId(activeIndex) : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Search functions or files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={onSearchBlur}
            className="peer pl-8 pr-9 max-md:text-md"
          />
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-dim transition-colors duration-fast ease-out peer-focus:text-text-muted"
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search"
              onClick={clearQuery}
              className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
            >
              <X />
            </Button>
          ) : (
            <Kbd
              aria-hidden
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 peer-focus:hidden max-md:hidden"
            >
              /
            </Kbd>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {body}
      </div>

      <p aria-live="polite" className="sr-only">
        {ready && searchQuery
          ? `${functionCount(matches.length)} ${matches.length === 1 ? "matches" : "match"}`
          : ""}
      </p>
    </section>
  );
}

function ListNotice({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-sm text-text-dim">{children}</p>;
}

function LoadError() {
  const error = useProjectData((s) => s.error);
  const reload = useProjectData((s) => s.reload);
  return (
    <div role="alert" className="flex flex-col items-start gap-2 px-3 py-5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-text">
        <TriangleAlert aria-hidden className="size-3.5 text-danger-ink" />
        Couldn&apos;t load functions
      </p>
      {error && <p className="break-words text-xs text-text-dim">{error}</p>}
      <Button size="sm" onClick={reload} className="mt-1">
        <RotateCw />
        Retry
      </Button>
    </div>
  );
}

const SKELETON_NAME_WIDTHS = ["w-28", "w-36", "w-24", "w-32", "w-40", "w-20"];
const SKELETON_FILE_WIDTHS = ["w-44", "w-32", "w-40", "w-48", "w-36"];

function SkeletonRows() {
  return (
    <div aria-busy="true" className="px-1.5 py-1.5">
      <span className="sr-only">Loading functions</span>
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className="flex h-11 flex-col justify-center gap-1.5 px-2.5"
        >
          <Skeleton
            className={`h-3.5 max-w-full ${SKELETON_NAME_WIDTHS[i % SKELETON_NAME_WIDTHS.length]}`}
          />
          <Skeleton
            className={`h-2.5 max-w-full ${SKELETON_FILE_WIDTHS[i % SKELETON_FILE_WIDTHS.length]}`}
          />
        </div>
      ))}
    </div>
  );
}
