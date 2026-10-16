"use client";

import { motion } from "motion/react";
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { DURATION, ease } from "@/lib/motion";
import type { DailyActivity } from "@/app/stats/data";
import { formatFullDay, formatShortDay } from "./format";
import { Panel } from "./Panel";

const SERIES = [
  {
    key: "impact",
    label: "Functions inspected",
    line: "stroke-accent",
    area: "fill-accent/15",
    swatch: "bg-accent",
  },
  {
    key: "ingest",
    label: "Repos analyzed",
    line: "stroke-info",
    area: "fill-info/10",
    swatch: "bg-info",
  },
] as const;

const count = new Intl.NumberFormat("en-US");

// Absolute tick labels don't size their column, so it is sized from the widest one.
const AXIS_WIDTH = ["w-3", "w-4", "w-6", "w-8", "w-9", "w-11"];

function niceScale(peak: number) {
  if (peak <= 4) return { max: 4, step: 1 };
  const raw = peak / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const step =
    (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) *
    magnitude;
  return { max: Math.ceil(peak / step) * step, step };
}

export function ActivityChart({ activity }: { activity: DailyActivity[] }) {
  const [active, setActive] = useState<number | null>(null);
  const last = activity.length - 1;
  const peak = Math.max(0, ...activity.flatMap((d) => [d.ingest, d.impact]));
  const scale = niceScale(peak);
  const ticks = Array.from(
    { length: scale.max / scale.step + 1 },
    (_, i) => i * scale.step,
  );
  const xLabels = [0, 1, 2, 3, 4].map((i) => Math.round((i * last) / 4));

  const x = (i: number) => (i / last) * 100;
  const y = (v: number) => 100 - (v / scale.max) * 100;
  const linePath = (key: "ingest" | "impact") =>
    activity.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[key])}`).join(" ");

  const pickDay = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setActive(Math.min(last, Math.max(0, Math.round(ratio * last))));
  };

  const stepDay = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? last;
    const targets: Record<string, number> = {
      ArrowLeft: from - 1,
      ArrowRight: from + 1,
      Home: 0,
      End: last,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };

  const day = active === null ? null : activity[active];
  const readout = day
    ? `${formatFullDay(day.day)}: ${SERIES.map((s) => `${day[s.key]} ${s.label.toLowerCase()}`).join(", ")}`
    : "";

  return (
    <Panel
      title="Activity"
      caption="Last 30 days, UTC"
      aside={
        <ActivityLegend
          totals={SERIES.map((s) =>
            activity.reduce((sum, d) => sum + d[s.key], 0),
          )}
        />
      }
    >
      <div className="grid grid-cols-[auto_1fr] gap-x-3 px-4 pb-3 pt-5">
        <div
          aria-hidden
          className={cn(
            "relative",
            AXIS_WIDTH[Math.min(count.format(scale.max).length, 6) - 1],
          )}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-xs tabular-nums text-text-dim"
              style={{ top: `${y(t)}%` }}
            >
              {count.format(t)}
            </span>
          ))}
        </div>

        <div
          role="group"
          tabIndex={0}
          aria-label="Daily activity chart. Use the arrow keys to read each day."
          onPointerDown={pickDay}
          onPointerMove={pickDay}
          onPointerLeave={() => setActive(null)}
          onKeyDown={stepDay}
          onFocus={() => setActive((a) => a ?? last)}
          onBlur={() => setActive(null)}
          className="relative h-44 touch-pan-y rounded-sm sm:h-56"
        >
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden
              className={cn(
                "absolute inset-x-0 border-t",
                t === 0 ? "border-border-strong" : "border-border/70",
              )}
              style={{ top: `${y(t)}%` }}
            />
          ))}

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
            className="absolute inset-0 size-full overflow-visible"
          >
            <motion.g
              initial={{ opacity: 0, scaleY: 0.85 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={ease(DURATION.slow)}
              style={{ originY: 1 }}
            >
              {SERIES.map((s) => (
                <g key={s.key}>
                  <path
                    d={`${linePath(s.key)} L100,100 L0,100 Z`}
                    className={s.area}
                  />
                  <path
                    d={linePath(s.key)}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className={s.line}
                  />
                </g>
              ))}
            </motion.g>
          </svg>

          {peak === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-text-dim">
              No events in the last 30 days
            </p>
          )}

          {day && active !== null && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-border-strong"
                style={{ left: `${x(active)}%` }}
              />
              {SERIES.map((s) => (
                <span
                  key={s.key}
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-1",
                    s.swatch,
                  )}
                  style={{ left: `${x(active)}%`, top: `${y(day[s.key])}%` }}
                />
              ))}
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-0 z-10 min-w-40 rounded border bg-surface-1 px-2.5 py-2 text-xs shadow-overlay",
                  x(active) > 55 ? "-translate-x-full -ml-3" : "ml-3",
                )}
                style={{ left: `${x(active)}%` }}
              >
                <p className="mb-1.5 text-text-muted">
                  {formatFullDay(day.day)}
                </p>
                <ul className="space-y-1">
                  {SERIES.map((s) => (
                    <li key={s.key} className="flex items-center gap-2">
                      <span
                        className={cn("h-0.5 w-2.5 rounded-full", s.swatch)}
                      />
                      <span className="font-medium tabular-nums text-text">
                        {count.format(day[s.key])}
                      </span>
                      <span className="text-text-muted">{s.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          <p className="sr-only" aria-live="polite">
            {readout}
          </p>
        </div>

        <div className="relative col-start-2 mt-2 h-4" aria-hidden>
          {xLabels.map((i, n) => (
            <span
              key={i}
              className={cn(
                "absolute whitespace-nowrap text-xs text-text-dim",
                n === 0
                  ? ""
                  : n === xLabels.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: `${x(i)}%` }}
            >
              {formatShortDay(activity[i].day)}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>Daily events, last 30 days (UTC)</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activity.map((d) => (
            <tr key={d.day}>
              <th scope="row">{formatShortDay(d.day)}</th>
              {SERIES.map((s) => (
                <td key={s.key}>{d[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function ActivityLegend({ totals }: { totals?: number[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
      {SERIES.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-sm", s.swatch)} />
          {s.label}
          {totals ? (
            <span className="tabular-nums text-text">
              {count.format(totals[i])}
            </span>
          ) : (
            <Skeleton className="h-3 w-6" />
          )}
        </li>
      ))}
    </ul>
  );
}

export function ActivitySkeleton() {
  return (
    <Panel
      title="Activity"
      caption="Last 30 days, UTC"
      aside={<ActivityLegend />}
    >
      <div className="grid grid-cols-[auto_1fr] gap-x-3 px-4 pb-3 pt-5">
        <div className="w-6" />
        <Skeleton className="h-44 sm:h-56" />
        <div className="col-start-2 mt-2 h-4" />
      </div>
    </Panel>
  );
}
