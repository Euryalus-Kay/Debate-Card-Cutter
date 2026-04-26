import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Approval-gated build requests.
 *
 * Anyone can POST a request to build an argument. The request lands in
 * `build_requests` with status='pending'. An admin (someone with the
 * passcode) approves it via PATCH on /api/build-requests/[id], which fires
 * off the actual build and updates the row.
 *
 * Falls back to an in-memory store if the build_requests table doesn't
 * exist yet — that way the feature works before the user runs the SQL
 * migration.
 */

import type { CostEstimate } from "@/components/argument/CostWarning";

interface InMemoryRow {
  id: string;
  requester_name: string;
  argument_type: string;
  query: string;
  context: string;
  judge_id: string | null;
  highlight_mode: string;
  highlight_instruction: string;
  status: "pending" | "approved" | "rejected" | "building" | "built" | "failed";
  status_message: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string;
  argument_id: string | null;
  estimated_cost_usd_low: number | null;
  estimated_cost_usd_high: number | null;
  estimated_cards: number | null;
  created_at: string;
  updated_at: string;
}

const MEMORY_STORE: Map<string, InMemoryRow> = (
  globalThis as { __BUILD_REQUEST_STORE__?: Map<string, InMemoryRow> }
).__BUILD_REQUEST_STORE__ ??
  ((globalThis as { __BUILD_REQUEST_STORE__?: Map<string, InMemoryRow> }).__BUILD_REQUEST_STORE__ =
    new Map());

/** Cached table-existence check. Tries an actual select that would fail if
 * the table is missing, then memoizes for the lifetime of the server. */
let _tableExistsCache: boolean | null = null;
async function tableExists(): Promise<boolean> {
  if (_tableExistsCache !== null) return _tableExistsCache;
  try {
    const { error } = await supabase
      .from("build_requests")
      .select("id")
      .limit(1);
    if (error) {
      // Postgres: relation does not exist / schema cache miss
      const msg = error.message || "";
      if (
        msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        msg.includes("not found")
      ) {
        _tableExistsCache = false;
        return false;
      }
      // Other errors: assume table exists; let the actual operation surface the issue
      _tableExistsCache = true;
      return true;
    }
    _tableExistsCache = true;
    return true;
  } catch {
    _tableExistsCache = false;
    return false;
  }
}

function newId() {
  return (
    (globalThis.crypto as Crypto | undefined)?.randomUUID?.() ||
    `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const requesterName = String(body.requester_name || "").trim();
    if (!requesterName) {
      return NextResponse.json(
        { error: "requester_name required" },
        { status: 400 }
      );
    }
    if (!body.query || !String(body.query).trim()) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const estimate = body.estimate as CostEstimate | undefined;
    const row: InMemoryRow = {
      id: newId(),
      requester_name: requesterName,
      argument_type: String(body.argument_type || "custom"),
      query: String(body.query).slice(0, 4000),
      context: String(body.context || "").slice(0, 4000),
      judge_id: body.judge_id || null,
      highlight_mode: String(body.highlight_mode || "medium"),
      highlight_instruction: String(body.highlight_instruction || "").slice(0, 1500),
      status: "pending",
      status_message: "",
      approved_by: null,
      approved_at: null,
      rejected_reason: "",
      argument_id: null,
      estimated_cost_usd_low: estimate?.estimatedCostUSD?.low ?? null,
      estimated_cost_usd_high: estimate?.estimatedCostUSD?.high ?? null,
      estimated_cards: estimate?.cardCount ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (await tableExists()) {
      const { data, error } = await supabase
        .from("build_requests")
        .insert(row)
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }
    MEMORY_STORE.set(row.id, row);
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create request" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const user = req.nextUrl.searchParams.get("user");
  const id = req.nextUrl.searchParams.get("id");

  if (await tableExists()) {
    let q = supabase
      .from("build_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (id) q = q.eq("id", id);
    if (status) q = q.eq("status", status);
    if (user) q = q.eq("requester_name", user);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (id) return NextResponse.json(data?.[0] || null);
    return NextResponse.json(data || []);
  }

  // Memory fallback
  const all = Array.from(MEMORY_STORE.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  let rows = all;
  if (id) rows = rows.filter((r) => r.id === id);
  if (status) rows = rows.filter((r) => r.status === status);
  if (user) rows = rows.filter((r) => r.requester_name === user);
  if (id) return NextResponse.json(rows[0] || null);
  return NextResponse.json(rows);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (await tableExists()) {
    await supabase.from("build_requests").delete().eq("id", id);
  }
  MEMORY_STORE.delete(id);
  return NextResponse.json({ success: true });
}
