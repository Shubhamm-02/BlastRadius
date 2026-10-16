import { HOP_STAGGER_MS } from "@/lib/motion";

export const LIGHT_MS = 200;
export const RING_MS = 600;
export const RING_GAP_MS = 180;
export const MODE_FADE_MS = 250;
export const CAMERA_MS = 400;
/** The hop wave starts just after the target ring, so it reads as emanating from it. */
const WAVE_LEAD_MS = 120;

export const easeOut = (t: number) => 1 - (1 - t) ** 3;

export const progress = (start: number, now: number, duration: number) =>
  duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - start) / duration));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hop 1 is brightest; each further hop fades, with a floor so deep hops stay legible. */
export const hopAlpha = (hop: number) => Math.max(0.4, 1 - (hop - 1) * 0.15);

export interface ModeFade {
  from: number;
  to: number;
  at: number;
}

/** 0 = full graph, 1 = blast-radius focus. */
export function focusMix(fade: ModeFade, now: number, reduced: boolean) {
  if (reduced) return fade.to;
  return lerp(
    fade.from,
    fade.to,
    easeOut(progress(fade.at, now, MODE_FADE_MS)),
  );
}

/**
 * Assigns a light-up time to every newly affected function and forgets the
 * ones no longer affected. Functions already lit keep their time, so a depth
 * change only animates the hops it adds. Returns when the wave finishes.
 */
export function scheduleWave(
  litAt: Map<string, number>,
  hops: Map<string, number>,
  now: number,
  ringAt: number | null,
  reduced: boolean,
): number {
  for (const id of litAt.keys()) if (!hops.has(id)) litAt.delete(id);
  if (reduced) {
    for (const id of hops.keys()) if (!litAt.has(id)) litAt.set(id, 0);
    return now;
  }

  let minHop = Infinity;
  let maxHop = 0;
  for (const [id, hop] of hops) {
    if (litAt.has(id)) continue;
    minHop = Math.min(minHop, hop);
    maxHop = Math.max(maxHop, hop);
  }
  if (maxHop === 0) return now;

  const start = Math.max(now, (ringAt ?? 0) + WAVE_LEAD_MS);
  for (const [id, hop] of hops) {
    if (!litAt.has(id)) litAt.set(id, start + (hop - minHop) * HOP_STAGGER_MS);
  }
  return start + (maxHop - minHop) * HOP_STAGGER_MS + LIGHT_MS;
}

export function litProgress(
  litAt: Map<string, number>,
  id: string,
  now: number,
) {
  const at = litAt.get(id);
  return at === undefined ? 0 : easeOut(progress(at, now, LIGHT_MS));
}
