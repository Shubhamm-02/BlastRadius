"use client";

import { FolderUp } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { DURATION, ease } from "@/lib/motion";
import { MAX_UPLOAD_BYTES } from "@/lib/upload";
import { useIngest } from "@/state/ingest";
import { RepoForm } from "./RepoForm";
import { useFolderPicker } from "./useFolderPicker";

const EXAMPLE_REPOS = [
  "pmndrs/zustand",
  "sindresorhus/ky",
  "pmndrs/jotai",
  "honojs/hono",
];

export function Hero() {
  const analyzeRepo = useIngest((s) => s.analyzeRepo);
  const folderPicker = useFolderPicker();

  return (
    // No entrance animation: the hero is server-rendered and is the page's
    // largest paint. Onboarding's wrapper fades it in on later visits.
    <motion.section
      aria-labelledby="hero-title"
      exit={{ opacity: 0, transition: ease(DURATION.fast) }}
      className="w-full max-w-[560px]"
    >
      <h1
        id="hero-title"
        className="text-balance text-xl font-semibold text-text"
      >
        See what breaks before you change it.
      </h1>
      <p className="mt-3 text-md text-text-muted">
        BlastRadius parses a TypeScript or JavaScript repo into a call graph.
        Select any function to see every caller it would affect.
      </p>

      <div className="mt-8">
        <RepoForm />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="outline" onClick={folderPicker.open}>
          <FolderUp />
          Upload folder
        </Button>
        <span className="text-sm text-text-dim">or drop a folder anywhere</span>
        {folderPicker.input}
      </div>

      <div className="mt-8 border-t border-border pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-text-dim">Examples</span>
          {EXAMPLE_REPOS.map((repo) => (
            <Button
              key={repo}
              variant="outline"
              size="sm"
              onClick={() => analyzeRepo(repo)}
              className="font-mono text-xs text-text-muted hover:text-text"
            >
              {repo}
            </Button>
          ))}
        </div>
        <p className="mt-4 text-xs text-text-dim">
          Public repos up to 250 MB, first 2,000 source files. Folders up to{" "}
          {MAX_UPLOAD_BYTES / 1_000_000} MB of code.
        </p>
      </div>
    </motion.section>
  );
}
