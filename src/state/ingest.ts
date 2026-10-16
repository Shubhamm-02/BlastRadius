"use client";

import { create } from "zustand";
import {
  RequestError,
  getAnonId,
  isAbortError,
  messageOf,
  readJson,
  readNdjson,
} from "@/lib/client";
import type {
  IngestResult,
  IngestStage,
  IngestStreamEvent,
} from "@/lib/ingest";
import { MAX_UPLOAD_BYTES, readUpload, type UploadEntry } from "@/lib/upload";
import { useWorkspace } from "./workspace";

export type IngestPhase =
  "idle" | "preparing" | "running" | "done" | "error" | "cancelled";

export type IngestSource =
  | { kind: "github"; repo: string }
  | { kind: "upload"; name: string; fileCount: number };

/** Steps shown in the progress card, in order. Uploads skip "fetch". */
export const INGEST_STEPS: Exclude<IngestStage, "done">[] = [
  "fetch",
  "extract",
  "parse",
  "resolve",
  "write",
];

interface IngestState {
  phase: IngestPhase;
  source: IngestSource | null;
  stage: IngestStage | null;
  /** Overall 0..1, never decreases within a run. */
  progress: number;
  /** Latest detail line per stage, e.g. "Resolved 120 edges in 40/412 files". */
  details: Partial<Record<IngestStage, string>>;
  startedAt: number | null;
  finishedAt: number | null;
  error: string;
  /** The run succeeded but dropped files over the size limits. */
  warning: string;
  result: IngestResult | null;
  analyzeRepo(repo: string): void;
  uploadEntries(entries: UploadEntry[]): Promise<void>;
  cancel(): void;
  /** Back to idle after the success animation or a dismissed error. */
  reset(): void;
}

let inflight: AbortController | null = null;

/** Back to the start screen; also drops a stale error from an earlier attempt. */
export function startNewAnalysis() {
  useIngest.getState().reset();
  useWorkspace.getState().setProject(null);
}
// Bumped on every upload, cancel and reset so a folder read that finishes
// late cannot start or fail a run it no longer belongs to.
let uploadGen = 0;

const busy = (phase: IngestPhase) =>
  phase === "preparing" || phase === "running";

export const useIngest = create<IngestState>()((set, get) => {
  async function run(payload: object, source: IngestSource, warning = "") {
    inflight?.abort();
    const ac = new AbortController();
    inflight = ac;
    set({
      phase: "running",
      source,
      stage: source.kind === "github" ? "fetch" : "extract",
      progress: 0,
      details: {},
      startedAt: get().startedAt ?? Date.now(),
      finishedAt: null,
      error: "",
      warning,
      result: null,
    });

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({ ...payload, anonId: getAnonId() }),
        signal: ac.signal,
      });

      let result: IngestResult | undefined;
      const streamed = res.headers
        .get("content-type")
        ?.includes("application/x-ndjson");
      if (res.ok && streamed && res.body) {
        await readNdjson<IngestStreamEvent>(res.body, (ev) => {
          if (ev.stage === "error")
            throw new RequestError(ev.error.message, ev.error.code, 500);
          if (ev.stage === "done") {
            result = ev.result;
            return;
          }
          set((s) => ({
            stage: ev.stage,
            progress: Math.max(s.progress, ev.progress),
            details: { ...s.details, [ev.stage]: ev.detail },
          }));
        });
      } else {
        result = await readJson<IngestResult>(res);
      }
      if (!result)
        throw new Error("The analysis ended before finishing. Try again.");

      const done = result;
      set({
        phase: "done",
        stage: "done",
        progress: 1,
        finishedAt: Date.now(),
        result: done,
        warning: done.truncated
          ? `Partial graph: ${done.files.kept} files analyzed, ${done.files.skipped} skipped over the size limit. Use the CLI for full coverage.`
          : "",
      });
      useWorkspace.getState().setProject(done.projectId);
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) return;
      set({ phase: "error", error: messageOf(e), finishedAt: Date.now() });
    }
  }

  return {
    phase: "idle",
    source: null,
    stage: null,
    progress: 0,
    details: {},
    startedAt: null,
    finishedAt: null,
    error: "",
    warning: "",
    result: null,

    analyzeRepo(repo) {
      const r = repo.trim();
      if (!r || busy(get().phase)) return;
      set({ startedAt: Date.now() });
      void run({ repo: r }, { kind: "github", repo: r });
    },

    async uploadEntries(entries) {
      if (busy(get().phase)) return;
      const gen = ++uploadGen;
      set({
        phase: "preparing",
        source: null,
        stage: null,
        progress: 0,
        details: {},
        startedAt: Date.now(),
        finishedAt: null,
        error: "",
        warning: "",
        result: null,
      });
      try {
        const upload = await readUpload(entries);
        if (gen !== uploadGen) return;
        if (upload.files.length === 0) {
          set({
            phase: "error",
            error: "No TypeScript or JavaScript files in that folder.",
            finishedAt: Date.now(),
          });
          return;
        }
        await run(
          { files: upload.files, name: upload.name, skipped: upload.skipped },
          { kind: "upload", name: upload.name, fileCount: upload.files.length },
          upload.skipped > 0
            ? `Folder is over ${MAX_UPLOAD_BYTES / 1_000_000} MB of code: uploading ${upload.files.length} of ${upload.matched} files.`
            : "",
        );
      } catch (e) {
        if (gen !== uploadGen) return;
        set({ phase: "error", error: messageOf(e), finishedAt: Date.now() });
      }
    },

    cancel() {
      if (!busy(get().phase)) return;
      uploadGen++;
      inflight?.abort();
      set({ phase: "cancelled", finishedAt: Date.now() });
    },

    reset() {
      if (busy(get().phase)) return;
      uploadGen++;
      set({
        phase: "idle",
        source: null,
        stage: null,
        progress: 0,
        details: {},
        startedAt: null,
        finishedAt: null,
        error: "",
        result: null,
      });
    },
  };
});
