import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight timer share endpoint. Uses an in-memory map keyed by share key
 * so partners on the same browser session/server instance can sync timer
 * state. State expires after 4 hours of inactivity.
 *
 * For production multi-instance use, swap the Map for Redis or Supabase.
 * Kept simple here so the feature works out of the box.
 */

interface SharedState {
  state: Record<string, unknown>;
  updatedAt: number;
}

const SHARE_TTL_MS = 4 * 60 * 60 * 1000;
const STORE: Map<string, SharedState> = (
  globalThis as { __TIMER_SHARE_STORE__?: Map<string, SharedState> }
).__TIMER_SHARE_STORE__ ??
  ((globalThis as { __TIMER_SHARE_STORE__?: Map<string, SharedState> }).__TIMER_SHARE_STORE__ = new Map());

function purge() {
  const now = Date.now();
  for (const [k, v] of STORE.entries()) {
    if (now - v.updatedAt > SHARE_TTL_MS) STORE.delete(k);
  }
}

export async function GET(req: NextRequest) {
  purge();
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const v = STORE.get(key);
  if (!v) return NextResponse.json({ state: null, updatedAt: 0 });
  return NextResponse.json(v);
}

export async function POST(req: NextRequest) {
  purge();
  try {
    const body = await req.json();
    if (!body?.shareKey)
      return NextResponse.json({ error: "shareKey required" }, { status: 400 });
    STORE.set(String(body.shareKey), {
      state: body.state || {},
      updatedAt: Date.now(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to share state" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  STORE.delete(key);
  return NextResponse.json({ ok: true });
}
