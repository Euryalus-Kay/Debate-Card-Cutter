import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Get all known user names
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("user_contexts")
      .select("user_name")
      .order("user_name", { ascending: true });

    if (error) throw error;

    const names = (data || []).map((d: { user_name: string }) => d.user_name);
    return NextResponse.json(names);
  } catch (error) {
    console.error("Fetch users error:", error);
    return NextResponse.json([]);
  }
}

// Register a new user name
export async function POST(req: NextRequest) {
  try {
    const { userName } = await req.json();
    if (!userName?.trim()) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("user_contexts")
      .select("id")
      .eq("user_name", userName.trim())
      .single();

    if (!existing) {
      await supabase.from("user_contexts").insert({
        user_name: userName.trim(),
        context: "",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register user error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
