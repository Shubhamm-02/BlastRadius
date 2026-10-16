"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Explorer } from "@/components/explorer/Explorer";
import { Inspector } from "@/components/inspector/Inspector";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tip } from "@/components/ui/tooltip";
import type { PanelId } from "@/state/workspace";
import type { SheetState } from "./usePanelSheets";

type SetSheet = (panel: PanelId, open: boolean) => void;

/**
 * Inspector as a right drawer for 768-1279px. Non-modal so the graph stays
 * interactive behind it: picking another node retargets the open drawer.
 */
export function InspectorDrawer({
  open,
  setSheet,
}: {
  open: boolean;
  setSheet: SetSheet;
}) {
  return (
    <Drawer
      direction="right"
      modal={false}
      open={open}
      onOpenChange={(o) => setSheet("inspector", o)}
    >
      <DrawerContent
        side="right"
        aria-describedby={undefined}
        className="top-11"
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
          <DrawerTitle className="text-sm font-medium text-text">
            Inspector
          </DrawerTitle>
          <Tip label="Close" keys={["Esc"]}>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close inspector"
              >
                <X />
              </Button>
            </DrawerClose>
          </Tip>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <Inspector />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function BottomSheet({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  children: ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="bottom"
        aria-describedby={undefined}
        className="h-[80dvh]"
      >
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export function MobileSheets({
  sheets,
  setSheet,
}: {
  sheets: SheetState;
  setSheet: SetSheet;
}) {
  return (
    <>
      <BottomSheet
        title="Functions"
        open={sheets.explorer}
        onOpenChange={(o) => setSheet("explorer", o)}
      >
        <Explorer />
      </BottomSheet>
      <BottomSheet
        title="Inspector"
        open={sheets.inspector}
        onOpenChange={(o) => setSheet("inspector", o)}
      >
        <Inspector />
      </BottomSheet>
    </>
  );
}
