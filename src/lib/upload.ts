const CODE_EXT = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;
const CONFIG_RE = /(^|\/)(tsconfig|jsconfig)[^/]*\.json$/i;
const SKIP =
  /(^|\/)(node_modules|dist|build|out|\.next|coverage|vendor|\.git)\//;
export const MAX_UPLOAD_BYTES = 4_000_000; // stays under serverless body limits

/** A picked or dropped file with its path relative to the chosen folder's parent. */
export interface UploadEntry {
  path: string;
  file: File;
}

export interface UploadPayload {
  name: string;
  files: { path: string; content: string }[];
  /** Matching files left out because of MAX_UPLOAD_BYTES. */
  skipped: number;
  matched: number;
}

export function entriesFromFileList(list: FileList | File[]): UploadEntry[] {
  return Array.from(list, (file) => ({
    path: file.webkitRelativePath || file.name,
    file,
  }));
}

/** Walks dropped folders (DataTransfer items) into flat entries. */
export async function entriesFromDrop(
  dt: DataTransfer,
): Promise<UploadEntry[]> {
  const roots = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  const out: UploadEntry[] = [];

  async function walk(entry: FileSystemEntry, prefix: string): Promise<void> {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej),
      );
      out.push({ path, file });
      return;
    }
    if (prefix && SKIP.test(path + "/")) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns at most ~100 entries per call; read until empty.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
        reader.readEntries(res, rej),
      );
      if (batch.length === 0) break;
      await Promise.all(batch.map((child) => walk(child, path)));
    }
  }

  await Promise.all(roots.map((r) => walk(r, "")));
  return out;
}

/**
 * Filters to TS/JS sources and tsconfigs, reads them up to the byte cap and
 * strips the top-level folder so ids match GitHub-style repo paths.
 */
export async function readUpload(
  entries: UploadEntry[],
): Promise<UploadPayload> {
  const picked = entries
    .filter(
      ({ path }) =>
        (CODE_EXT.test(path) && !path.endsWith(".d.ts")) ||
        CONFIG_RE.test(path),
    )
    // Only below the chosen root: a folder named build or out is still the project.
    .filter(({ path }) => !SKIP.test(path.slice(path.indexOf("/") + 1)))
    .sort((a, b) => a.path.localeCompare(b.path));

  const topLevel = picked[0]?.path.includes("/")
    ? picked[0].path.split("/")[0]
    : "";
  const singleRoot =
    !!topLevel && picked.every((e) => e.path.startsWith(topLevel + "/"));

  const files: UploadPayload["files"] = [];
  let total = 0;
  for (const { path, file } of picked) {
    if (total + file.size > MAX_UPLOAD_BYTES) break;
    total += file.size;
    files.push({
      path: singleRoot ? path.slice(topLevel.length + 1) : path,
      content: await file.text(),
    });
  }
  return {
    name: singleRoot ? topLevel : "uploaded",
    files,
    skipped: picked.length - files.length,
    matched: picked.length,
  };
}
