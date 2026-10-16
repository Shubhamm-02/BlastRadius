import type { IngestStage } from "@/lib/ingest";
import {
  INGEST_STEPS,
  type IngestPhase,
  type IngestSource,
} from "@/state/ingest";

export type StepId = "read" | Exclude<IngestStage, "done"> | "done";
export type StepState = "pending" | "active" | "done" | "failed" | "stopped";

export interface IngestStep {
  id: StepId;
  label: string;
  state: StepState;
  detail?: string;
}

interface IngestSnapshot {
  phase: IngestPhase;
  source: IngestSource | null;
  stage: IngestStage | null;
  details: Partial<Record<IngestStage, string>>;
}

const numberFormat = new Intl.NumberFormat("en-US");

export const formatCount = (n: number) => numberFormat.format(n);

export function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function fileCountFrom(detail: string | undefined): number | null {
  const match = detail && /([\d,]+) files/.exec(detail);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function stepLabel(
  id: StepId,
  source: IngestSource | null,
  parseFiles: number | null,
): string {
  switch (id) {
    case "read":
      return "Reading files";
    case "fetch":
      return "Fetching repo";
    case "extract":
      return source?.kind === "upload"
        ? `Uploading ${formatCount(source.fileCount)} files`
        : "Extracting files";
    case "parse":
      return parseFiles
        ? `Parsing ${formatCount(parseFiles)} files`
        : "Parsing files";
    case "resolve":
      return "Resolving calls";
    case "write":
      return "Writing to AuraDB";
    case "done":
      return "Done";
  }
}

/**
 * Maps the ingest store onto the rows of the progress card. Uploads replace
 * "fetch" with the local "read" step; a missing source means the folder was
 * still being read when the run stopped.
 */
export function ingestSteps(
  { phase, source, stage, details }: IngestSnapshot,
  doneDetail?: string,
): IngestStep[] {
  const isUpload = source?.kind !== "github";
  const ids: StepId[] = isUpload
    ? ["read", ...INGEST_STEPS.filter((s) => s !== "fetch")]
    : [...INGEST_STEPS];
  const current: StepId =
    phase === "preparing" || !source ? "read" : (stage ?? ids[0]);
  const currentIndex =
    phase === "done" ? ids.length : Math.max(0, ids.indexOf(current));

  // The extract count only settles once extraction has finished.
  const parseFiles =
    source?.kind === "upload"
      ? source.fileCount
      : currentIndex > ids.indexOf("extract")
        ? fileCountFrom(details.extract)
        : null;

  const readDetail =
    source?.kind === "upload"
      ? `${formatCount(source.fileCount)} TypeScript and JavaScript files`
      : undefined;
  const activeState: StepState =
    phase === "error" ? "failed" : phase === "cancelled" ? "stopped" : "active";

  const steps = ids.map((id, i): IngestStep => {
    const state: StepState =
      i < currentIndex ? "done" : i === currentIndex ? activeState : "pending";
    const detail = id === "read" ? readDetail : details[id];
    return {
      id,
      label: stepLabel(id, source, parseFiles),
      state,
      detail: state === "pending" ? undefined : detail,
    };
  });

  steps.push({
    id: "done",
    label: stepLabel("done", source, parseFiles),
    state: phase === "done" ? "done" : "pending",
    detail: phase === "done" ? doneDetail : undefined,
  });
  return steps;
}
