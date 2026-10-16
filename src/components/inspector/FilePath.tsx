import { cn } from "@/lib/cn";

/** Truncates the directory before the basename, so the file name stays readable. */
export function FilePath({
  file,
  className,
}: {
  file: string;
  className?: string;
}) {
  const cut = file.lastIndexOf("/") + 1;
  return (
    <span className={cn("flex min-w-0 font-mono", className)} title={file}>
      {cut > 0 && (
        <span className="min-w-0 shrink-[100] truncate text-text-dim">
          {file.slice(0, cut)}
        </span>
      )}
      <span className="min-w-0 truncate text-text-muted">
        {file.slice(cut)}
      </span>
    </span>
  );
}
