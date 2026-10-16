export { formatShortDay, relativeTime } from "@/lib/format";

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

export const formatFullDay = (ms: number) => fullDate.format(ms);
export const formatTimestamp = (ms: number) => `${timestamp.format(ms)} UTC`;

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
