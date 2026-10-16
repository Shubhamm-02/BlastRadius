import { plural } from "@/lib/format";
import { groupByFile } from "@/lib/graph-metrics";
import type { FunctionRef, ImpactResult } from "@/lib/impact";
import { affectedNoun, fileCount } from "./blast-radius";

const CHECKLIST_LIMIT = 40;

const locationOf = (fn: Pick<FunctionRef, "file" | "line">) =>
  `${fn.file}:${fn.line}`;

/** Markdown for a PR description: nearest functions first, grouped by file. */
export function prChecklist(result: ImpactResult, summary: string): string {
  const { target, affected, total, direction, depth, truncated } = result;
  const files = new Set(affected.map((fn) => fn.file)).size;
  const lines = [
    `### Blast radius: \`${target.name}\` (${locationOf(target)})`,
    "",
    `${total} ${affectedNoun(direction, total)} across ${fileCount(files, truncated)} within ${plural(depth, "hop")}.`,
  ];

  if (summary) {
    lines.push("", ...summary.split("\n").map((l) => `> ${l}`.trimEnd()));
  }

  for (const { file, fns } of groupByFile(affected.slice(0, CHECKLIST_LIMIT))) {
    lines.push(
      "",
      `#### \`${file}\``,
      ...fns.map(
        (fn) =>
          `- [ ] \`${fn.name}\` (${locationOf(fn)}), ${plural(fn.hops, "hop")}`,
      ),
    );
  }

  if (total > CHECKLIST_LIMIT) {
    lines.push("", `_Nearest ${CHECKLIST_LIMIT} of ${total} listed._`);
  }
  return lines.join("\n");
}
