/**
 * Robust Server-Sent Events client parser.
 *
 * Properly handles:
 *  - Multi-line `data:` payloads
 *  - Events split across stream chunks
 *  - Comments / keepalives (lines starting with `:`)
 *  - Custom event names (`event:` field)
 *  - JSON-encoded data (auto-parses when valid)
 *
 * Why this exists: the previous client code used `buffer.split("\n")` and reset
 * `eventType` on every chunk, so SSE messages straddling chunk boundaries lost
 * their event type or had `data:` lines silently dropped. This caused the
 * "context box breaks generation" bug — when the user pasted a large debate
 * context, Anthropic streamed back chunks that landed mid-message.
 */

export type SSEHandler = (event: string, data: unknown, raw: string) => void;

export interface ConsumeOptions {
  signal?: AbortSignal;
  onError?: (err: unknown) => void;
}

export class SSEParser {
  private buffer = "";
  private currentEvent = "message";
  private dataLines: string[] = [];

  feed(chunk: string, onMessage: SSEHandler) {
    this.buffer += chunk;
    let newlineIndex: number;

    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const rawLine = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

      if (line === "") {
        this.dispatch(onMessage);
        continue;
      }

      if (line.startsWith(":")) {
        // SSE comment / keepalive — ignore.
        continue;
      }

      const colonIdx = line.indexOf(":");
      const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
      let value = colonIdx === -1 ? "" : line.slice(colonIdx + 1);
      if (value.startsWith(" ")) value = value.slice(1);

      switch (field) {
        case "event":
          this.currentEvent = value;
          break;
        case "data":
          this.dataLines.push(value);
          break;
        case "id":
        case "retry":
          // tracked but unused for our use case
          break;
        default:
          break;
      }
    }
  }

  /** Flush any partially-buffered final message at the end of the stream. */
  flush(onMessage: SSEHandler) {
    if (this.buffer.length > 0) {
      this.feed("\n", onMessage);
      this.buffer = "";
    }
    this.dispatch(onMessage);
  }

  private dispatch(onMessage: SSEHandler) {
    if (this.dataLines.length === 0) return;
    const raw = this.dataLines.join("\n");
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // not JSON, leave as string
    }
    onMessage(this.currentEvent, parsed, raw);
    this.currentEvent = "message";
    this.dataLines = [];
  }
}

export async function consumeSSE(
  response: Response,
  onMessage: SSEHandler,
  opts: ConsumeOptions = {}
): Promise<void> {
  if (!response.body) throw new Error("Response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const parser = new SSEParser();

  try {
    while (true) {
      if (opts.signal?.aborted) {
        await reader.cancel();
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      parser.feed(chunk, onMessage);
    }
    parser.feed(decoder.decode(), onMessage);
    parser.flush(onMessage);
  } catch (err) {
    if (opts.onError) opts.onError(err);
    else throw err;
  }
}

/**
 * Convenience: post JSON, stream SSE back, dispatch typed events.
 * Returns a controller that can abort the stream and a promise that resolves
 * when the stream completes (or rejects on network error).
 */
export function streamJSON(
  url: string,
  body: unknown,
  onMessage: SSEHandler,
  opts: { signal?: AbortSignal; headers?: Record<string, string> } = {}
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: JSON.stringify(body),
    signal: opts.signal,
  }).then(async (res) => {
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    await consumeSSE(res, onMessage, { signal: opts.signal });
    return res;
  });
}
