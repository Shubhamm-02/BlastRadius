import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/shell/marks";

export function StatusScreen({
  code,
  title,
  description,
  actions,
}: {
  code: ReactNode;
  title: string;
  description: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="flex h-11 shrink-0 items-center border-b px-3">
        <Link
          href="/"
          aria-label="BlastRadius home"
          className="rounded-sm transition-opacity duration-fast ease-out hover:opacity-80"
        >
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-md border bg-surface-1 p-6 shadow-raised">
          <p className="font-mono text-xs text-text-dim">{code}</p>
          <h1 className="mt-2 text-md font-semibold tracking-tight">{title}</h1>
          <div className="mt-1.5 text-sm text-text-muted">{description}</div>
          <div className="mt-5 flex flex-wrap gap-2">{actions}</div>
        </div>
      </main>
    </div>
  );
}
