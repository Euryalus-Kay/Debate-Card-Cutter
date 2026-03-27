import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

// Classify a single card into existing folders — uses Haiku for speed/cost
export async function POST(req: NextRequest) {
  const { card_id, tag, cite_author, profile } = await req.json();
  const sortProfile = profile || "default";

  // Get existing folders for this profile
  const { data: folders } = await supabase
    .from("card_folders")
    .select("id, path, name")
    .eq("sort_profile", sortProfile)
    .order("path", { ascending: true });

  if (!folders?.length) {
    return Response.json({ sorted: false, reason: "No folders exist yet" });
  }

  // Use Sonnet to pick the right folders — cheap, one card
  const folderList = folders.map(f => `[${f.id}] ${f.path}`).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Which folders should this debate card go in? Pick the most specific matching folder(s).

Card: "${tag}" by ${cite_author}

Available folders:
${folderList}

Return JSON array of folder IDs only: ["uuid1", "uuid2"]
If no folder fits, return []`,
      }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || "[]";
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return Response.json({ sorted: false });

  try {
    const folderIds: string[] = JSON.parse(match[0]);

    for (const folderId of folderIds) {
      await supabase.from("card_folder_items").upsert(
        { card_id, folder_id: folderId },
        { onConflict: "card_id,folder_id" }
      );
    }

    return Response.json({ sorted: true, folder_count: folderIds.length });
  } catch {
    return Response.json({ sorted: false });
  }
}
