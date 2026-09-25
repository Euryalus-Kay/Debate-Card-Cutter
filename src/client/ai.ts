"use client";

import type { Progress } from "@/domain/progress";
import { api, ApiError } from "./api";

export type OpEvent = { t: "op"; id: string } | { t: "partial"; data: unknown } | { t: "status"; data: string } | { t: "progress"; data: Progress } | { t: "done"; data: unknown } | { t: "error"; message: string };

/**
 * Start an AI operation and stream events. If the stream drops (network,
 * tab sleep), falls back to polling the persisted operation until it ends.
 */
export async function runOp(body: Record<string, unknown>, onEvent: (e: OpEvent) => void, signal?: AbortSignal): Promise<unknown> {
  let opId: string | null = null;
  let res: Response;
  try {
    res = await fetch("/api/ai/ops", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, credentials: "same-origin", signal });
  } catch {
    throw new ApiError(0, "Can't reach the server for AI right now. Everything you've written is still saved.");
  }
  if (!res.ok || !res.body) {
    let msg = `AI request failed (${res.status})`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  opId = res.headers.get("x-op-id");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: unknown = undefined;
  let failed: string | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line) as OpEvent;
        if (ev.t === "op") opId = ev.id;
        if (ev.t === "done") final = ev.data;
        if (ev.t === "error") failed = ev.message;
        onEvent(ev);
      }
    }
  } catch {
    // Stream interrupted: recover from the persisted operation.
  }
  if (failed) throw new ApiError(500, failed);
  if (final !== undefined) return final;
  if (!opId) throw new ApiError(0, "The AI request was interrupted.");
  for (let i = 0; i < 150; i++) {
    if (signal?.aborted) throw new ApiError(0, "Cancelled.");
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const { op } = await api<{ op: { status: string; output: unknown; error: string | null; partialText: string } }>(`/api/ai/ops/${opId}`);
      if (op.status === "complete") {
        onEvent({ t: "done", data: op.output });
        return op.output;
      }
      if (op.status === "failed" || op.status === "cancelled") throw new ApiError(500, op.error ?? "AI request failed.");
      if (op.partialText) onEvent({ t: "partial", data: JSON.parse(op.partialText) });
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400) throw e;
    }
  }
  throw new ApiError(0, "Timed out waiting for the AI result. It may still appear in the AI tab.");
}
