"use client";

import { FolderUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DURATION, ease } from "@/lib/motion";
import { MAX_UPLOAD_BYTES, entriesFromDrop } from "@/lib/upload";
import { useIngest, type IngestPhase } from "@/state/ingest";

const UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1_000_000);

const isBusy = (phase: IngestPhase) =>
  phase === "preparing" || phase === "running";

const carriesFiles = (e: DragEvent) =>
  e.dataTransfer?.types.includes("Files") ?? false;

async function analyzeDrop(dataTransfer: DataTransfer) {
  // entriesFromDrop reads the items synchronously before its first await,
  // which is the only window in which a DataTransfer is readable.
  const entries = await entriesFromDrop(dataTransfer).catch(() => null);
  if (!entries) {
    toast.error("Couldn't read the dropped folder");
    return;
  }
  await useIngest.getState().uploadEntries(entries);
}

/** Window-wide folder drop target. Text and link drags are ignored. */
export function DropOverlay() {
  const [active, setActive] = useState(false);
  const busy = useIngest((s) => isBusy(s.phase));

  useEffect(() => {
    // dragenter/dragleave fire for every child element crossed; count them.
    let depth = 0;
    const hide = () => {
      depth = 0;
      setActive(false);
    };
    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth += 1;
      setActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onOver = (e: DragEvent) => {
      if (!carriesFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = isBusy(useIngest.getState().phase)
        ? "none"
        : "copy";
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      if (!isBusy(useIngest.getState().phase)) void analyzeDrop(e.dataTransfer);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", hide, true);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", hide);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", hide, true);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", hide);
    };
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="drop-overlay"
          role="status"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={ease(DURATION.fast)}
          className="pointer-events-none fixed inset-0 z-[60] bg-bg/80 p-3"
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-accent/70 px-4 text-center">
            <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-1 shadow-raised">
              <FolderUp aria-hidden className="size-5 text-accent-ink" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-md font-medium text-text">
                {busy
                  ? "An analysis is already running"
                  : "Drop a folder to analyze it"}
              </p>
              <p className="text-sm text-text-muted">
                {busy
                  ? "Wait for it to finish, then drop the folder again."
                  : `TypeScript and JavaScript sources, up to ${UPLOAD_MB} MB`}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
