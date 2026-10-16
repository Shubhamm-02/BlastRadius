const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const shortDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export const formatShortDay = (ms: number) => shortDay.format(ms);

export const plural = (count: number, word: string) =>
  `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

/** "just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function relativeTime(ms: number, now: number): string {
  const elapsed = Math.max(0, now - ms);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return formatShortDay(ms);
}
