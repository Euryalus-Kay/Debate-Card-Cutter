import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

// Use Haiku for cheap/fast sorting
async function classifyCards(
  cards: Array<{ id: string; tag: string; cite_author: string }>,
  sortMode: "default" | "custom",
  customRules?: string
): Promise<Array<{ card_id: string; folders: string[] }>> {
  const prompt = sortMode === "custom" && customRules
    ? `Sort these debate cards into folders based on these custom rules:\n${customRules}\n\nReturn a JSON array.`
    : `Sort these debate cards into a hierarchical folder structure for a high school policy debate library.

FOLDER HIERARCHY:
Level 1: Side — classify by WHICH SIDE READS THIS CARD:
  - "Affirmative" = cards the AFF team reads (case advantages, plan solvency, inherency, 2AC answers to neg args, aff extensions)
  - "Negative" = cards the NEG team reads (DAs, CPs, Ks, T shells, case defense, neg extensions)
  - "Flexible" = cards either side could use (impact defense, generic framework, evidence indicts)

CRITICAL CLASSIFICATION RULES:
- Disadvantages (DAs) are ALWAYS Negative — the neg reads DAs against the aff plan
- Counterplans (CPs) are ALWAYS Negative — the neg reads CPs as alternatives to the aff plan
- Kritiks (Ks) are ALWAYS Negative (unless it's a K aff, which goes under Affirmative/Case)
- Topicality is ALWAYS Negative — neg argues aff is not topical
- Case advantages, plan text, solvency, inherency are ALWAYS Affirmative
- Answers TO DAs (like "no link to spending DA") are Affirmative — the aff reads those answers
- Answers TO CPs (like "perm do both") are Affirmative
- Impact defense cards are Flexible

Level 2: Argument type (Case, Disadvantages, Counterplans, Kritiks, Topicality, Theory, Framework, Impact Defense, Answers)
Level 3: Specific argument (e.g., "Spending DA", "States CP", "Capitalism K", "T-Substantial")

Return JSON array only.`;

  const cardList = cards.map(c => `[${c.id}] ${c.tag} (${c.cite_author})`).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{
        role: "user",
        content: `${prompt}\n\nCards to sort:\n${cardList}\n\nReturn JSON array: [{"card_id":"uuid","folders":["Level1/Level2/Level3"]}]`,
      }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

export async function POST(req: NextRequest) {
  const { sort_mode, custom_rules, profile_name, created_by } = await req.json();
  const sortProfile = profile_name || "default";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send("progress", { label: "Loading cards...", step: 1, total: 4 });

        // Get all cards
        const { data: cards } = await supabase
          .from("cards")
          .select("id, tag, cite_author")
          .order("created_at", { ascending: false });

        if (!cards?.length) {
          send("error", { message: "No cards to sort" });
          controller.close();
          return;
        }

        send("progress", { label: `Classifying ${cards.length} cards...`, step: 2, total: 4 });

        // Batch cards (50 at a time) for classification
        const BATCH = 50;
        const allAssignments: Array<{ card_id: string; folders: string[] }> = [];

        for (let i = 0; i < cards.length; i += BATCH) {
          const batch = cards.slice(i, i + BATCH);
          send("progress", {
            label: `Classifying cards ${i + 1}-${Math.min(i + BATCH, cards.length)} of ${cards.length}...`,
            step: 2, total: 4,
          });
          const assignments = await classifyCards(batch, sort_mode || "default", custom_rules);
          allAssignments.push(...assignments);
        }

        send("progress", { label: "Creating folder structure...", step: 3, total: 4 });

        // Delete existing folders for this profile
        const { data: existingFolders } = await supabase
          .from("card_folders")
          .select("id")
          .eq("sort_profile", sortProfile);

        if (existingFolders?.length) {
          const folderIds = existingFolders.map(f => f.id);
          await supabase.from("card_folder_items").delete().in("folder_id", folderIds);
          await supabase.from("card_folders").delete().eq("sort_profile", sortProfile);
        }

        // Collect all unique folder paths
        const allPaths = new Set<string>();
        for (const a of allAssignments) {
          for (const folder of a.folders) {
            // Add all parent paths too
            const parts = folder.split("/");
            for (let j = 1; j <= parts.length; j++) {
              allPaths.add(parts.slice(0, j).join("/"));
            }
          }
        }

        // Create folders
        const folderMap = new Map<string, string>(); // path -> id

        const sortedPaths = Array.from(allPaths).sort();
        for (const path of sortedPaths) {
          const parts = path.split("/");
          const name = parts[parts.length - 1];
          const parentPath = parts.slice(0, -1).join("/");
          const parentId = parentPath ? folderMap.get(parentPath) || null : null;
          const id = uuid();

          await supabase.from("card_folders").insert({
            id, name, parent_id: parentId, path, depth: parts.length - 1,
            sort_profile: sortProfile, created_by: created_by || "system",
          });
          folderMap.set(path, id);
        }

        send("progress", { label: "Assigning cards to folders...", step: 4, total: 4 });

        // Assign cards to folders
        const itemInserts: Array<{ card_id: string; folder_id: string }> = [];
        for (const a of allAssignments) {
          for (const folderPath of a.folders) {
            const folderId = folderMap.get(folderPath);
            if (folderId) {
              itemInserts.push({ card_id: a.card_id, folder_id: folderId });
            }
          }
        }

        // Batch insert
        for (let i = 0; i < itemInserts.length; i += 100) {
          await supabase.from("card_folder_items").insert(itemInserts.slice(i, i + 100));
        }

        // Save sort profile if custom
        if (sort_mode === "custom" && custom_rules) {
          await supabase.from("sort_profiles").upsert({
            name: sortProfile,
            description: custom_rules.substring(0, 200),
            created_by: created_by || "Anonymous",
            rules: [{ type: "custom", rules: custom_rules }],
          }, { onConflict: "name" });
        }

        send("done", {
          folders_created: folderMap.size,
          cards_sorted: allAssignments.length,
          profile: sortProfile,
        });
        controller.close();
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "Sort failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
