import Anthropic from "@anthropic-ai/sdk";

export type Affected = { id: string; name: string; file: string };

/**
 * Produce a plain-English summary of the blast radius of changing `targetName`.
 * Uses Claude when ANTHROPIC_API_KEY is set; otherwise falls back to a
 * deterministic summary so the app works without a key.
 */
export async function explainImpact(
  targetName: string,
  affected: Affected[],
): Promise<string> {
  const count = affected.length;
  const files = [...new Set(affected.map((a) => a.file))];

  if (!process.env.ANTHROPIC_API_KEY) {
    if (count === 0) {
      return `Nothing calls ${targetName} transitively — changing it looks safe.`;
    }
    const sample = affected
      .slice(0, 8)
      .map((a) => a.name)
      .join(", ");
    return `Changing ${targetName} impacts ${count} function(s) across ${files.length} file(s): ${sample}${
      count > 8 ? "…" : ""
    }`;
  }

  const client = new Anthropic();
  const list =
    affected.map((a) => `- ${a.name} (${a.file})`).join("\n") || "(none)";

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `You are a code-impact assistant. A developer is about to change the function "${targetName}". A call-graph traversal found that these functions transitively depend on it (the blast radius):\n\n${list}\n\nIn 2-3 sentences, explain the blast radius and what the developer should double-check before shipping the change. Be concrete and concise. Do not use preamble.`,
      },
    ],
  });

  const textBlock = message.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  return textBlock?.text ?? "(no explanation generated)";
}
