"use client";

import { AppShell } from "@/components/shell/AppShell";
import { WorkspaceEffects } from "@/state/effects";

export function Workspace({ projectHint }: { projectHint: boolean }) {
  return (
    <>
      <WorkspaceEffects />
      <AppShell projectHint={projectHint} />
    </>
  );
}
