import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND, BrandMark } from "@/components/stats/brand-mark";

export const alt = "BlastRadius: see what breaks before you change it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT_DIR = join(process.cwd(), "node_modules/geist/dist/fonts");

const CENTER = { x: 950, y: 315 };
const RINGS = [84, 158, 232];

// Amber pre-blended over the background: translucent fills would show the edges beneath.
const HOP_2_FILL = "rgb(174, 119, 30)";
const HOP_3_FILL = "rgb(103, 73, 24)";

type Point = { x: number; y: number };

const polar = (r: number, deg: number): Point => ({
  x: CENTER.x + r * Math.cos((deg * Math.PI) / 180),
  y: CENTER.y + r * Math.sin((deg * Math.PI) / 180),
});

const HOP_1 = [200, 290, 30].map((deg) => polar(RINGS[0], deg));
const HOP_2 = [
  [175, 0],
  [228, 0],
  [270, 1],
  [322, 1],
  [8, 2],
  [62, 2],
].map(([deg, parent]) => ({ at: polar(RINGS[1], deg), parent: HOP_1[parent] }));
const HOP_3 = [
  [160, 0],
  [240, 1],
  [300, 3],
  [44, 5],
].map(([deg, parent]) => ({
  at: polar(RINGS[2], deg),
  parent: HOP_2[parent].at,
}));
const UNAFFECTED = [
  { at: { x: 760, y: 40 }, link: HOP_3[1].at },
  { at: { x: 1160, y: 50 }, link: HOP_3[2].at },
  { at: { x: 1170, y: 600 }, link: HOP_3[3].at },
  { at: { x: 740, y: 590 }, link: HOP_3[0].at },
];

function Edge({ from, to, color }: { from: Point; to: Point; color: string }) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (
    <div
      style={{
        position: "absolute",
        left: (from.x + to.x) / 2 - length / 2,
        top: (from.y + to.y) / 2 - 1,
        width: length,
        height: 2,
        background: color,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "center",
      }}
    />
  );
}

function Node({ at, r, color }: { at: Point; r: number; color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: at.x - r,
        top: at.y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        background: color,
        border: `3px solid ${BRAND.bg}`,
      }}
    />
  );
}

function Ring({ r, color }: { r: number; color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: CENTER.x - r,
        top: CENTER.y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        border: `2px solid ${color}`,
      }}
    />
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{ width: 12, height: 12, borderRadius: 6, background: color }}
      />
      {label}
    </div>
  );
}

export default async function OpengraphImage() {
  const [regular, semibold, mono] = await Promise.all([
    readFile(join(FONT_DIR, "geist-sans/Geist-Regular.ttf")),
    readFile(join(FONT_DIR, "geist-sans/Geist-SemiBold.ttf")),
    readFile(join(FONT_DIR, "geist-mono/GeistMono-Regular.ttf")),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: BRAND.bg,
        fontFamily: "Geist",
        color: BRAND.text,
      }}
    >
      <Ring r={RINGS[2]} color="rgba(245, 165, 36, 0.14)" />
      <Ring r={RINGS[1]} color="rgba(245, 165, 36, 0.26)" />
      <Ring r={RINGS[0]} color="rgba(245, 165, 36, 0.45)" />
      <Ring r={30} color="rgba(220, 38, 38, 0.35)" />

      {UNAFFECTED.map((n, i) => (
        <Edge key={`u${i}`} from={n.at} to={n.link} color={BRAND.border} />
      ))}
      {HOP_3.map((n, i) => (
        <Edge
          key={`e3${i}`}
          from={n.at}
          to={n.parent}
          color="rgba(245, 165, 36, 0.3)"
        />
      ))}
      {HOP_2.map((n, i) => (
        <Edge
          key={`e2${i}`}
          from={n.at}
          to={n.parent}
          color="rgba(245, 165, 36, 0.45)"
        />
      ))}
      {HOP_1.map((at, i) => (
        <Edge
          key={`e1${i}`}
          from={at}
          to={CENTER}
          color="rgba(245, 165, 36, 0.65)"
        />
      ))}

      {UNAFFECTED.map((n, i) => (
        <Node key={`n${i}`} at={n.at} r={9} color={BRAND.edge} />
      ))}
      {HOP_3.map((n, i) => (
        <Node key={`h3${i}`} at={n.at} r={10} color={HOP_3_FILL} />
      ))}
      {HOP_2.map((n, i) => (
        <Node key={`h2${i}`} at={n.at} r={11} color={HOP_2_FILL} />
      ))}
      {HOP_1.map((at, i) => (
        <Node key={`h1${i}`} at={at} r={13} color={BRAND.accent} />
      ))}
      <Node at={CENTER} r={18} color={BRAND.danger} />

      <div
        style={{
          position: "absolute",
          left: 80,
          top: 72,
          bottom: 72,
          width: 580,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <BrandMark size={56} radius={12} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 88,
              fontWeight: 600,
              letterSpacing: -3,
              lineHeight: 1,
            }}
          >
            <span>Blast</span>
            {/* Satori leaves a gap between adjacent text runs; pull the second run back. */}
            <span style={{ color: BRAND.accent, marginLeft: -6 }}>Radius</span>
          </div>
          <div
            style={{
              fontSize: 42,
              lineHeight: 1.2,
              color: BRAND.muted,
            }}
          >
            See what breaks before you change it.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 28,
            fontFamily: "Geist Mono",
            fontSize: 20,
            color: BRAND.dim,
          }}
        >
          <LegendItem color={BRAND.danger} label="target" />
          <LegendItem color={BRAND.accent} label="blast radius" />
          <LegendItem color={BRAND.edge} label="unaffected" />
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
