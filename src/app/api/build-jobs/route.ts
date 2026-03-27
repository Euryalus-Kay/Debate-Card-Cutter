import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: List active/recent build jobs for a user
export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user");
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    // Get a specific job
    const { data, error } = await supabase
      .from("build_jobs")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return Response.json({ error: error.message }, { status: 404 });
    return Response.json(data);
  }

  // List recent jobs for user (last 24h)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("build_jobs")
    .select("*")
    .eq("author_name", user || "")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return Response.json([], { headers: { "Content-Type": "application/json" } });
  return Response.json(data || []);
}
