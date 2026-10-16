import {
  Crosshair,
  Database,
  FolderGit2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type KpiId = "visitors" | "repos" | "functions" | "projects";

interface Kpi {
  id: KpiId;
  label: string;
  icon: LucideIcon;
  swatch?: string;
}

export const KPIS: Kpi[] = [
  { id: "visitors", label: "Anonymous visitors", icon: Users },
  {
    id: "repos",
    label: "Repos analyzed",
    icon: FolderGit2,
    swatch: "bg-info",
  },
  {
    id: "functions",
    label: "Functions inspected",
    icon: Crosshair,
    swatch: "bg-accent",
  },
  { id: "projects", label: "Projects alive", icon: Database },
];

export function KpiCard({
  kpi: { label, icon: Icon, swatch },
  value,
  detail,
}: {
  kpi: Kpi;
  value: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-md border bg-surface-1 p-4 shadow-raised">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
          {swatch && (
            <span aria-hidden className={cn("size-2 rounded-sm", swatch)} />
          )}
          <span className="truncate">{label}</span>
        </span>
        <Icon
          aria-hidden
          className="hidden size-3.5 shrink-0 text-text-dim sm:block"
        />
      </div>
      <div className="mt-2 flex h-8 items-center text-xl font-semibold">
        {value}
      </div>
      <div className="mt-1 flex h-4 min-w-0 items-center text-xs text-text-dim">
        {detail}
      </div>
    </div>
  );
}
