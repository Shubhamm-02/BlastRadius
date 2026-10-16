"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { useShortcuts } from "@/components/palette/useShortcuts";
import { useWorkspace } from "@/state/workspace";
import { ImpactAnnouncer } from "@/components/inspector/ImpactAnnouncer";
import { DropOverlay } from "./DropOverlay";
import { MobileBar } from "./MobileBar";
import { SidePanel } from "./SidePanel";
import { TopBar } from "./TopBar";
import { useBreakpoint } from "./useBreakpoint";
import { usePanelSheets } from "./usePanelSheets";
import { usePersistedPanels } from "./useShellLayout";

// Workspace panels, overlays and drawers stay out of the first-load bundle:
// the empty state's largest paint shouldn't wait on code it can't use yet.
// With a shared ?projectId= link the panels still server-render.
const Explorer = dynamic(() =>
  import("@/components/explorer/Explorer").then((m) => m.Explorer),
);
const Inspector = dynamic(() =>
  import("@/components/inspector/Inspector").then((m) => m.Inspector),
);
const GraphStage = dynamic(() =>
  import("@/components/graph/GraphStage").then((m) => m.GraphStage),
);
const loadPalette = () =>
  import("@/components/palette/CommandPalette").then((m) => m.CommandPalette);
const loadShortcuts = () =>
  import("@/components/palette/ShortcutsSheet").then((m) => m.ShortcutsSheet);
const CommandPalette = dynamic(loadPalette, { ssr: false });
const ShortcutsSheet = dynamic(loadShortcuts, { ssr: false });
const InspectorDrawer = dynamic(
  () => import("./PanelSheets").then((m) => m.InspectorDrawer),
  { ssr: false },
);
const MobileSheets = dynamic(
  () => import("./PanelSheets").then((m) => m.MobileSheets),
  { ssr: false },
);

/** Fetch the overlay chunks once the page is idle so the first open is instant. */
function usePrefetchOverlays() {
  useEffect(() => {
    const prefetch = () => {
      void loadPalette();
      void loadShortcuts();
    };
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(prefetch, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(prefetch, 2000);
    return () => clearTimeout(id);
  }, []);
}

/** True from the first time `value` is true; mounts an overlay on first use. */
function useOnceTrue(value: boolean): boolean {
  const [seen, setSeen] = useState(value);
  if (value && !seen) setSeen(true);
  return seen || value;
}

// Its own component so opening the palette or the shortcuts sheet doesn't
// re-render the panels.
function Overlays() {
  const paletteUsed = useOnceTrue(useWorkspace((s) => s.paletteOpen));
  const shortcutsUsed = useOnceTrue(useWorkspace((s) => s.shortcutsOpen));
  return (
    <>
      {paletteUsed && <CommandPalette />}
      {shortcutsUsed && <ShortcutsSheet />}
    </>
  );
}

/**
 * `projectHint` is true when the request URL carried ?projectId=. The store
 * only learns the project in an effect, so the hint keeps the side panels in
 * the first server paint instead of popping them in after hydration.
 */
export function AppShell({ projectHint }: { projectHint: boolean }) {
  useShortcuts();
  usePrefetchOverlays();

  const bp = useBreakpoint();
  const projectId = useWorkspace((s) => s.projectId);
  const panels = useWorkspace((s) => s.panels);
  const [hintPending, setHintPending] = useState(projectHint);
  const { sheets, setSheet } = usePanelSheets(bp);
  usePersistedPanels(bp);

  useEffect(() => setHintPending(false), []);

  const hasProject = projectId !== null || hintPending;
  // Stays mounted after "Analyze another repo" so panels collapse with content.
  const workspaceUsed = useOnceTrue(hasProject);
  // Before the breakpoint resolves, panels render and CSS hides the ones that
  // don't apply; after, only the applicable ones mount so Explorer and
  // Inspector never exist twice.
  const explorerDocked = bp !== "mobile";
  const inspectorDocked = bp === null || bp === "desktop";
  const inspectorOpen = bp === "desktop" ? panels.inspector : sheets.inspector;

  return (
    // No background: body paints bg-bg and the grain layer sits between it and the shell.
    <div className="relative z-[1] flex h-dvh w-full flex-col overflow-hidden">
      <TopBar
        hasProject={hasProject}
        inspectorOpen={inspectorOpen}
        inspectorDocked={inspectorDocked}
      />
      <div className="flex min-h-0 flex-1">
        {explorerDocked && (
          <SidePanel
            panel="explorer"
            side="left"
            label="Explorer"
            open={hasProject && panels.explorer}
            className="hidden md:block"
          >
            {workspaceUsed && <Explorer />}
          </SidePanel>
        )}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {workspaceUsed && <GraphStage />}
          <Onboarding projectPending={hintPending} />
        </main>
        {inspectorDocked && (
          <SidePanel
            panel="inspector"
            side="right"
            label="Inspector"
            open={hasProject && panels.inspector}
            className="hidden xl:block"
          >
            {workspaceUsed && <Inspector />}
          </SidePanel>
        )}
      </div>
      {hasProject && (bp === null || bp === "mobile") && (
        <MobileBar sheets={sheets} setSheet={setSheet} />
      )}
      {hasProject && bp === "tablet" && (
        <InspectorDrawer open={sheets.inspector} setSheet={setSheet} />
      )}
      {hasProject && bp === "mobile" && (
        <MobileSheets sheets={sheets} setSheet={setSheet} />
      )}
      {workspaceUsed && <ImpactAnnouncer />}
      <DropOverlay />
      <Overlays />
    </div>
  );
}
