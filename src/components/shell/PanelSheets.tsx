"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
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

function useLastInputWasKeyboard() {
  const keyboard = useRef(false);
  useEffect(() => {
    const onKey = () => {
      keyboard.current = true;
    };
    const onPointer = () => {
      keyboard.current = false;
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  return keyboard;
}

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
  const viaKeyboard = useLastInputWasKeyboard();
  const closeRef = useRef<HTMLButtonElement>(null);
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
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // A pick on the graph keeps focus there; from the keyboard the
          // drawer, portalled to the end of <body>, is otherwise out of reach.
          if (viaKeyboard.current) closeRef.current?.focus();
        }}
      >
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
          <DrawerTitle className="text-sm font-medium text-text">
            Inspector
          </DrawerTitle>
          <Tip label="Close" keys={["Esc"]}>
            <DrawerClose asChild>
              <Button
                ref={closeRef}
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        side="bottom"
        aria-describedby={undefined}
        className="h-[80dvh]"
        onOpenAutoFocus={(e) => {
          // The title, not the first field: focusing search would raise the
          // on-screen keyboard over the sheet.
          e.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DrawerTitle ref={titleRef} tabIndex={-1} className="sr-only">
          {title}
        </DrawerTitle>
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
