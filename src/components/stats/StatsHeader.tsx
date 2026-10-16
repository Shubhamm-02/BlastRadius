import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/shell/marks";
import { Button } from "@/components/ui/button";

export function StatsHeader({ status }: { status?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-bg">
      <div className="mx-auto flex h-11 max-w-[1100px] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="BlastRadius home"
          className="rounded-sm transition-opacity duration-fast ease-out hover:opacity-80"
        >
          <Wordmark />
        </Link>
        <span aria-hidden className="text-text-dim">
          /
        </span>
        <h1 className="text-sm font-medium text-text-muted">Usage</h1>
        <div className="ml-auto flex items-center gap-3">
          {status}
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft aria-hidden />
              <span className="hidden sm:inline">Back to app</span>
              <span className="sm:hidden">App</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
