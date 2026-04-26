import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { spawnApprovedBuild } from "@/lib/argument-builder";

const ADMIN_PASSCODE = "8867";

interface UpdateBody {
  action: "approve" | "reject";
  passcode: string;
  approved_by?: string;
  reason?: string;
}

const TABLE_CACHE_TTL_MS = 2 * 60 * 1000;
let _tableExistsCache: { value: boolean; at: number } | null = null;
async function tableExists(): Promise<boolean> {
  if (_tableExistsCache && Date.now() - _tableExistsCache.at < TABLE_CACHE_TTL_MS) {
    return _tableExistsCache.value;
  }
  try {
    const { error } = await supabase
      .from("build_requests")
      .select("id")
      .limit(1);
    let value = true;
    if (error) {
      const msg = error.message || "";
      if (
        msg.includes("does not exist") ||
        msg.includes("schema cache") ||
        msg.includes("not found")
      ) {
        value = false;
      } else {
        value = true;
      }
    }
    _tableExistsCache = { value, at: Date.now() };
    return value;
  } catch {
    _tableExistsCache = { value: false, at: Date.now() };
    return false;
  }
}

interface MemoryRow {
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

function memoryStore(): Map<string, MemoryRow> {
  const g = globalThis as { __BUILD_REQUEST_STORE__?: Map<string, MemoryRow> };
  return (g.__BUILD_REQUEST_STORE__ ??= new Map());
}

async function loadRequest(id: string) {
  if (await tableExists()) {
    const { data } = await supabase
      .from("build_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data;
  }
  return memoryStore().get(id) || null;
}

async function patchRequest(id: string, fields: Partial<MemoryRow>) {
  fields.updated_at = new Date().toISOString();
  if (await tableExists()) {
    await supabase.from("build_requests").update(fields).eq("id", id);
    return;
  }
  const cur = memoryStore().get(id);
  if (cur) memoryStore().set(id, { ...cur, ...fields } as MemoryRow);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const data = await loadRequest(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.passcode || body.passcode !== ADMIN_PASSCODE) {
    return NextResponse.json(
      { error: "Invalid admin passcode." },
      { status: 403 }
    );
  }

  const cur = await loadRequest(id);
  if (!cur)
    return NextResponse.json({ error: "Request not found" }, { status: 404 });

  if (cur.status !== "pending") {
    return NextResponse.json(
      {
        error: `Request is already ${cur.status}. Cannot ${body.action}.`,
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const approvedBy = (body.approved_by || "admin").trim();

  if (body.action === "reject") {
    await patchRequest(id, {
      status: "rejected",
      approved_by: approvedBy,
      approved_at: now,
      rejected_reason: body.reason || "",
      status_message: `Rejected by ${approvedBy}`,
    });
    const updated = await loadRequest(id);
    return NextResponse.json(updated);
  }

  if (body.action === "approve") {
    await patchRequest(id, {
      status: "approved",
      approved_by: approvedBy,
      approved_at: now,
      status_message: "Approved — build queued",
    });

    // Fire-and-forget the actual build. Don't block the approve response —
    // the build takes 3-6 minutes; the client polls the request to see it
    // transition pending → approved → building → built/failed.
    spawnApprovedBuild({
      requestId: id,
      requesterName: cur.requester_name,
      argumentType: cur.argument_type,
      query: cur.query,
      context: cur.context,
      judgeId: cur.judge_id,
      highlightMode: cur.highlight_mode,
      highlightInstruction: cur.highlight_instruction,
      onStatus: async (status, message, argumentId) => {
        await patchRequest(id, {
          status,
          status_message: message,
          ...(argumentId ? { argument_id: argumentId } : {}),
        });
      },
    }).catch(async (err) => {
      await patchRequest(id, {
        status: "failed",
        status_message:
          err instanceof Error ? err.message : "Build threw unexpectedly",
      });
    });

    const updated = await loadRequest(id);
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
