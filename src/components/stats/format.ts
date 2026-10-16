const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const fullDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const timestamp = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export const formatShortDay = (ms: number) => shortDate.format(ms);
export const formatFullDay = (ms: number) => fullDate.format(ms);
export const formatTimestamp = (ms: number) => `${timestamp.format(ms)} UTC`;

export function relativeTime(ms: number, now: number): string {
  const elapsed = Math.max(0, now - ms);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return formatShortDay(ms);
}

/** Ids are "src/a.ts#Cart.add"; the part after the first "#" is the name. */
export function splitFunctionId(functionId: string) {
  const hash = functionId.indexOf("#");
  if (hash < 0) return { name: functionId, file: null };
  return { name: functionId.slice(hash + 1), file: functionId.slice(0, hash) };
}

export function appHref(projectId: string, functionId?: string) {
  const params = new URLSearchParams({ projectId });
  if (functionId) params.set("fn", functionId);
  return `/?${params}`;
}
