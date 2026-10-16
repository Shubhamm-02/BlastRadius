"use client";

import { useEffect } from "react";
import { useImpact } from "./impact";
import { useProjectData } from "./project";
import { useWorkspace } from "./workspace";

const DEPTH_DEBOUNCE_MS = 150;

function writeUrl(projectId: string | null, fn: string | null) {
  const url = new URL(window.location.href);
  if (projectId) url.searchParams.set("projectId", projectId);
  else url.searchParams.delete("projectId");
  if (fn) url.searchParams.set("fn", fn);
  else url.searchParams.delete("fn");
  if (url.href !== window.location.href)
    window.history.replaceState(null, "", url);
}

const recentKey = (projectId: string) => `br:recent:${projectId}`;

/** Merge recents saved for this project behind any made this session. */
function restoreRecent(projectId: string | null) {
  if (!projectId) return;
  let saved: unknown;
  try {
    saved = JSON.parse(localStorage.getItem(recentKey(projectId)) ?? "[]");
  } catch {
    return; // private mode or a corrupt entry; recents are optional
  }
  if (!Array.isArray(saved) || saved.length === 0) return;
  const ws = useWorkspace.getState();
  const merged = [
    ...new Set([...ws.recent, ...saved.filter((id) => typeof id === "string")]),
  ];
  ws.setRecent(merged.slice(0, 8));
}

/**
 * Wires workspace state to the URL (?projectId=&fn=), loads project data,
 * runs impact queries and persists recent selections. Mount once.
 */
export function WorkspaceEffects() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("projectId");
    if (!projectId) return;
    const ws = useWorkspace.getState();
    ws.setProject(projectId);
    const fn = params.get("fn");
    if (fn) ws.select(fn);
  }, []);

  useEffect(() => {
    let depthTimer: ReturnType<typeof setTimeout> | undefined;

    // zustand passes the state before each notification. A closure-held
    // "previous" would go stale when a listener sets state re-entrantly
    // (restoreRecent does), replaying the project change in a loop.
    const unsubscribe = useWorkspace.subscribe((s, prev) => {
      if (s.projectId !== prev.projectId) {
        useProjectData.getState().load(s.projectId);
        restoreRecent(s.projectId);
      }
      if (s.projectId !== prev.projectId || s.selectedId !== prev.selectedId) {
        writeUrl(s.projectId, s.selectedId);
      }
      if (s.recent !== prev.recent && s.projectId) {
        try {
          localStorage.setItem(
            recentKey(s.projectId),
            JSON.stringify(s.recent),
          );
        } catch {
          // private mode; recents are optional
        }
      }

      const targetChanged =
        s.projectId !== prev.projectId ||
        s.selectedId !== prev.selectedId ||
        s.direction !== prev.direction;
      if (targetChanged || s.depth !== prev.depth) {
        clearTimeout(depthTimer);
        const query =
          s.projectId && s.selectedId
            ? {
                projectId: s.projectId,
                id: s.selectedId,
                depth: s.depth,
                direction: s.direction,
              }
            : null;
        if (targetChanged) {
          useImpact.getState().run(query);
        } else {
          useImpact.getState().previewDepth(s.depth);
          depthTimer = setTimeout(
            () => useImpact.getState().run(query),
            DEPTH_DEBOUNCE_MS,
          );
        }
      }
    });

    const initial = useWorkspace.getState();
    if (initial.projectId) {
      useProjectData.getState().load(initial.projectId);
      restoreRecent(initial.projectId);
      if (initial.selectedId) {
        useImpact.getState().run({
          projectId: initial.projectId,
          id: initial.selectedId,
          depth: initial.depth,
          direction: initial.direction,
        });
      }
    }
    return () => {
      clearTimeout(depthTimer);
      unsubscribe();
    };
  }, []);

  return null;
}
