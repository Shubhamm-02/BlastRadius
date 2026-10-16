"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { DURATION, ease } from "@/lib/motion";
import { useIngest } from "@/state/ingest";
import { useWorkspace } from "@/state/workspace";
import { Backdrop } from "./Backdrop";
import { Hero } from "./Hero";
import { IngestProgress } from "./IngestProgress";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: ease(DURATION.slow),
};

// The inline card covers failures while the tab is in view; a toast is only
// worth it when the run fails in a background tab.
function useBackgroundFailureToast() {
  useEffect(
    () =>
      useIngest.subscribe((s, prev) => {
        if (s.phase !== "error" || prev.phase === "error" || !document.hidden) {
          return;
        }
        const source = s.source;
        toast.error("Analysis failed", {
          description: s.error,
          action:
            source?.kind === "github"
              ? {
                  label: "Retry",
                  onClick: () => useIngest.getState().analyzeRepo(source.repo),
                }
              : undefined,
        });
      }),
    [],
  );
}

/**
 * `projectPending` is true until a shared ?projectId= link reaches the store,
 * so the hero doesn't flash over a graph that is about to load. Without it
 * the hero is server-rendered and visible on first paint (it is the LCP).
 */
export function Onboarding({ projectPending }: { projectPending: boolean }) {
  const projectId = useWorkspace((s) => s.projectId);
  const phase = useIngest((s) => s.phase);
  useBackgroundFailureToast();

  const showCard = phase !== "idle";
  const showHero = !projectId && !showCard;
  // With a project set, a graph is on screen or loading behind the card.
  const overGraph = projectId !== null;

  return (
    <AnimatePresence initial={false}>
      {!projectPending && (showCard || showHero) && (
        <motion.div
          key="onboarding"
          {...fade}
          className="absolute inset-0 z-20"
        >
          <AnimatePresence initial={false}>
            {overGraph ? (
              <motion.div
                key="scrim"
                {...fade}
                className="absolute inset-0 bg-bg/75"
              />
            ) : (
              <motion.div
                key="backdrop"
                {...fade}
                className="absolute inset-0 bg-bg"
              >
                <Backdrop />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="scrollbar-thin absolute inset-0 overflow-y-auto overflow-x-hidden">
            <div className="flex min-h-full items-center justify-center px-4 py-10 sm:pb-[12vh]">
              <AnimatePresence mode="wait">
                {showCard ? (
                  <IngestProgress key="progress" />
                ) : (
                  <Hero key="hero" />
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
