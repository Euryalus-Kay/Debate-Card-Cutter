import { NextRequest } from "next/server";
import { searchEvidence, deepSearchSource } from "@/lib/perplexity";
import { generateCard, generateCardFast, selectBestSource } from "@/lib/anthropic";
import { scrapeArticle } from "@/lib/scraper";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { query, context, authorName, argumentId, rapid } = await req.json();

  if (!query) {
    return new Response(JSON.stringify({ error: "Query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Stream progress updates via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        // Step 1
        send("progress", { step: 1, total: 5, label: "Searching for evidence...", icon: "search" });

        const searchResults = await searchEvidence(query, context || "", rapid);

        if (!searchResults.sources.length) {
          send("error", { message: "No sources found. Try a more specific query." });
          controller.close();
          return;
        }

        send("progress", {
          step: 2, total: 5,
          label: `Found ${searchResults.sources.length} sources. Selecting best one...`,
          icon: "filter",
        });

        // Step 2
        let selectedUrl = searchResults.sources[0].url;
        if (!rapid && searchResults.sources.length > 1) {
          try {
            const selection = await selectBestSource(query, searchResults.answer, searchResults.sources);
            selectedUrl = selection.selectedUrl;
          } catch {
            // Fall back
          }
        }

        send("progress", { step: 3, total: 5, label: "Fetching full article text...", icon: "download" });

        // Step 3
        let fullText = await scrapeArticle(selectedUrl);
        if (fullText.length < 500) {
          send("progress", { step: 3, total: 5, label: "Deep searching source content...", icon: "download" });
          fullText = await deepSearchSource(selectedUrl, query);
        }
        if (fullText.length < 100) {
          fullText = searchResults.answer;
        }

        send("progress", {
          step: 4, total: 5,
          label: rapid ? "Generating card with Sonnet..." : "Generating card with Opus (this takes a moment)...",
          icon: "sparkle",
        });

        // Step 4
        const sourceInfo = searchResults.answer;
        const cardGen = rapid ? generateCardFast : generateCard;
        const card = await cardGen(query, fullText, selectedUrl, sourceInfo, context || "");

        send("progress", { step: 5, total: 5, label: "Saving card...", icon: "save" });

        // Step 5
        const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;
        const cardId = uuid();
        const now = new Date().toISOString();

        await supabase.from("cards").insert({
          id: cardId,
          tag: card.tag,
          cite,
          cite_author: card.cite_author,
          cite_year: card.cite_year,
          cite_credentials: card.cite_credentials,
          cite_title: card.cite_title,
          cite_date: card.cite_date,
          cite_url: card.cite_url,
          cite_access_date: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }),
          cite_initials: card.cite_initials,
          evidence_html: card.evidence_html,
          author_name: authorName || "Anonymous",
          argument_id: argumentId || null,
          created_at: now,
          updated_at: now,
        }).then(() => {});

        send("done", {
          id: cardId,
          tag: card.tag,
          cite,
          cite_author: card.cite_author,
          cite_year: card.cite_year,
          evidence_html: card.evidence_html,
          author_name: authorName || "Anonymous",
          sources_found: searchResults.sources.length,
          selected_source: selectedUrl,
          rapid: !!rapid,
        });

        controller.close();
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "Card generation failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
