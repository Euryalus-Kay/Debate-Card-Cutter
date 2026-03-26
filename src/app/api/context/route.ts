import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const userName = req.nextUrl.searchParams.get("user");
  if (!userName) {
    return NextResponse.json({ error: "user param required" }, { status: 400 });
  }

  const { data } = await supabase
    .from("user_contexts")
    .select("*")
    .eq("user_name", userName)
    .single();

  return NextResponse.json(data || { context: "" });
}

export async function POST(req: NextRequest) {
  const { userName, context } = await req.json();

  const { data: existing } = await supabase
    .from("user_contexts")
    .select("id")
    .eq("user_name", userName)
    .single();

  if (existing) {
    await supabase
      .from("user_contexts")
      .update({ context, updated_at: new Date().toISOString() })
      .eq("user_name", userName);
  } else {
    await supabase.from("user_contexts").insert({
      user_name: userName,
      context,
    });
  }

  return NextResponse.json({ success: true });
}
