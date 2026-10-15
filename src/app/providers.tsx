"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/* "user": transforms and layout animations are skipped under prefers-reduced-motion; opacity still fades. */}
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={300} skipDelayDuration={100}>
          {children}
          <Toaster />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
