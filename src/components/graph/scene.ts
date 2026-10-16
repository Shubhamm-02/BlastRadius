import { clusterOf, type Degree } from "@/lib/graph-metrics";
import {
  linkEnd,
  type EdgeKind,
  type GNode,
  type GraphData,
} from "@/lib/graph-types";
import type { CanvasPalette } from "@/lib/palette";
import {
  RING_GAP_MS,
  RING_MS,
  easeOut,
  focusMix,
  hopAlpha,
  lerp,
  litProgress,
  progress,
  type ModeFade,
} from "./blast";

export type SimNode = GNode & {
  x?: number;
  y?: number;
  radius: number;
  cluster: number;
  /** Label width at LABEL_PX, measured once. */
  labelWidth?: number;
};

export type SimLink = {
  source: string | SimNode;
  target: string | SimNode;
  sourceId: string;
  targetId: string;
  kind: EdgeKind;
};

export interface SimGraph {
  nodes: SimNode[];
  links: SimLink[];
  byId: Map<string, SimNode>;
  linksOf: Map<string, SimLink[]>;
}

const CLUSTER_COLORS = 8;
const MAX_RADIUS = 14;
const EDGE_TOKEN: Record<EdgeKind, string> = {
  call: "edge-call",
  jsx: "edge-jsx",
  new: "edge-new",
  ref: "edge-ref",
};
const CLUSTER_TOKEN = Array.from(
  { length: CLUSTER_COLORS },
  (_, i) => `cluster-${i + 1}`,
);

const nodeRadius = (inDegree: number) =>
  Math.min(MAX_RADIUS, 3 + 2.2 * Math.sqrt(inDegree));

/**
 * Copies the project graph for the simulation, which mutates nodes (x, y) and
 * links (source/target become objects). Largest clusters get the first colors
 * so the dominant folders stay distinguishable.
 */
export function buildSimGraph(
  graph: GraphData,
  degree: Map<string, Degree>,
): SimGraph {
  const clusterSize = new Map<string, number>();
  for (const n of graph.nodes) {
    const key = clusterOf(n.file);
    clusterSize.set(key, (clusterSize.get(key) ?? 0) + 1);
  }
  const clusterIndex = new Map(
    [...clusterSize]
      .sort((a, b) => b[1] - a[1])
      .map(([key], i) => [key, i % CLUSTER_COLORS]),
  );

  const nodes: SimNode[] = graph.nodes.map((n) => ({
    id: n.id,
    name: n.name,
    file: n.file,
    line: n.line,
    radius: nodeRadius(degree.get(n.id)?.in ?? 0),
    cluster: clusterIndex.get(clusterOf(n.file)) ?? 0,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const links: SimLink[] = [];
  const linksOf = new Map<string, SimLink[]>();
  for (const l of graph.links) {
    const sourceId = linkEnd(l.source);
    const targetId = linkEnd(l.target);
    if (!byId.has(sourceId) || !byId.has(targetId)) continue;
    const callEdge: SimLink = {
      source: sourceId,
      target: targetId,
      sourceId,
      targetId,
      kind: l.kinds[0] ?? "call",
    };
    links.push(callEdge);
    for (const id of [sourceId, targetId]) {
      const list = linksOf.get(id);
      if (list) list.push(callEdge);
      else linksOf.set(id, [callEdge]);
    }
  }
  return { nodes, links, byId, linksOf };
}

export type Tone = (token: string, alpha: number) => string;

/**
 * palette.rgba reads computed styles on every call, far too slow for a paint
 * loop over thousands of edges. Alpha is quantized so the cache stays small
 * and force-graph can batch edges that share a color.
 */
export function createTone(palette: CanvasPalette): Tone {
  const cache = new Map<string, string[]>();
  return (token, alpha) => {
    const i = Math.round(Math.min(1, Math.max(0, alpha)) * 40);
    let row = cache.get(token);
    if (!row) cache.set(token, (row = new Array<string>(41)));
    return (row[i] ??= palette.rgba(token, i / 40));
  };
}

interface ViewBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Mutable render state read by the paint callbacks; never triggers React renders. */
export interface Scene {
  tone: Tone | null;
  monoFont: string;
  labelFont: string;
  /** Graph-space viewport for the current frame; null paints every node. */
  view: ViewBox | null;
  now: number;
  zoom: number;
  reduced: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  hoverNeighbors: Set<string>;
  hops: Map<string, number>;
  litAt: Map<string, number>;
  ringAt: number | null;
  mode: ModeFade;
}

export function createScene(): Scene {
  return {
    tone: null,
    monoFont: "ui-monospace, monospace",
    labelFont: "",
    view: null,
    now: 0,
    zoom: 1,
    reduced: false,
    selectedId: null,
    hoveredId: null,
    hoverNeighbors: new Set(),
    hops: new Map(),
    litAt: new Map(),
    ringAt: null,
    mode: { from: 0, to: 0, at: 0 },
  };
}

export const inBlast = (scene: Scene, id: string) =>
  id === scene.selectedId || scene.hops.has(id);

const litOf = (scene: Scene, id: string) =>
  id === scene.selectedId ? 1 : litProgress(scene.litAt, id, scene.now);

const sceneFocus = (scene: Scene) =>
  focusMix(scene.mode, scene.now, scene.reduced);

interface NodeLook {
  base: string;
  baseAlpha: number;
  lit: string | null;
  litAlpha: number;
}

export function nodeLook(scene: Scene, node: SimNode): NodeLook {
  const focus = sceneFocus(scene);
  const cluster = CLUSTER_TOKEN[node.cluster];
  const near = node.id === scene.hoveredId || scene.hoverNeighbors.has(node.id);

  if (!scene.selectedId) {
    const alpha = near ? 1 : lerp(0.9, 0.3, focus);
    return { base: cluster, baseAlpha: alpha, lit: null, litAlpha: 0 };
  }
  if (node.id === scene.selectedId) {
    return { base: "danger", baseAlpha: 1, lit: null, litAlpha: 0 };
  }
  const rest = (near ? 0.6 : 0.15) * (1 - focus);
  const hop = scene.hops.get(node.id);
  if (hop === undefined) {
    return { base: cluster, baseAlpha: rest, lit: null, litAlpha: 0 };
  }
  const t = litOf(scene, node.id);
  return {
    base: cluster,
    baseAlpha: rest * (1 - t),
    lit: "accent",
    litAlpha: hopAlpha(hop) * t,
  };
}

export function nodeVisible(scene: Scene, node: SimNode) {
  return !scene.selectedId || sceneFocus(scene) < 1 || inBlast(scene, node.id);
}

export function linkVisible(scene: Scene, link: SimLink) {
  return (
    !scene.selectedId ||
    sceneFocus(scene) < 1 ||
    (inBlast(scene, link.sourceId) && inBlast(scene, link.targetId))
  );
}

const touchesHover = (scene: Scene, link: SimLink) =>
  !!scene.hoveredId &&
  (link.sourceId === scene.hoveredId || link.targetId === scene.hoveredId);

const isBlastEdge = (scene: Scene, link: SimLink) =>
  !!scene.selectedId &&
  inBlast(scene, link.sourceId) &&
  inBlast(scene, link.targetId);

export function linkColor(scene: Scene, link: SimLink) {
  const tone = scene.tone;
  if (!tone) return "transparent";
  const focus = sceneFocus(scene);
  const kind = EDGE_TOKEN[link.kind];
  const hovered = touchesHover(scene, link);

  if (!scene.selectedId) return tone(kind, hovered ? 1 : lerp(0.6, 0.2, focus));
  if (isBlastEdge(scene, link)) {
    if (hovered) return tone("accent", 1);
    const lit = Math.min(
      litOf(scene, link.sourceId),
      litOf(scene, link.targetId),
    );
    if (lit > 0) return tone("accent", 0.08 + 0.57 * lit);
  }
  return tone(kind, (hovered ? 0.9 : 0.07) * (1 - focus));
}

export function linkWidth(scene: Scene, link: SimLink) {
  if (touchesHover(scene, link)) return 1.6;
  return isBlastEdge(scene, link) ? 1.2 : 0.75;
}

const ARROW_MIN_ZOOM = 0.5;

/** Arrowheads only where they carry meaning: zoomed in, and not on dimmed edges. */
export function arrowLength(scene: Scene, link: SimLink) {
  if (scene.zoom < ARROW_MIN_ZOOM) return 0;
  if (
    scene.selectedId &&
    !isBlastEdge(scene, link) &&
    !touchesHover(scene, link)
  )
    return 0;
  return 3.5;
}

export function particleColor(scene: Scene, link: SimLink) {
  if (!scene.tone) return "transparent";
  return isBlastEdge(scene, link)
    ? scene.tone("accent", 1)
    : scene.tone("text-muted", 0.9);
}

const LABEL_PX = 11;
const LABEL_ZOOM = 1.6;
const HUB_LABEL_ZOOM = 0.9;
const HUB_RADIUS = 8;
const LABEL_MAX_CHARS = 32;

const labelText = (name: string) =>
  name.length > LABEL_MAX_CHARS
    ? `${name.slice(0, LABEL_MAX_CHARS - 1)}…`
    : name;

function wantsLabel(scene: Scene, node: SimNode, k: number) {
  if (node.id === scene.hoveredId) return true;
  if (!scene.selectedId) {
    return (
      k >= LABEL_ZOOM || (k >= HUB_LABEL_ZOOM && node.radius >= HUB_RADIUS)
    );
  }
  if (node.id === scene.selectedId) return true;
  const hop = scene.hops.get(node.id);
  if (hop === undefined) return false;
  return hop === 1 || k >= LABEL_ZOOM;
}

function paintLabel(
  scene: Scene,
  node: SimNode,
  ctx: CanvasRenderingContext2D,
  k: number,
  alpha: number,
  tone: Tone,
) {
  const text = labelText(node.name);
  const size = LABEL_PX / k;
  ctx.font = scene.labelFont;
  if (node.labelWidth === undefined) {
    node.labelWidth = ctx.measureText(text).width * k;
  }
  const width = node.labelWidth / k;
  const padX = 4 / k;
  const padY = 2 / k;
  const x = node.x! - width / 2 - padX;
  const y = node.y! + node.radius + 3 / k;
  const height = size + padY * 2 + 1 / k;

  ctx.beginPath();
  ctx.roundRect(x, y, width + padX * 2, height, 3 / k);
  ctx.fillStyle = tone("surface-2", 0.94 * alpha);
  ctx.fill();
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = tone("border-strong", alpha);
  ctx.stroke();

  ctx.fillStyle = tone(
    node.id === scene.selectedId ? "danger-ink" : "text",
    alpha,
  );
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, node.x!, y + height / 2);
}

export function paintNode(
  scene: Scene,
  node: SimNode,
  ctx: CanvasRenderingContext2D,
  k: number,
) {
  const tone = scene.tone;
  if (!tone || node.x === undefined || node.y === undefined) return;
  const view = scene.view;
  if (
    view &&
    (node.x < view.minX ||
      node.x > view.maxX ||
      node.y < view.minY ||
      node.y > view.maxY)
  )
    return;
  const look = nodeLook(scene, node);
  const alpha = Math.max(look.baseAlpha, look.litAlpha);
  if (alpha < 0.01) return;

  ctx.beginPath();
  ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
  if (look.baseAlpha > 0.01) {
    ctx.fillStyle = tone(look.base, look.baseAlpha);
    ctx.fill();
  }
  if (look.lit && look.litAlpha > 0.01) {
    ctx.fillStyle = tone(look.lit, look.litAlpha);
    ctx.fill();
  }
  if (k > 0.8) {
    ctx.lineWidth = 0.75 / k;
    ctx.strokeStyle = tone("bg", alpha);
    ctx.stroke();
  }

  if (node.id === scene.selectedId) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + 3 / k, 0, Math.PI * 2);
    ctx.lineWidth = 1.5 / k;
    ctx.strokeStyle = tone("danger", 0.4);
    ctx.stroke();
  } else if (node.id === scene.hoveredId) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius + 2 / k, 0, Math.PI * 2);
    ctx.lineWidth = 1.5 / k;
    ctx.strokeStyle = tone("text", 0.85);
    ctx.stroke();
  }

  if (wantsLabel(scene, node, k)) {
    paintLabel(scene, node, ctx, k, Math.min(1, alpha + 0.15), tone);
  }
}

/**
 * force-graph paints every visible node each frame with no culling, so the
 * viewport is worked out once per frame and offscreen nodes skip their paint.
 * The padding covers the largest node plus a full label hanging off it.
 */
export function frameView(
  scene: Scene,
  ctx: CanvasRenderingContext2D,
  k: number,
) {
  scene.labelFont = `500 ${LABEL_PX / k}px ${scene.monoFont}`;
  const m = ctx.getTransform();
  const pad = MAX_RADIUS + (LABEL_MAX_CHARS * LABEL_PX) / k;
  scene.view = {
    minX: -m.e / m.a - pad,
    minY: -m.f / m.d - pad,
    maxX: (ctx.canvas.width - m.e) / m.a + pad,
    maxY: (ctx.canvas.height - m.f) / m.d + pad,
  };
}

const MIN_HIT_PX = 6;

export function paintHitArea(
  node: SimNode,
  color: string,
  ctx: CanvasRenderingContext2D,
  k: number,
) {
  if (node.x === undefined || node.y === undefined) return;
  ctx.beginPath();
  ctx.arc(
    node.x,
    node.y,
    Math.max(node.radius + 1 / k, MIN_HIT_PX / k),
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = color;
  ctx.fill();
}

/** Two expanding rings on the target, drawn after the nodes. */
export function paintRing(
  scene: Scene,
  target: SimNode | undefined,
  ctx: CanvasRenderingContext2D,
  k: number,
) {
  if (scene.ringAt === null || !scene.tone || !target) return;
  if (target.x === undefined || target.y === undefined) return;
  for (const delay of [0, RING_GAP_MS]) {
    const t = progress(scene.ringAt + delay, scene.now, RING_MS);
    if (t <= 0 || t >= 1) continue;
    const e = easeOut(t);
    ctx.beginPath();
    ctx.arc(
      target.x,
      target.y,
      target.radius + (4 + 32 * e) / k,
      0,
      Math.PI * 2,
    );
    ctx.lineWidth = 1.5 / k;
    ctx.strokeStyle = scene.tone("danger", 0.55 * (1 - e));
    ctx.stroke();
  }
}

export const ringEnd = (ringAt: number) => ringAt + RING_GAP_MS + RING_MS;
