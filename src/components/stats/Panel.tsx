import type { ReactNode } from "react";

export function Panel({
  title,
  caption,
  aside,
  children,
}: {
  title: string;
  caption?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-md border bg-surface-1 shadow-raised">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {caption && <span className="text-xs text-text-dim">{caption}</span>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
