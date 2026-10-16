"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-right"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-md !border !border-border !bg-surface-1 !text-text !shadow-overlay !font-sans !text-sm",
          description: "!text-text-muted",
          actionButton: "!bg-accent !text-accent-fg",
          cancelButton: "!bg-surface-3 !text-text",
        },
      }}
    />
  );
}
