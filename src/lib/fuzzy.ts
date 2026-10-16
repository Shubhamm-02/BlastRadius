// Scores are only compared against each other; 0 means no match.

const isWordBoundary = (text: string, i: number): boolean => {
  if (i === 0) return true;
  const prev = text.charCodeAt(i - 1);
  const cur = text.charCodeAt(i);
  const prevIsLower = prev >= 97 && prev <= 122;
  const curIsUpper = cur >= 65 && cur <= 90;
  const prevIsAlnum =
    prevIsLower || (prev >= 65 && prev <= 90) || (prev >= 48 && prev <= 57);
  return !prevIsAlnum || (prevIsLower && curIsUpper);
};

/** Contiguous match only; used for file paths, where gapped matches are mostly noise. */
export function substringScore(
  query: string,
  text: string,
  lower: string,
  positions?: number[],
): number {
  const at = lower.indexOf(query);
  if (at === -1) return 0;
  if (positions) for (let i = 0; i < query.length; i++) positions.push(at + i);
  let score = 100 + query.length * 10 - Math.min(at, 30);
  if (at === 0) score += query.length === lower.length ? 120 : 60;
  else if (isWordBoundary(text, at)) score += 30;
  return score - lower.length * 0.05;
}

function nextBoundary(text: string, lower: string, ch: string, from: number) {
  for (
    let i = lower.indexOf(ch, from);
    i !== -1;
    i = lower.indexOf(ch, i + 1)
  ) {
    if (isWordBoundary(text, i)) return i;
  }
  return -1;
}

function subsequenceScore(
  query: string,
  text: string,
  lower: string,
  positions: number[] | undefined,
  preferBoundaries: boolean,
): number {
  const hits: number[] = [];
  let score = 0;
  let prev = -2;
  for (let qi = 0; qi < query.length; qi++) {
    let at = lower.indexOf(query[qi], prev + 1);
    if (at === -1) return 0;
    if (preferBoundaries && at !== prev + 1) {
      const boundary = nextBoundary(text, lower, query[qi], at);
      if (boundary !== -1) at = boundary;
    }
    if (at === prev + 1) score += 6;
    else if (isWordBoundary(text, at)) score += 8;
    else score -= Math.min(at - prev - 1, 4);
    hits.push(at);
    prev = at;
  }
  // Only report positions for a full match, so a failed token leaves no stray highlights.
  positions?.push(...hits);
  return Math.max(1, score + query.length - lower.length * 0.05);
}

/** `query` must already be lowercase; `lower` is `text` lowercased once up front. */
export function fuzzyScore(
  query: string,
  text: string,
  lower: string,
  positions?: number[],
): number {
  return (
    substringScore(query, text, lower, positions) ||
    // Jumping to camelCase humps reads intent ("prr" -> parseRepoRef) but can
    // overshoot letters a later query char needs, so fall back to plain greedy.
    subsequenceScore(query, text, lower, positions, true) ||
    subsequenceScore(query, text, lower, positions, false)
  );
}

export const tokenize = (query: string): string[] =>
  query.toLowerCase().split(/\s+/).filter(Boolean);

export function matchPositions(tokens: string[], text: string): Set<number> {
  const lower = text.toLowerCase();
  const positions: number[] = [];
  for (const token of tokens) fuzzyScore(token, text, lower, positions);
  return new Set(positions);
}
