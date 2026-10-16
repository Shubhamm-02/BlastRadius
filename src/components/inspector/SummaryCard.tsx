"use client";

import { Copy, ListChecks, RotateCw } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/tooltip";
import type { ImpactResult } from "@/lib/impact";
import { copyText } from "@/lib/share";
import { useImpact } from "@/state/impact";
import { prChecklist } from "./checklist";

function SummaryBody() {
  const summary = useImpact((s) => s.summary);
  const status = useImpact((s) => s.summaryStatus);
  const retrySummary = useImpact((s) => s.retrySummary);

  if (status === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-text-muted">
          Summary unavailable. {summary}
        </p>
        <Button variant="outline" size="sm" onClick={retrySummary}>
          <RotateCw />
          Retry
        </Button>
      </div>
    );
  }

  if (status === "done" && !summary) {
    return (
      <p className="text-sm text-text-muted">No summary for this function.</p>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col gap-2 py-1">
        <span className="sr-only">Writing summary</span>
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-3/5" />
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">
      {summary}
      {status === "streaming" && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-4 w-0.5 translate-y-[3px] animate-caret bg-accent"
        />
      )}
    </p>
  );
}

export function SummaryCard({ result }: { result: ImpactResult }) {
  const headingId = useId();
  const status = useImpact((s) => s.summaryStatus);

  const copySummary = () =>
    void copyText(useImpact.getState().summary, "Summary copied");
  const copyChecklist = () => {
    const { summary, summaryStatus } = useImpact.getState();
    void copyText(
      prChecklist(result, summaryStatus === "done" ? summary : ""),
      "PR checklist copied",
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={status === "streaming"}
      className="mx-4 mt-4 rounded-md border border-border bg-surface-2 shadow-raised"
    >
      <div className="flex items-center justify-between gap-2 py-1.5 pl-3 pr-1.5">
        <h3 id={headingId} className="text-xs font-medium text-text-dim">
          What to check
        </h3>
        <Tip label="Copy summary">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Copy summary"
            disabled={status !== "done"}
            onClick={copySummary}
          >
            <Copy />
          </Button>
        </Tip>
      </div>
      <div className="px-3 pb-3">
        <SummaryBody />
      </div>
      <div className="border-t border-border px-1.5 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={copyChecklist}
        >
          <ListChecks />
          Copy as PR checklist
        </Button>
      </div>
    </section>
  );
}
