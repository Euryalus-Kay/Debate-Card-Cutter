import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Get all known user names from both user_contexts and cards tables
export async function GET() {
  try {
    const names = new Set<string>();

    // Get from user_contexts
    const { data: contexts } = await supabase
      .from("user_contexts")
      .select("user_name")
      .order("user_name", { ascending: true });

    if (contexts) {
      for (const c of contexts) {
        if (c.user_name && c.user_name !== "Anonymous") names.add(c.user_name);
      }
    }

    // Also get unique author names from cards
    const { data: cards } = await supabase
      .from("cards")
      .select("author_name")
      .order("author_name", { ascending: true });

    if (cards) {
      for (const c of cards) {
        if (c.author_name && c.author_name !== "Anonymous") names.add(c.author_name);
      }
    }

    return NextResponse.json([...names].sort());
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

    const name = userName.trim();

    const { data: existing } = await supabase
      .from("user_contexts")
      .select("id")
      .eq("user_name", name)
      .single();

    if (!existing) {
      await supabase.from("user_contexts").insert({
        user_name: name,
        context: "",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Register user error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
