import { NextRequest, NextResponse } from "next/server";
import { buildFrontline } from "@/lib/anthropic-coach";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";

export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const userName = req.nextUrl.searchParams.get("user");
  try {
    let query = supabase
      .from("frontline_blocks")
      .select("*")
      .order("created_at", { ascending: false });
    if (userName) query = query.eq("author_name", userName);
    const { data, error } = await query;
    if (error) {
      console.error("Frontline list error:", error.message);
      return NextResponse.json([]);
    }
    return NextResponse.json(data || []);
  } catch (err) {
    console.error("Frontline list exception:", err);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { side, argumentDescription, argType, judgeId, context, authorName } = body;

    if (!argumentDescription) {
      return NextResponse.json(
        { error: "argumentDescription required" },
        { status: 400 }
      );
    }

    const block = await buildFrontline(
      side === "neg" ? "neg" : "aff",
      argumentDescription,
      argType || "da",
      judgeId || null,
      context || ""
    );

    const id = uuid();
    const row = {
      id,
      title: block.title,
      side: side === "neg" ? "neg" : "aff",
      arg_type: block.argType,
      context: block.context,
      responses: block.responses,
      cascade_order: block.cascadeOrder,
      judge_notes: block.judgeNotes,
      judge_id: judgeId || null,
      author_name: authorName || "Anonymous",
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("frontline_blocks").insert(row);
    if (insertError) {
      console.error("Frontline save error:", insertError.message);
      // still return the generated block
    }

    return NextResponse.json({ id, ...block, savedToDb: !insertError });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Frontline build failed",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("frontline_blocks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
