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
  if (url.href !== window.location.href) window.history.replaceState(null, "", url);
}

const recentKey = (projectId: string) => `br:recent:${projectId}`;

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
    let prev = useWorkspace.getState();

    const unsubscribe = useWorkspace.subscribe((s) => {
      if (s.projectId !== prev.projectId) {
        useProjectData.getState().load(s.projectId);
        if (s.projectId) {
          try {
            const saved = JSON.parse(localStorage.getItem(recentKey(s.projectId)) ?? "[]");
            if (Array.isArray(saved) && s.recent.length === 0) s.setRecent(saved.slice(0, 8));
          } catch {
            // private mode or corrupt entry; recents are optional
          }
        }
      }
      if (s.projectId !== prev.projectId || s.selectedId !== prev.selectedId) {
        writeUrl(s.projectId, s.selectedId);
      }
      if (s.recent !== prev.recent && s.projectId) {
        try {
          localStorage.setItem(recentKey(s.projectId), JSON.stringify(s.recent));
        } catch {
          // optional
        }
      }

      const targetChanged =
        s.projectId !== prev.projectId || s.selectedId !== prev.selectedId || s.direction !== prev.direction;
      if (targetChanged || s.depth !== prev.depth) {
        clearTimeout(depthTimer);
        const query =
          s.projectId && s.selectedId
            ? { projectId: s.projectId, id: s.selectedId, depth: s.depth, direction: s.direction }
            : null;
        if (targetChanged) {
          useImpact.getState().run(query);
        } else {
          useImpact.getState().previewDepth(s.depth);
          depthTimer = setTimeout(() => useImpact.getState().run(query), DEPTH_DEBOUNCE_MS);
        }
      }
      prev = s;
    });

    const initial = useWorkspace.getState();
    if (initial.projectId) {
      useProjectData.getState().load(initial.projectId);
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
