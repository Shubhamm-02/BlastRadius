import neo4j, { type Driver } from "neo4j-driver";
import type { ImpactResult } from "@/lib/impact";

const SARVAM_URL = "https://api.sarvam.ai/v1/chat/completions";
const SARVAM_MODEL = process.env.SARVAM_MODEL || "sarvam-105b";
const TIMEOUT_MS = 15_000;
const PROMPT_FUNCTIONS = 40; // closest affected functions sent to the model

export type ExplanationSource = "cache" | "llm" | "fallback";

/** Cache key component: the same function explains differently per direction/depth. */
function variantOf(impact: ImpactResult): string {
  return `${impact.direction}:${impact.depth}`;
}

/** Deterministic summary used when no API key is set or the API call fails. */
export function deterministicExplanation(impact: ImpactResult): string {
  const { target, total, affected, direction } = impact;
  if (total === 0) {
    return direction === "upstream"
      ? `Nothing calls ${target.name} transitively, so changing it looks safe.`
      : `${target.name} doesn't call any other indexed function.`;
  }
  const files = new Set(affected.map((a) => a.file)).size;
  const direct = affected.filter((a) => a.hops === 1).length;
  const sample = affected
    .slice(0, 8)
    .map((a) => a.name)
    .join(", ");
  const more = total > 8 ? "…" : "";
  return direction === "upstream"
    ? `Changing ${target.name} affects ${total} function(s) across ${files}${impact.truncated ? "+" : ""} file(s), ${direct} of them direct callers: ${sample}${more}`
    : `${target.name} depends on ${total} function(s) across ${files}${impact.truncated ? "+" : ""} file(s), ${direct} called directly: ${sample}${more}`;
}

function buildPrompt(impact: ImpactResult): string {
  const { target, total, affected, direction, depth } = impact;
  const top = affected.slice(0, PROMPT_FUNCTIONS); // already sorted by hops
  const list =
    top
      .map(
        (a) =>
          `- ${a.name} (${a.file}, ${a.hops} hop${a.hops === 1 ? "" : "s"})`,
      )
      .join("\n") || "(none)";
  const files = new Set(affected.map((a) => a.file)).size;
  const totals = `Totals: ${total} function(s) across ${files}${impact.truncated ? "+" : ""} file(s) within ${depth} hops${
    total > top.length ? `; the ${top.length} closest are listed` : ""
  }.`;
  return direction === "upstream"
    ? `You are a code-impact assistant. A developer is about to change the function "${target.name}" (${target.file}). A call-graph traversal found these functions that transitively depend on it (the blast radius):\n\n${list}\n\n${totals}\n\nIn 2 to 3 sentences, explain the blast radius and what the developer should double-check before shipping the change. Be concrete and concise. Do not use preamble.`
    : `You are a code-impact assistant. A developer is looking at the function "${target.name}" (${target.file}). A call-graph traversal found these functions it transitively depends on:\n\n${list}\n\n${totals}\n\nIn 2 to 3 sentences, explain which dependencies matter most and what could break "${target.name}" if they change. Be concrete and concise. Do not use preamble.`;
}

export async function getCachedExplanation(
  driver: Driver,
  projectId: string,
  impact: ImpactResult,
): Promise<string | null> {
  const res = await driver.executeQuery(
    `MATCH (e:Explanation { projectId: $pid, functionId: $fid, variant: $variant })
     RETURN e.text AS text`,
    { pid: projectId, fid: impact.target.id, variant: variantOf(impact) },
    { routing: "READ" },
  );
  return (res.records[0]?.get("text") as string | undefined) ?? null;
}

async function cacheExplanation(
  driver: Driver,
  projectId: string,
  impact: ImpactResult,
  text: string,
): Promise<void> {
  await driver.executeQuery(
    `MERGE (e:Explanation { projectId: $pid, functionId: $fid, variant: $variant })
     SET e.text = $text, e.model = $model, e.createdAt = $now`,
    {
      pid: projectId,
      fid: impact.target.id,
      variant: variantOf(impact),
      text,
      model: SARVAM_MODEL,
      now: neo4j.int(Date.now()),
    },
  );
}

/** Yields `content` deltas from an OpenAI-style SSE chat-completion stream. */
async function* sseContent(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string | null } }[];
          };
          // Reasoning models also stream `reasoning_content`; only forward the answer.
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          // ignore keep-alives / partial frames
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Explain the blast radius as a stream of text chunks: the cached answer if
 * there is one, Sarvam AI's streamed answer when SARVAM_API_KEY is set, or a
 * deterministic summary otherwise (also used if the API fails or times out
 * before producing anything).
 */
export function explainImpactStream(
  driver: Driver,
  projectId: string,
  impact: ImpactResult,
  opts: { cached?: string | null; signal?: AbortSignal } = {},
): ReadableStream<string> {
  const key = process.env.SARVAM_API_KEY;
  const abort = new AbortController();
  let cancelled = false;

  return new ReadableStream<string>({
    cancel() {
      cancelled = true; // client went away
      abort.abort();
    },
    async start(controller) {
      const send = (s: string) => {
        if (!cancelled) controller.enqueue(s);
      };
      const close = () => {
        if (!cancelled) controller.close();
      };
      if (opts.cached) {
        send(opts.cached);
        return close();
      }
      if (!key) {
        send(deterministicExplanation(impact));
        return close();
      }

      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
      const onClientAbort = () => abort.abort();
      opts.signal?.addEventListener("abort", onClientAbort);

      let text = "";
      let complete = false;
      try {
        const res = await fetch(SARVAM_URL, {
          method: "POST",
          signal: abort.signal,
          headers: {
            "api-subscription-key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // sarvam-105b is a reasoning model: it spends tokens on internal
            // reasoning before filling `content`, so give it generous headroom
            // or `content` comes back empty.
            model: SARVAM_MODEL,
            max_tokens: 1500,
            stream: true,
            messages: [{ role: "user", content: buildPrompt(impact) }],
          }),
        });
        if (!res.ok || !res.body) {
          console.error(`[explain] Sarvam responded ${res.status}`);
        } else {
          for await (const chunk of sseContent(res.body)) {
            // Strip leading whitespace so the first visible token isn't blank.
            const out = text ? chunk : chunk.trimStart();
            if (!out) continue;
            text += out;
            send(out);
          }
          complete = true;
        }
      } catch (err) {
        if (!abort.signal.aborted)
          console.error("[explain] Sarvam request failed", err);
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onClientAbort);
      }

      if (cancelled) return;
      if (!text.trim()) {
        send(deterministicExplanation(impact));
      } else if (!complete) {
        send(" …");
      } else {
        await cacheExplanation(driver, projectId, impact, text.trim()).catch(
          (err) => console.error("[explain] cache write failed", err),
        );
      }
      close();
    },
  });
}

export async function explainImpact(
  driver: Driver,
  projectId: string,
  impact: ImpactResult,
  opts: { cached?: string | null; signal?: AbortSignal } = {},
): Promise<string> {
  let out = "";
  const reader = explainImpactStream(
    driver,
    projectId,
    impact,
    opts,
  ).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return out.trim();
    out += value;
  }
}

export function explanationSource(cached: string | null): ExplanationSource {
  if (cached) return "cache";
  return process.env.SARVAM_API_KEY ? "llm" : "fallback";
}
