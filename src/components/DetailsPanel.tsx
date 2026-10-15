"use client";

import type { GNode } from "@/hooks/useProject";
import type { ImpactController } from "@/hooks/useImpact";
import { DEPTH_MAX, DEPTH_MIN } from "@/lib/constants";
import {
  COLOR_AFFECTED,
  COLOR_IDLE,
  COLOR_SELECTED,
  ellipsis,
  segmentStyle,
} from "./styles";

const LIST_MAX = 100;

interface Props {
  impact: ImpactController;
  selectedNode: GNode | undefined;
}

/** Right panel: direction/depth controls, blast-radius totals, explanation, affected list. */
export default function DetailsPanel({ impact, selectedNode }: Props) {
  const { direction, result, status } = impact;
  const upstream = direction === "upstream";

  return (
    <aside
      style={{
        width: 320,
        borderLeft: "1px solid #1e293b",
        padding: "20px 18px",
        overflowY: "auto",
        background: "#0b1220",
      }}
    >
      <Legend upstream={upstream} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "#111c33",
            borderRadius: 8,
            padding: 3,
          }}
        >
          <button
            onClick={() => impact.setDirection("upstream")}
            style={segmentStyle(upstream)}
          >
            Callers
          </button>
          <button
            onClick={() => impact.setDirection("downstream")}
            style={segmentStyle(!upstream)}
          >
            Callees
          </button>
        </div>
        <label
          style={{
            fontSize: 12,
            color: "#94a3b8",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Depth
          <select
            value={impact.depth}
            onChange={(e) => impact.setDepth(Number(e.target.value))}
            style={{
              background: "#0f172a",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: 6,
              padding: "3px 6px",
            }}
          >
            {Array.from(
              { length: DEPTH_MAX - DEPTH_MIN + 1 },
              (_, i) => DEPTH_MIN + i,
            ).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedNode ? (
        <section style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Selected</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#f87171",
              wordBreak: "break-word",
            }}
          >
            {selectedNode.name}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
            {selectedNode.file}
            {selectedNode.line ? `:${selectedNode.line}` : ""}
          </div>

          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            {upstream ? "Blast radius" : "Depends on"}
          </div>
          {status === "error" ? (
            <div style={{ fontSize: 13, color: "#f87171", marginTop: 4 }}>
              {impact.error}
            </div>
          ) : (
            <div style={{ fontSize: 28, fontWeight: 700, color: "#fbbf24" }}>
              {status === "loading" || !result ? "…" : result.total}
              <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 400 }}>
                {" "}
                function{result?.total === 1 ? "" : "s"}{" "}
                {upstream ? "affected" : "reached"}
              </span>
            </div>
          )}
          {result?.truncated && (
            <div style={{ fontSize: 11, color: "#fbbf24" }}>
              Showing the {result.affected.length} closest — lower the depth to
              narrow it.
            </div>
          )}

          <div
            aria-live="polite"
            style={{
              marginTop: 14,
              fontSize: 13,
              lineHeight: 1.5,
              color: "#cbd5e1",
              background: "#111c33",
              border: "1px solid #1e293b",
              borderRadius: 8,
              padding: 12,
              minHeight: 40,
              whiteSpace: "pre-wrap",
            }}
          >
            {impact.explanation || (impact.explaining ? "Analyzing…" : "—")}
            {impact.explaining && impact.explanation && (
              <span style={{ opacity: 0.6 }}>▍</span>
            )}
          </div>

          {result && result.affected.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {result.affected.slice(0, LIST_MAX).map((a) => (
                <button
                  key={a.id}
                  onClick={() => impact.select(a.id)}
                  title={`${a.name} — ${a.file}:${a.line}`}
                  style={{
                    display: "flex",
                    gap: 8,
                    width: "100%",
                    alignItems: "baseline",
                    textAlign: "left",
                    padding: "4px 6px",
                    border: "none",
                    borderRadius: 6,
                    background: "transparent",
                    color: "#cbd5e1",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#fbbf24", minWidth: 18 }}>
                    {a.hops}
                  </span>
                  <span style={{ ...ellipsis, flex: 1 }}>{a.name}</span>
                  <span
                    style={{ ...ellipsis, color: "#64748b", maxWidth: 110 }}
                  >
                    {a.file}
                  </span>
                </button>
              ))}
              {result.affected.length > LIST_MAX && (
                <p style={{ fontSize: 11, color: "#64748b", margin: "6px" }}>
                  +{result.total - LIST_MAX} more (nearest first, number = hops)
                </p>
              )}
            </div>
          )}
        </section>
      ) : (
        <p style={{ marginTop: 20, fontSize: 13, color: "#94a3b8" }}>
          Search a function on the left (or click a node) to see its blast
          radius.
        </p>
      )}
    </aside>
  );
}

function Legend({ upstream }: { upstream: boolean }) {
  const rows: [string, string][] = [
    [COLOR_SELECTED, "Selected function"],
    [
      COLOR_AFFECTED,
      upstream ? "In blast radius (callers)" : "Dependency (callees)",
    ],
    [COLOR_IDLE, "Unaffected"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map(([c, label]) => (
        <div
          key={label}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: c,
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: 12, color: "#cbd5e1" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}
