"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import { DURATION, ease } from "@/lib/motion";
import { useCanvasPalette } from "@/lib/palette";
import { useImpact } from "@/state/impact";
import { useProjectData } from "@/state/project";
import { useWorkspace, type ViewMode } from "@/state/workspace";
import { CAMERA_MS, MODE_FADE_MS, focusMix, scheduleWave } from "./blast";
import { HoverCard } from "./HoverCard";
import { Minimap, type MinimapCamera } from "./Minimap";
import {
  arrowLength,
  buildSimGraph,
  createScene,
  createTone,
  inBlast,
  linkColor,
  linkVisible,
  linkWidth,
  nodeVisible,
  paintHitArea,
  paintNode,
  paintRing,
  particleColor,
  ringEnd,
  type SimLink,
  type SimNode,
} from "./scene";

type FGNode = NodeObject<SimNode>;
type FGLink = LinkObject<SimNode, SimLink>;
type FGMethods = ForceGraphMethods<FGNode, FGLink>;
type ImpactSnapshot = ReturnType<typeof useImpact.getState>;

const FIT_PADDING = 56;
/** zoomToFit on a handful of nodes zooms until each node is tens of pixels wide. */
const FIT_MAX_ZOOM = 2.2;
/** Past this many functions a fit zooms out too far to read; center on the target instead. */
const FIT_MAX_NODES = 300;
const ZOOM_STEP = 1.4;
const PARTICLE_EVERY_MS = 650;
const PARTICLE_MAX_EDGES = 48;
const CLICK_SLOP_PX = 5;
const WARMUP_TICK_BUDGET = 200_000;
/** Frame the layout once it has roughly spread out, instead of waiting for it to settle. */
const EARLY_FIT_TICK = 25;

/**
 * Under reduced motion the layout is solved before the first paint instead of
 * animating into place. The budget caps the one-off main-thread block on big
 * graphs at the cost of a looser layout.
 */
const warmupTicks = (nodeCount: number) =>
  Math.min(300, Math.ceil(WARMUP_TICK_BUDGET / Math.max(1, nodeCount)));

const modeValue = (mode: ViewMode) => (mode === "focus" ? 1 : 0);

const noop = () => {};

/**
 * force-graph keeps in-flight particles on the link object and redraws every
 * frame while any exist, even on hidden links. Dropping them when the hover
 * ends lets the renderer pause again.
 */
function dropParticles(links: SimLink[]) {
  for (const l of links) (l as { __photons?: unknown[] }).__photons = [];
}

export function GraphCanvas() {
  const graph = useProjectData((s) => s.graph);
  const degree = useProjectData((s) => s.degree);
  const sim = useMemo(() => buildSimGraph(graph, degree), [graph, degree]);
  const palette = useCanvasPalette();
  const reduced = useReducedMotion() ?? false;

  const [scene] = useState(createScene);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const measured = size.width > 0 && size.height > 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FGMethods>();
  const sizeRef = useRef(size);
  useLayoutEffect(() => {
    sizeRef.current = size;
  }, [size]);
  const canvasHoverRef = useRef<string | null>(null);
  const pointerDownRef = useRef({ x: 0, y: 0 });
  const minimapDrawRef = useRef<() => void>(noop);
  const animRef = useRef({ end: 0, frame: 0 });
  const fittedRef = useRef(false);
  const ticksRef = useRef(0);

  // Repaints are imperative so selection and hover never re-render React or
  // rebuild graphData. A same-value zoom is the one public call that marks
  // the paused renderer dirty.
  const kick = useCallback(() => {
    const fg = fgRef.current;
    if (fg) fg.zoom(fg.zoom());
  }, []);

  const play = useCallback(
    (until: number) => {
      const anim = animRef.current;
      anim.end = Math.max(anim.end, until);
      if (anim.frame) return;
      const step = () => {
        kick();
        anim.frame =
          performance.now() < anim.end ? requestAnimationFrame(step) : 0;
      };
      step();
    },
    [kick],
  );

  useEffect(() => {
    const anim = animRef.current;
    return () => cancelAnimationFrame(anim.frame);
  }, []);

  const camera = useMemo(() => {
    const duration = () => (scene.reduced ? 0 : CAMERA_MS);
    const centerOn = (id: string) => {
      const fg = fgRef.current;
      const node = sim.byId.get(id);
      if (!fg || node?.x === undefined || node.y === undefined) return;
      fg.centerAt(node.x, node.y, duration());
      if (fg.zoom() < 1.5) fg.zoom(2, duration());
    };
    const fitTo = (filter?: (n: FGNode) => boolean) => {
      const fg = fgRef.current;
      const box = fg?.getGraphBbox(filter);
      if (!fg || !box) return;
      const { width, height } = sizeRef.current;
      const w = Math.max(1, box.x[1] - box.x[0]);
      const h = Math.max(1, box.y[1] - box.y[0]);
      const k = Math.min(
        (width - 2 * FIT_PADDING) / w,
        (height - 2 * FIT_PADDING) / h,
        FIT_MAX_ZOOM,
      );
      fg.centerAt(
        (box.x[0] + box.x[1]) / 2,
        (box.y[0] + box.y[1]) / 2,
        duration(),
      );
      fg.zoom(Math.max(0.05, k), duration());
    };
    const fitAll = () => fitTo();
    const fitBlast = () => {
      const target = scene.selectedId;
      if (!target) return fitAll();
      const count = scene.hops.size + 1;
      if (count === 1 || count > FIT_MAX_NODES) return centerOn(target);
      fitTo((n) => inBlast(scene, n.id));
    };
    const fitView = () =>
      scene.selectedId && scene.mode.to === 1 ? fitBlast() : fitAll();
    const zoomBy = (factor: number) => {
      const fg = fgRef.current;
      if (fg) fg.zoom(fg.zoom() * factor, scene.reduced ? 0 : 200);
    };
    return { centerOn, fitAll, fitBlast, fitView, zoomBy };
  }, [scene, sim]);

  useEffect(() => {
    useWorkspace.getState().registerGraphControls({
      fit: camera.fitView,
      zoomIn: () => camera.zoomBy(ZOOM_STEP),
      zoomOut: () => camera.zoomBy(1 / ZOOM_STEP),
      centerOn: camera.centerOn,
    });
    return () => useWorkspace.getState().registerGraphControls(null);
  }, [camera]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((s) =>
        s.width === width && s.height === height ? s : { width, height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const font = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-geist-mono")
      .trim();
    if (font) scene.monoFont = font;
    scene.tone = palette ? createTone(palette) : null;
    kick();
    minimapDrawRef.current();
  }, [palette, scene, kick]);

  useEffect(() => {
    scene.reduced = reduced;
  }, [reduced, scene]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !measured) return;
    fg.d3Force("charge")?.strength(-48).distanceMax(420);
    fg.d3Force("link")?.distance(34);
    fittedRef.current = false;
    ticksRef.current = 0;
    if (!scene.reduced) fg.d3ReheatSimulation();
  }, [sim, measured, scene]);

  useEffect(() => {
    let framedKey: string | null = null;
    let particleTimer: ReturnType<typeof setInterval> | undefined;
    let particleLinks: SimLink[] = [];

    const onSelect = (id: string | null) => {
      const now = performance.now();
      scene.selectedId = id;
      scene.litAt.clear();
      scene.ringAt = id && !scene.reduced ? now : null;
      framedKey = null;
      play(scene.ringAt === null ? now : ringEnd(scene.ringAt));
    };

    const onImpact = (impact: ImpactSnapshot) => {
      const now = performance.now();
      scene.hops = impact.hopById;
      play(
        scheduleWave(
          scene.litAt,
          impact.hopById,
          now,
          scene.ringAt,
          scene.reduced,
        ),
      );

      const query = impact.query;
      if (!query || query.id !== scene.selectedId) return;
      const settled =
        impact.status === "error" || impact.result?.target.id === query.id;
      const key = `${query.id}:${query.direction}`;
      if (!settled || key === framedKey) return;
      framedKey = key;
      if (impact.status === "error") camera.centerOn(query.id);
      else camera.fitBlast();
    };

    const onHover = (id: string | null) => {
      clearInterval(particleTimer);
      dropParticles(particleLinks);
      scene.hoveredId = id;
      particleLinks = id ? (sim.linksOf.get(id) ?? []) : [];
      scene.hoverNeighbors = new Set(
        particleLinks.map((l) => (l.sourceId === id ? l.targetId : l.sourceId)),
      );
      kick();
      minimapDrawRef.current();
      if (!id || scene.reduced || particleLinks.length === 0) return;

      const emitting = particleLinks.slice(0, PARTICLE_MAX_EDGES);
      const emit = () => {
        const fg = fgRef.current;
        if (!fg) return;
        for (const l of emitting) {
          if (linkVisible(scene, l)) fg.emitParticle(l);
        }
      };
      emit();
      particleTimer = setInterval(emit, PARTICLE_EVERY_MS);
    };

    const onMode = (mode: ViewMode) => {
      const now = performance.now();
      scene.mode = {
        from: focusMix(scene.mode, now, scene.reduced),
        to: modeValue(mode),
        at: now,
      };
      play(now + MODE_FADE_MS);
      if (mode === "focus" && scene.selectedId) camera.fitBlast();
      else camera.fitAll();
    };

    const ws = useWorkspace.getState();
    const initialMode = modeValue(ws.viewMode);
    scene.mode = { from: initialMode, to: initialMode, at: 0 };
    onSelect(ws.selectedId);
    onHover(ws.hoveredId);
    onImpact(useImpact.getState());

    const unsubscribeWorkspace = useWorkspace.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId) onSelect(s.selectedId);
      if (s.hoveredId !== prev.hoveredId) onHover(s.hoveredId);
      if (s.viewMode !== prev.viewMode) onMode(s.viewMode);
    });
    const unsubscribeImpact = useImpact.subscribe((s, prev) => {
      if (
        s.hopById !== prev.hopById ||
        s.status !== prev.status ||
        s.result !== prev.result
      ) {
        onImpact(s);
      }
    });
    return () => {
      unsubscribeWorkspace();
      unsubscribeImpact();
      clearInterval(particleTimer);
      dropParticles(particleLinks);
    };
  }, [scene, sim, camera, play, kick]);

  const accessors = useMemo(
    () => ({
      nodeVal: (n: FGNode) => n.radius * n.radius,
      nodeVisibility: (n: FGNode) => nodeVisible(scene, n),
      paintNode: (n: FGNode, ctx: CanvasRenderingContext2D, k: number) =>
        paintNode(scene, n, ctx, k),
      linkVisibility: (l: FGLink) => linkVisible(scene, l),
      linkColor: (l: FGLink) => linkColor(scene, l),
      linkWidth: (l: FGLink) => linkWidth(scene, l),
      arrowLength: (l: FGLink) => arrowLength(scene, l),
      particleColor: (l: FGLink) => particleColor(scene, l),
      framePre: (_ctx: CanvasRenderingContext2D, k: number) => {
        scene.now = performance.now();
        scene.zoom = k;
      },
      onZoom: ({ k }: { k: number }) => {
        scene.zoom = k;
        minimapDrawRef.current();
      },
      onEngineTick: () => {
        minimapDrawRef.current();
        if (++ticksRef.current === EARLY_FIT_TICK) camera.fitView();
      },
      // kick() ends force-graph's drag flag through a synthetic zoom event, so a
      // node drag released during an animation would otherwise count as a click.
      onNodeClick: (n: FGNode, e: MouseEvent) => {
        const down = pointerDownRef.current;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP_PX)
          return;
        useWorkspace.getState().select(n.id);
      },
      onNodeHover: (n: FGNode | null) => {
        canvasHoverRef.current = n?.id ?? null;
        useWorkspace.getState().hover(n?.id ?? null);
      },
    }),
    [scene, camera],
  );

  const paintTargetRing = useCallback(
    (ctx: CanvasRenderingContext2D, k: number) =>
      paintRing(
        scene,
        scene.selectedId ? sim.byId.get(scene.selectedId) : undefined,
        ctx,
        k,
      ),
    [scene, sim],
  );

  const onEngineStop = useCallback(() => {
    if (fittedRef.current) return;
    fittedRef.current = true;
    if (scene.selectedId && scene.hops.size > 0) camera.fitBlast();
    else camera.fitAll();
  }, [scene, camera]);

  const minimapCamera = useMemo<MinimapCamera>(
    () => ({
      screenToGraph: (x, y) => fgRef.current?.screen2GraphCoords(x, y) ?? null,
      centerAt: (x, y, durationMs) =>
        fgRef.current?.centerAt(x, y, scene.reduced ? 0 : durationMs),
    }),
    [scene],
  );

  const toScreen = useCallback(
    (x: number, y: number) => fgRef.current?.graph2ScreenCoords(x, y) ?? null,
    [],
  );

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={ease(DURATION.slow)}
      className="absolute inset-0"
      onPointerDownCapture={(e) => {
        pointerDownRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerLeave={() => {
        if (!canvasHoverRef.current) return;
        canvasHoverRef.current = null;
        useWorkspace.getState().hover(null);
      }}
    >
      {measured && (
        <ForceGraph2D<SimNode, SimLink>
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={sim}
          backgroundColor="rgba(0,0,0,0)"
          nodeRelSize={1}
          nodeVal={accessors.nodeVal}
          nodeVisibility={accessors.nodeVisibility}
          nodeCanvasObject={accessors.paintNode}
          nodePointerAreaPaint={paintHitArea}
          linkVisibility={accessors.linkVisibility}
          linkColor={accessors.linkColor}
          linkWidth={accessors.linkWidth}
          linkCurvature={0.12}
          linkDirectionalArrowLength={accessors.arrowLength}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticleSpeed={0.012}
          linkDirectionalParticleWidth={2.5}
          linkDirectionalParticleColor={accessors.particleColor}
          // Edges are not interactive; skip painting them into the hit canvas.
          linkPointerAreaPaint={noop}
          onRenderFramePre={accessors.framePre}
          onRenderFramePost={paintTargetRing}
          onZoom={accessors.onZoom}
          onEngineTick={accessors.onEngineTick}
          onEngineStop={onEngineStop}
          onNodeClick={accessors.onNodeClick}
          onNodeHover={accessors.onNodeHover}
          warmupTicks={reduced ? warmupTicks(sim.nodes.length) : 0}
          cooldownTicks={reduced ? 0 : Infinity}
          cooldownTime={3000}
          d3VelocityDecay={0.35}
          minZoom={0.05}
          maxZoom={8}
        />
      )}
      {measured && (
        <Minimap
          nodes={sim.nodes}
          scene={scene}
          camera={minimapCamera}
          viewport={size}
          drawRef={minimapDrawRef}
        />
      )}
      <HoverCard
        byId={sim.byId}
        canvasHoverRef={canvasHoverRef}
        toScreen={toScreen}
      />
    </motion.div>
  );
}
