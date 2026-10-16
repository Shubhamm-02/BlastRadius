"use client";

import { ListTree, PanelBottom, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useWorkspace, type PanelId } from "@/state/workspace";
import type { SheetState } from "./usePanelSheets";

type SetSheet = (panel: PanelId, open: boolean) => void;

function BarButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={pressed}
      onClick={onClick}
      className="h-9 flex-1 aria-pressed:bg-surface-3 aria-pressed:text-text"
    >
      {children}
      {label}
    </Button>
  );
}

/** Below 768px the graph is full-bleed; panels open from this bar as sheets. */
export function MobileBar({
  sheets,
  setSheet,
}: {
  sheets: SheetState;
  setSheet: SetSheet;
}) {
  const hasSelection = useWorkspace((s) => s.selectedId !== null);
  return (
    <nav
      aria-label="Panels"
      className="flex shrink-0 items-center gap-1 border-t border-border bg-surface-1 p-1.5 md:hidden"
    >
      <BarButton
        label="Functions"
        pressed={sheets.explorer}
        onClick={() => setSheet("explorer", !sheets.explorer)}
      >
        <ListTree />
      </BarButton>
      <BarButton
        label="Search"
        onClick={() => useWorkspace.getState().setPaletteOpen(true)}
      >
        <Search />
      </BarButton>
      <BarButton
        label="Inspector"
        pressed={sheets.inspector}
        onClick={() => setSheet("inspector", !sheets.inspector)}
      >
        <span className="relative">
          <PanelBottom />
          <span
            aria-hidden
            className={cn(
              "absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-accent transition-opacity duration-fast ease-out",
              !hasSelection && "opacity-0",
            )}
          />
        </span>
      </BarButton>
    </nav>
  );
}
