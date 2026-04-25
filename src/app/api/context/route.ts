import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const userName = req.nextUrl.searchParams.get("user");
  if (!userName) {
    return NextResponse.json({ error: "user param required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("user_contexts")
      .select("*")
      .eq("user_name", userName)
      .maybeSingle();

    if (error) {
      console.error("Context fetch error:", error.message);
      return NextResponse.json({ context: "" });
    }

    return NextResponse.json(data || { context: "" });
  } catch (err) {
    console.error("Context fetch exception:", err);
    return NextResponse.json({ context: "" });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userName = String(body.userName || "").trim();
    const context = String(body.context || "");

    if (!userName) {
      return NextResponse.json({ error: "userName is required" }, { status: 400 });
    }

    if (context.length > 50000) {
      return NextResponse.json(
        { error: "Context too long. Please keep under 50,000 characters." },
        { status: 400 }
      );
    }

    const { data: existing, error: lookupError } = await supabase
      .from("user_contexts")
      .select("id")
      .eq("user_name", userName)
      .maybeSingle();

    if (lookupError) {
      console.error("Context lookup error:", lookupError.message);
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("user_contexts")
        .update({ context, updated_at: new Date().toISOString() })
        .eq("user_name", userName);
      if (updateError) {
        console.error("Context update error:", updateError.message);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabase.from("user_contexts").insert({
        user_name: userName,
        context,
      });
      if (insertError) {
        console.error("Context insert error:", insertError.message);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Context POST exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save context" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const userName = req.nextUrl.searchParams.get("user");
  if (!userName) {
    return NextResponse.json({ error: "user param required" }, { status: 400 });
  }

  try {
    const { error } = await supabase
      .from("user_contexts")
      .delete()
      .eq("user_name", userName);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete context" },
      { status: 500 }
    );
  }
}
