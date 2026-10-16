import type { EdgeKind } from "@/lib/analyze";

export type { EdgeKind };

export const EDGE_KINDS: EdgeKind[] = ["call", "jsx", "new", "ref"];

export type GNode = { id: string; name: string; file: string; line: number };

export type GLink = {
  source: string | GNode;
  target: string | GNode;
  kinds: EdgeKind[];
};

export type GraphData = { nodes: GNode[]; links: GLink[] };

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export const linkEnd = (x: string | GNode): string =>
  typeof x === "object" ? x.id : x;
