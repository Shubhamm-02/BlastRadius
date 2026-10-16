import type { Degree } from "@/lib/graph-metrics";
import type { GNode } from "@/lib/graph-types";
import { fuzzyScore, substringScore } from "@/lib/fuzzy";

export interface FileEntry {
  file: string;
  lower: string;
  /** Sorted by line. */
  fns: GNode[];
}

interface SearchIndex {
  nodes: GNode[];
  nameLower: string[];
  fileLower: string[];
  files: FileEntry[];
  fileByPath: Map<string, FileEntry>;
}

export interface Ranked<T> {
  items: T[];
  total: number;
}

const FUNCTION_LIMIT = 50;
const FILE_LIMIT = 6;
const IN_FILE_LIMIT = 200;
const MOST_CALLED_LIMIT = 6;
// A file-path hit counts for less than a name hit, so "parse" ranks parseX() above
// every function that merely lives in parser.ts.
const FILE_HIT_WEIGHT = 0.5;

// Keyed by the graph arrays themselves, so each loaded graph is indexed once.
const indexCache = new WeakMap<GNode[], SearchIndex>();
const mostCalledCache = new WeakMap<Map<string, Degree>, string[]>();

export function searchIndex(nodes: GNode[]): SearchIndex {
  const cached = indexCache.get(nodes);
  if (cached) return cached;

  const fileByPath = new Map<string, FileEntry>();
  const fileLower: string[] = [];
  for (const node of nodes) {
    let entry = fileByPath.get(node.file);
    if (!entry) {
      entry = { file: node.file, lower: node.file.toLowerCase(), fns: [] };
      fileByPath.set(node.file, entry);
    }
    entry.fns.push(node);
    fileLower.push(entry.lower);
  }
  const files = [...fileByPath.values()];
  for (const entry of files) entry.fns.sort((a, b) => a.line - b.line);
  files.sort((a, b) => a.file.localeCompare(b.file));

  const index: SearchIndex = {
    nodes,
    nameLower: nodes.map((n) => n.name.toLowerCase()),
    fileLower,
    files,
    fileByPath,
  };
  indexCache.set(nodes, index);
  return index;
}

/** Every token must match; scores add up across tokens. */
function scoreAll(tokens: string[], scoreToken: (token: string) => number) {
  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(token);
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

function topByScore<T>(
  scored: { item: T; score: number; size: number }[],
  limit: number,
): Ranked<T> {
  scored.sort((a, b) => b.score - a.score || a.size - b.size);
  return {
    items: scored.slice(0, limit).map((s) => s.item),
    total: scored.length,
  };
}

export function rankFunctions(
  index: SearchIndex,
  tokens: string[],
  limit = FUNCTION_LIMIT,
): Ranked<GNode> {
  const scored: { item: GNode; score: number; size: number }[] = [];
  const { nodes, nameLower, fileLower } = index;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const total = scoreAll(tokens, (token) =>
      Math.max(
        fuzzyScore(token, node.name, nameLower[i]),
        substringScore(token, node.file, fileLower[i]) * FILE_HIT_WEIGHT,
      ),
    );
    if (total > 0)
      scored.push({ item: node, score: total, size: node.name.length });
  }
  return topByScore(scored, limit);
}

/** Mirrors rankFunctions per token, so a path hit is shown in the path, not the name. */
export function functionHighlights(node: GNode, tokens: string[]) {
  const nameLower = node.name.toLowerCase();
  const fileLower = node.file.toLowerCase();
  const name: number[] = [];
  const file: number[] = [];
  for (const token of tokens) {
    const byName = fuzzyScore(token, node.name, nameLower);
    const byFile =
      substringScore(token, node.file, fileLower) * FILE_HIT_WEIGHT;
    if (byName >= byFile) fuzzyScore(token, node.name, nameLower, name);
    else substringScore(token, node.file, fileLower, file);
  }
  return { name: new Set(name), file: new Set(file) };
}

export function rankFiles(
  index: SearchIndex,
  tokens: string[],
): Ranked<FileEntry> {
  const scored: { item: FileEntry; score: number; size: number }[] = [];
  for (const entry of index.files) {
    const total = scoreAll(tokens, (token) =>
      fuzzyScore(token, entry.file, entry.lower),
    );
    if (total > 0)
      scored.push({ item: entry, score: total, size: entry.file.length });
  }
  return topByScore(scored, FILE_LIMIT);
}

export function rankInFile(entry: FileEntry, tokens: string[]): GNode[] {
  if (tokens.length === 0) return entry.fns.slice(0, IN_FILE_LIMIT);
  const scored: { item: GNode; score: number; size: number }[] = [];
  for (const node of entry.fns) {
    const lower = node.name.toLowerCase();
    const total = scoreAll(tokens, (token) =>
      fuzzyScore(token, node.name, lower),
    );
    if (total > 0) scored.push({ item: node, score: total, size: node.line });
  }
  return topByScore(scored, IN_FILE_LIMIT).items;
}

/** Functions with the most callers; a useful starting point before anything is typed. */
export function mostCalled(degree: Map<string, Degree>): string[] {
  const cached = mostCalledCache.get(degree);
  if (cached) return cached;
  const top: [string, number][] = [];
  for (const [id, d] of degree) {
    if (d.in === 0) continue;
    if (top.length < MOST_CALLED_LIMIT || d.in > top[top.length - 1][1]) {
      top.push([id, d.in]);
      top.sort((a, b) => b[1] - a[1]);
      if (top.length > MOST_CALLED_LIMIT) top.pop();
    }
  }
  const ids = top.map(([id]) => id);
  mostCalledCache.set(degree, ids);
  return ids;
}
