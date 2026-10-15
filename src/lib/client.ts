export class RequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Parse a JSON response, throwing a RequestError with the API's safe message on failure. */
export async function readJson<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body (e.g. a proxy error page)
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)
      ?.error;
    throw new RequestError(
      err?.message ?? `Request failed (${res.status}).`,
      err?.code ?? "http_error",
      res.status,
    );
  }
  return body as T;
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  return readJson<T>(await fetch(url, init));
}

export async function readText(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) onChunk(text);
  }
}

export async function readNdjson<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
): Promise<void> {
  let buf = "";
  await readText(body, (text) => {
    buf += text;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as T);
    }
  });
  if (buf.trim()) onEvent(JSON.parse(buf) as T);
}

// Privacy-friendly anonymous id (no PII), persisted per browser.
export function getAnonId(): string {
  try {
    let id = localStorage.getItem("br_anon");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("br_anon", id);
    }
    return id;
  } catch {
    return "anon";
  }
}
