import type { GNode } from "@/lib/graph-types";

export interface FunctionIndex {
  /** Alphabetical by name, so a stable sort by score keeps ties alphabetical. */
  nodes: GNode[];
  names: string[];
  files: string[];
  /** Scratch buffer reused across queries so a 10k-node search allocates no per-hit objects. */
  scores: Float64Array;
}

export interface MatchMarks {
  name: number[];
  file: number[];
}

const TIER = 1_000_000;

const run = (from: number, length: number) =>
  Array.from({ length }, (_, i) => from + i);

export const normalizeQuery = (query: string) => query.trim().toLowerCase();

export function buildFunctionIndex(nodes: GNode[]): FunctionIndex {
  const keyed = nodes.map((node) => ({
    node,
    name: node.name.toLowerCase(),
    file: node.file.toLowerCase(),
  }));
  keyed.sort((a, b) =>
    a.name !== b.name
      ? a.name < b.name
        ? -1
        : 1
      : a.file !== b.file
        ? a.file < b.file
          ? -1
          : 1
        : a.node.line - b.node.line,
  );
  return {
    nodes: keyed.map((k) => k.node),
    names: keyed.map((k) => k.name),
    files: keyed.map((k) => k.file),
    scores: new Float64Array(keyed.length),
  };
}

/** A match starting a camelCase hump or after a separator reads as intentional. */
function atWordStart(name: string, at: number) {
  const prev = name[at - 1];
  if (prev === "_" || prev === "$" || prev === ".") return true;
  const ch = name[at];
  return ch !== ch.toLowerCase() && prev === prev.toLowerCase();
}

function subsequence(text: string, query: string): number[] | null {
  const positions: number[] = [];
  let from = 0;
  for (const ch of query) {
    const at = text.indexOf(ch, from);
    if (at < 0) return null;
    positions.push(at);
    from = at + 1;
  }
  return positions;
}

function subsequenceGaps(text: string, query: string) {
  let from = 0;
  let first = -1;
  for (let i = 0; i < query.length; i++) {
    const at = text.indexOf(query[i], from);
    if (at < 0) return -1;
    if (i === 0) first = at;
    from = at + 1;
  }
  return from - first - query.length;
}

/**
 * Lower is better; -1 means no match. Tiers: name prefix, name substring
 * (word starts first), name subsequence, then file path substring.
 */
function scoreOf(node: GNode, name: string, file: string, query: string) {
  const at = name.indexOf(query);
  if (at === 0) return name.length;
  if (at > 0) {
    const midWord = atWordStart(node.name, at) ? 0 : TIER / 2;
    return TIER + midWord + at * 64 + name.length;
  }
  const gaps = subsequenceGaps(name, query);
  if (gaps >= 0) return 2 * TIER + gaps * 64 + name.length;
  const fileAt = file.lastIndexOf(query);
  // Matches near the basename beat matches in a parent folder.
  if (fileAt >= 0) return 3 * TIER + file.length - fileAt - query.length;
  return -1;
}

export function searchFunctions(index: FunctionIndex, query: string): GNode[] {
  if (!query) return index.nodes;
  const { nodes, names, files, scores } = index;
  const hits: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const score = scoreOf(nodes[i], names[i], files[i], query);
    if (score < 0) continue;
    scores[i] = score;
    hits.push(i);
  }
  hits.sort((a, b) => scores[a] - scores[b] || a - b);
  return hits.map((i) => nodes[i]);
}

/** Character positions to highlight for a rendered row; mirrors scoreOf's tiers. */
export function matchMarks(node: GNode, query: string): MatchMarks {
  const none: MatchMarks = { name: [], file: [] };
  if (!query) return none;
  const name = node.name.toLowerCase();
  const at = name.indexOf(query);
  if (at >= 0) {
    return { name: run(at, query.length), file: [] };
  }
  const positions = subsequence(name, query);
  if (positions) return { name: positions, file: [] };
  const fileAt = node.file.toLowerCase().lastIndexOf(query);
  return fileAt >= 0 ? { name: [], file: run(fileAt, query.length) } : none;
}
