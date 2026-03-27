import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";

// GET: List all folders for a sort profile
export async function GET(req: NextRequest) {
  const profile = req.nextUrl.searchParams.get("profile") || "default";

  const { data: folders } = await supabase
    .from("card_folders")
    .select("*")
    .eq("sort_profile", profile)
    .order("path", { ascending: true });

  const { data: items } = await supabase
    .from("card_folder_items")
    .select("card_id, folder_id");

  return Response.json({ folders: folders || [], items: items || [] });
}

// POST: Create folder or sort cards
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "create_folder") {
    const { name, parent_id, sort_profile } = body;
    const parentPath = parent_id
      ? (await supabase.from("card_folders").select("path, depth").eq("id", parent_id).single()).data
      : null;

    const id = uuid();
    const path = parentPath ? `${parentPath.path}/${name}` : name;
    const depth = parentPath ? parentPath.depth + 1 : 0;

    const { error } = await supabase.from("card_folders").insert({
      id, name, parent_id: parent_id || null,
      path, depth, sort_profile: sort_profile || "default",
      created_by: body.created_by || "system",
    });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ id, path });
  }

  if (body.action === "assign_card") {
    const { card_id, folder_id } = body;
    const { error } = await supabase.from("card_folder_items").upsert(
      { card_id, folder_id },
      { onConflict: "card_id,folder_id" }
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  }

  if (body.action === "unassign_card") {
    const { card_id, folder_id } = body;
    await supabase.from("card_folder_items").delete().eq("card_id", card_id).eq("folder_id", folder_id);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}

// DELETE: Delete a folder
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await supabase.from("card_folder_items").delete().eq("folder_id", id);
  await supabase.from("card_folders").delete().eq("id", id);
  return Response.json({ success: true });
}
