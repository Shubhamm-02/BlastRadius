export type Affected = { id: string; name: string; file: string };

const SARVAM_URL = "https://api.sarvam.ai/v1/chat/completions";
const SARVAM_MODEL = process.env.SARVAM_MODEL || "sarvam-105b";

/** Deterministic summary used when no API key is set or the API call fails. */
function deterministic(targetName: string, affected: Affected[]): string {
  const count = affected.length;
  if (count === 0) {
    return `Nothing calls ${targetName} transitively, so changing it looks safe.`;
  }
  const files = new Set(affected.map((a) => a.file)).size;
  const sample = affected
    .slice(0, 8)
    .map((a) => a.name)
    .join(", ");
  return `Changing ${targetName} affects ${count} function(s) across ${files} file(s): ${sample}${
    count > 8 ? "…" : ""
  }`;
}

/**
 * Produce a plain-English summary of the blast radius of changing `targetName`.
 * Uses Sarvam AI when SARVAM_API_KEY is set; otherwise falls back to a
 * deterministic summary so the app always works.
 */
export async function explainImpact(
  targetName: string,
  affected: Affected[],
): Promise<string> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return deterministic(targetName, affected);

  const list =
    affected.map((a) => `- ${a.name} (${a.file})`).join("\n") || "(none)";

  try {
    const res = await fetch(SARVAM_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // sarvam-105b is a reasoning model: it spends tokens on internal
        // reasoning before filling `content`, so give it generous headroom
        // or `content` comes back null.
        model: SARVAM_MODEL,
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `You are a code-impact assistant. A developer is about to change the function "${targetName}". A call-graph traversal found that these functions transitively depend on it (the blast radius):\n\n${list}\n\nIn 2 to 3 sentences, explain the blast radius and what the developer should double-check before shipping the change. Be concrete and concise. Do not use preamble.`,
          },
        ],
      }),
    });

    if (!res.ok) return deterministic(targetName, affected);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim()
      ? text.trim()
      : deterministic(targetName, affected);
  } catch {
    return deterministic(targetName, affected);
  }
}
