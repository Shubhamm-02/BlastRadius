"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import { nodeLook, type Scene, type SimNode } from "./scene";

const WIDTH = 160;
const HEIGHT = 110;
const PAD = 8;
const PAN_FRACTION = 0.25;
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export interface MinimapCamera {
  screenToGraph(x: number, y: number): { x: number; y: number } | null;
  centerAt(x: number, y: number, durationMs: number): void;
}

interface Frame {
  minX: number;
  minY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Overview of the whole layout with the current viewport. The parent calls
 * drawRef.current() (coalesced to one frame) whenever the camera, positions
 * or colors change.
 */
export function Minimap({
  nodes,
  scene,
  camera,
  viewport,
  drawRef,
}: {
  nodes: SimNode[];
  scene: Scene;
  camera: MinimapCamera;
  viewport: { width: number; height: number };
  drawRef: MutableRefObject<() => void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<Frame | null>(null);
  const pendingRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;

    const paint = () => {
      pendingRef.current = 0;
      const tone = scene.tone;
      // Hidden below md, where it would otherwise still repaint every tick.
      if (!tone || !canvas.offsetParent) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
      if (minX === Infinity) return;

      const scale = Math.min(
        (WIDTH - PAD * 2) / Math.max(1, maxX - minX),
        (HEIGHT - PAD * 2) / Math.max(1, maxY - minY),
      );
      const frame: Frame = {
        minX,
        minY,
        scale,
        offsetX: (WIDTH - (maxX - minX) * scale) / 2,
        offsetY: (HEIGHT - (maxY - minY) * scale) / 2,
      };
      frameRef.current = frame;
      const toX = (x: number) => frame.offsetX + (x - minX) * scale;
      const toY = (y: number) => frame.offsetY + (y - minY) * scale;

      for (const n of nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        const look = nodeLook(scene, n);
        const lit = look.lit && look.litAlpha > look.baseAlpha;
        const alpha = Math.max(look.baseAlpha, look.litAlpha, 0.12);
        const size = n.id === scene.selectedId ? 4 : lit ? 2.5 : 2;
        ctx.fillStyle = tone(lit ? look.lit! : look.base, alpha);
        ctx.fillRect(toX(n.x) - size / 2, toY(n.y) - size / 2, size, size);
      }

      const topLeft = camera.screenToGraph(0, 0);
      const bottomRight = camera.screenToGraph(viewport.width, viewport.height);
      if (!topLeft || !bottomRight) return;
      const x = Math.max(0.5, toX(topLeft.x));
      const y = Math.max(0.5, toY(topLeft.y));
      const w = Math.min(WIDTH - 0.5, toX(bottomRight.x)) - x;
      const h = Math.min(HEIGHT - 0.5, toY(bottomRight.y)) - y;
      if (w <= 0 || h <= 0) return;
      ctx.fillStyle = tone("text", 0.06);
      ctx.fillRect(x, y, w, h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = tone("text-muted", 0.7);
      ctx.strokeRect(x, y, w, h);
    };

    drawRef.current = () => {
      if (!pendingRef.current)
        pendingRef.current = requestAnimationFrame(paint);
    };
    drawRef.current();
    return () => {
      cancelAnimationFrame(pendingRef.current);
      pendingRef.current = 0;
      drawRef.current = () => {};
    };
  }, [nodes, scene, camera, viewport.width, viewport.height, drawRef]);

  const panTo = (e: PointerEvent<HTMLCanvasElement>, durationMs: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    camera.centerAt(
      (mx - frame.offsetX) / frame.scale + frame.minX,
      (my - frame.offsetY) / frame.scale + frame.minY,
      durationMs,
    );
  };

  const panByKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = PAN_KEYS[e.key];
    const topLeft = camera.screenToGraph(0, 0);
    const bottomRight = camera.screenToGraph(viewport.width, viewport.height);
    if (!step || !topLeft || !bottomRight) return;
    e.preventDefault();
    const w = bottomRight.x - topLeft.x;
    const h = bottomRight.y - topLeft.y;
    camera.centerAt(
      topLeft.x + w / 2 + step[0] * w * PAN_FRACTION,
      topLeft.y + h / 2 + step[1] * h * PAN_FRACTION,
      150,
    );
  };

  // The focus ring sits on the wrapper: overflow-hidden would clip it on the canvas.
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-10 hidden overflow-hidden rounded-md border border-border bg-surface-1 shadow-raised has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-ink has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-bg md:block">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-roledescription="minimap"
        aria-label="Minimap. Drag or use the arrow keys to move the view."
        className="block h-[110px] w-40 cursor-crosshair touch-none focus-visible:ring-0 focus-visible:ring-offset-0"
        onKeyDown={panByKey}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          panTo(e, 200);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) panTo(e, 0);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      />
    </div>
  );
}
