"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useCanvasPalette, type CanvasPalette } from "@/lib/palette";

interface DriftNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

const AREA_PER_NODE = 15_000;
const MAX_NODES = 90;
const LINK_DISTANCE = 130;
const FRAME_MS = 1000 / 30;
const EDGE_ALPHA_STEPS = 8;

function spawnNode(width: number, height: number): DriftNode {
  const angle = Math.random() * Math.PI * 2;
  // 4-10 px per second: movement is felt rather than watched.
  const speed = 0.004 + Math.random() * 0.006;
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 1 + Math.random() * 1.2,
  };
}

function fitNodes(nodes: DriftNode[], width: number, height: number) {
  const target = Math.min(
    MAX_NODES,
    Math.round((width * height) / AREA_PER_NODE),
  );
  nodes.length = Math.min(nodes.length, target);
  for (const n of nodes) {
    n.x %= width;
    n.y %= height;
  }
  while (nodes.length < target) nodes.push(spawnNode(width, height));
}

function drift(nodes: DriftNode[], width: number, height: number, dt: number) {
  const pad = LINK_DISTANCE / 2;
  for (const n of nodes) {
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    if (n.x < -pad) n.x = width + pad;
    else if (n.x > width + pad) n.x = -pad;
    if (n.y < -pad) n.y = height + pad;
    else if (n.y > height + pad) n.y = -pad;
  }
}

interface BackdropInk {
  edges: string[];
  blastEdge: string;
  node: string;
  blastNode: string;
}

function inkFrom(palette: CanvasPalette): BackdropInk {
  return {
    edges: Array.from({ length: EDGE_ALPHA_STEPS }, (_, i) =>
      palette.rgba("border-strong", ((i + 1) / EDGE_ALPHA_STEPS) * 0.6),
    ),
    blastEdge: palette.rgba("accent", 0.22),
    node: palette.rgba("text-dim", 0.28),
    blastNode: palette.rgba("accent", 0.5),
  };
}

function paint(
  ctx: CanvasRenderingContext2D,
  nodes: DriftNode[],
  ink: BackdropInk,
  dpr: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;

  // Edges are bucketed by alpha so each frame costs a handful of stroke calls
  // instead of one per edge.
  const edgePaths = ink.edges.map(() => new Path2D());
  const blastPath = new Path2D();
  const limit = LINK_DISTANCE * LINK_DISTANCE;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > limit) continue;
      const closeness = 1 - Math.sqrt(d2) / LINK_DISTANCE;
      const path =
        i === 0
          ? blastPath
          : edgePaths[Math.floor(closeness * (EDGE_ALPHA_STEPS - 1))];
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }
  }
  edgePaths.forEach((path, k) => {
    ctx.strokeStyle = ink.edges[k];
    ctx.stroke(path);
  });
  ctx.strokeStyle = ink.blastEdge;
  ctx.stroke(blastPath);

  const dots = new Path2D();
  for (let i = 1; i < nodes.length; i++) {
    const { x, y, r } = nodes[i];
    dots.moveTo(x + r, y);
    dots.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = ink.node;
  ctx.fill(dots);
  // Node 0 stands in for a selected function: the one amber hint of what the tool does.
  if (nodes[0]) {
    ctx.fillStyle = ink.blastNode;
    ctx.beginPath();
    ctx.arc(nodes[0].x, nodes[0].y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Faint drifting call graph behind the first-run hero. Throttled to 30fps,
 * paused while the tab is hidden, and painted once under reduced motion.
 */
export function Backdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<DriftNode[]>([]);
  const palette = useCanvasPalette();
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !palette) return;
    const nodes = nodesRef.current;
    const ink = inkFrom(palette);
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let last = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (width === 0 || height === 0) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      fitNodes(nodes, width, height);
      paint(ctx, nodes, ink, dpr);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = now - last;
      if (dt < FRAME_MS) return;
      last = now;
      // Clamped so a long stall doesn't teleport nodes.
      drift(nodes, width, height, Math.min(dt, 100));
      paint(ctx, nodes, ink, dpr);
    };

    const start = () => {
      if (reduce || frame || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [palette, reduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full [mask-image:radial-gradient(ellipse_55%_50%_at_50%_45%,transparent_20%,black_100%)]"
    />
  );
}
