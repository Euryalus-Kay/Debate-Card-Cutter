import { NextRequest, NextResponse } from "next/server";
import { searchEvidence, deepSearchSource } from "@/lib/perplexity";
import { generateCard, selectBestSource } from "@/lib/anthropic";
import { scrapeArticle } from "@/lib/scraper";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { query, context, authorName, argumentId } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Step 1: Search for evidence using Perplexity
    const searchResults = await searchEvidence(query, context || "");

    if (!searchResults.sources.length) {
      return NextResponse.json(
        { error: "No sources found. Try a more specific query." },
        { status: 404 }
      );
    }

    // Step 2: Use Claude to select the best source
    let selectedUrl = searchResults.sources[0].url;
    if (searchResults.sources.length > 1) {
      try {
        const selection = await selectBestSource(
          query,
          searchResults.answer,
          searchResults.sources
        );
        selectedUrl = selection.selectedUrl;
      } catch {
        // Fall back to first source
      }
    }

    // Step 3: Get full article text (try scraping first, then Perplexity deep search)
    let fullText = await scrapeArticle(selectedUrl);
    if (fullText.length < 500) {
      fullText = await deepSearchSource(selectedUrl, query);
    }

    if (fullText.length < 100) {
      // If scraping and deep search both fail, use the Perplexity answer as fallback
      fullText = searchResults.answer;
    }

    // Step 4: Use Claude to generate the card
    const sourceInfo = searchResults.answer;
    const card = await generateCard(query, fullText, selectedUrl, sourceInfo, context || "");

    // Step 5: Build the full citation string
    const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;

    // Step 6: Save to Supabase
    const cardId = uuid();
    const now = new Date().toISOString();

    const { error: dbError } = await supabase.from("cards").insert({
      id: cardId,
      tag: card.tag,
      cite,
      cite_author: card.cite_author,
      cite_year: card.cite_year,
      cite_credentials: card.cite_credentials,
      cite_title: card.cite_title,
      cite_date: card.cite_date,
      cite_url: card.cite_url,
      cite_access_date: new Date().toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      }),
      cite_initials: card.cite_initials,
      evidence_html: card.evidence_html,
      author_name: authorName || "Anonymous",
      argument_id: argumentId || null,
      created_at: now,
      updated_at: now,
    });

    if (dbError) {
      console.error("DB error:", dbError);
      // Still return the card even if DB save fails
    }

    return NextResponse.json({
      id: cardId,
      tag: card.tag,
      cite,
      cite_author: card.cite_author,
      cite_year: card.cite_year,
      evidence_html: card.evidence_html,
      author_name: authorName || "Anonymous",
      sources_found: searchResults.sources.length,
      selected_source: selectedUrl,
    });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Card generation failed" },
      { status: 500 }
    );
  }
}
