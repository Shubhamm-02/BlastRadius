"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RequestError,
  getAnonId,
  isAbortError,
  messageOf,
  readJson,
  readNdjson,
} from "@/lib/client";
import type {
  IngestProgressEvent,
  IngestResult,
  IngestStreamEvent,
} from "@/lib/ingest";

const CODE_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;
const CONFIG_RE = /(^|\/)(tsconfig|jsconfig)[^/]*\.json$/i;
const SKIP = /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor)\//;
const MAX_UPLOAD_BYTES = 4_000_000; // stay under serverless request-body limits

/**
 * Sends a GitHub repo or a picked folder to /api/ingest, tracking streamed
 * progress. `error` (the ingest failed) and `warning` (it succeeded, but
 * partially) are separate so one never wipes the other.
 */
export function useIngest(onIngested: (result: IngestResult) => void) {
  const [ingesting, setIngesting] = useState(false);
  const [progress, setProgress] = useState<IngestProgressEvent | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const busy = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const onIngestedRef = useRef(onIngested);

  useEffect(() => {
    onIngestedRef.current = onIngested;
  }, [onIngested]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (payload: object, initialWarning = "") => {
    if (busy.current) return;
    busy.current = true;
    const ac = new AbortController();
    abortRef.current = ac;
    setIngesting(true);
    setError("");
    setWarning(initialWarning);
    setProgress(null);

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
          if (ev.stage === "error") {
            throw new RequestError(ev.error.message, ev.error.code, 500);
          }
          if (ev.stage === "done") result = ev.result;
          else setProgress(ev);
        });
      } else {
        result = await readJson<IngestResult>(res);
      }
      if (!result)
        throw new Error("The analysis ended unexpectedly. Please try again.");

      if (result.truncated) {
        setWarning(
          `Partial graph: analyzed ${result.files.kept} files, skipped ${result.files.skipped} over the size limits. Use the local CLI for full coverage.`,
        );
      }
      onIngestedRef.current(result);
    } catch (e) {
      if (!isAbortError(e)) setError(messageOf(e));
    } finally {
      busy.current = false;
      setIngesting(false);
      setProgress(null);
    }
  }, []);

  const analyzeRepo = useCallback(
    (repo: string) => {
      const r = repo.trim();
      if (r) void run({ repo: r });
    },
    [run],
  );

  const uploadFolder = useCallback(
    async (fileList: FileList) => {
      if (busy.current) return;
      const picked = Array.from(fileList).filter((f) => {
        const p = f.webkitRelativePath || f.name;
        const isCode = CODE_EXT.test(p) && !p.endsWith(".d.ts");
        return (isCode || CONFIG_RE.test(p)) && !SKIP.test(p);
      });
      if (picked.length === 0) {
        setWarning("");
        setError("No TypeScript/JavaScript files in that folder.");
        return;
      }

      try {
        const files: { path: string; content: string }[] = [];
        let total = 0;
        for (const f of picked) {
          if (total + f.size > MAX_UPLOAD_BYTES) break;
          const content = await f.text();
          total += content.length;
          // Strip the top-level folder name so ids match GitHub-style paths.
          const rel =
            (f.webkitRelativePath || f.name).split("/").slice(1).join("/") ||
            f.name;
          files.push({ path: rel, content });
        }
        const skipped = picked.length - files.length;
        const name =
          (picked[0].webkitRelativePath || "").split("/")[0] || "uploaded";
        await run(
          { files, name, skipped },
          skipped > 0
            ? `Folder exceeds ${MAX_UPLOAD_BYTES / 1e6} MB of code — uploading the first ${files.length} of ${picked.length} files.`
            : "",
        );
      } catch (e) {
        setError(messageOf(e));
      }
    },
    [run],
  );

  return { ingesting, progress, error, warning, analyzeRepo, uploadFolder };
}
