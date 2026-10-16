"use client";

import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DURATION, ease } from "@/lib/motion";
import { formatRepoRef, parseRepoRef } from "@/lib/repo-ref";
import { useIngest } from "@/state/ingest";
import { GitHubMark } from "./GitHubMark";

function describeInvalid(value: string): string {
  const input = value.trim();
  if (!input) return "Enter a repo as owner/repo.";
  if (/^https?:\/\//i.test(input) && !/github\.com/i.test(input)) {
    return "Only github.com repos are supported.";
  }
  if (
    !input.replace(/^(https?:\/\/)?(www\.)?github\.com\/?/i, "").includes("/")
  ) {
    return "Missing the repo name. Use owner/repo.";
  }
  return "Not a valid repo. Use owner/repo or a github.com URL.";
}

const statusMotion = {
  initial: { opacity: 0, y: -2 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: ease(DURATION.fast),
};

export function RepoForm() {
  const analyzeRepo = useIngest((s) => s.analyzeRepo);
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const repoRef = parseRepoRef(value);

  useEffect(() => {
    // Skip on touch screens, where focusing pops the keyboard over the hero.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!repoRef) {
      setError(describeInvalid(value));
      inputRef.current?.focus();
      return;
    }
    analyzeRepo(formatRepoRef(repoRef));
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = parseRepoRef(e.clipboardData.getData("text"));
    if (!pasted) return;
    e.preventDefault();
    setValue(formatRepoRef(pasted));
    setError("");
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="relative">
        <GitHubMark className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-dim" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          onPaste={onPaste}
          placeholder="owner/repo or GitHub URL"
          aria-label="GitHub repository"
          aria-invalid={!!error}
          aria-describedby={statusId}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="h-12 rounded-md pl-11 pr-14 font-mono text-md sm:pr-[108px] aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus-visible:border-danger/60"
        />
        <Button
          type="submit"
          variant="primary"
          className="absolute right-2 top-2 max-sm:px-2"
        >
          <span className="max-sm:sr-only">Analyze</span>
          <ArrowRight aria-hidden />
        </Button>
      </div>

      <div id={statusId} className="mt-2 flex min-h-5 items-center text-xs">
        <AnimatePresence mode="wait" initial={false}>
          {error ? (
            <motion.p
              key="error"
              role="alert"
              {...statusMotion}
              className="flex items-start gap-1.5 text-danger-ink"
            >
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {error}
            </motion.p>
          ) : repoRef ? (
            <motion.p
              key="parsed"
              {...statusMotion}
              className="inline-flex min-w-0 items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-1.5 leading-5 text-text-muted"
            >
              <Check className="size-3 shrink-0 text-ok" aria-hidden />
              <span className="truncate font-mono">
                {repoRef.owner}/{repoRef.repo}
              </span>
              <span className="shrink-0 text-text-dim">·</span>
              <span className="truncate font-mono text-text-dim">
                {repoRef.ref ?? "default branch"}
              </span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </form>
  );
}
