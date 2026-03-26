import { NextRequest, NextResponse } from "next/server";
import { planArgument } from "@/lib/anthropic";
import { searchEvidence, deepSearchSource } from "@/lib/perplexity";
import { generateCard, selectBestSource } from "@/lib/anthropic";
import { scrapeArticle } from "@/lib/scraper";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { query, context, authorName } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Step 1: Plan the argument structure
    const plan = await planArgument(query, context || "");

    // Step 2: Create the argument record
    const argumentId = uuid();
    const cardIds: string[] = [];
    const generatedCards: Array<Record<string, unknown>> = [];

    // Step 3: Generate each card
    for (const cardPlan of plan.cards) {
      try {
        // Search for evidence
        const searchResults = await searchEvidence(cardPlan.query, context || "");

        if (!searchResults.sources.length) continue;

        // Select best source
        let selectedUrl = searchResults.sources[0].url;
        if (searchResults.sources.length > 1) {
          try {
            const selection = await selectBestSource(
              cardPlan.query,
              searchResults.answer,
              searchResults.sources
            );
            selectedUrl = selection.selectedUrl;
          } catch {
            // Use first source
          }
        }

        // Get full text
        let fullText = await scrapeArticle(selectedUrl);
        if (fullText.length < 500) {
          fullText = await deepSearchSource(selectedUrl, cardPlan.query);
        }
        if (fullText.length < 100) {
          fullText = searchResults.answer;
        }

        // Generate card
        const card = await generateCard(
          cardPlan.query,
          fullText,
          selectedUrl,
          searchResults.answer,
          context || ""
        );

        const cardId = uuid();
        const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;

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
          cite_access_date: new Date().toLocaleDateString("en-US", {
            month: "numeric",
            day: "numeric",
            year: "numeric",
          }),
          cite_initials: card.cite_initials,
          evidence_html: card.evidence_html,
          author_name: authorName || "Anonymous",
          argument_id: argumentId,
          created_at: now,
          updated_at: now,
        });

        cardIds.push(cardId);
        generatedCards.push({
          id: cardId,
          tag: card.tag,
          cite,
          evidence_html: card.evidence_html,
          purpose: cardPlan.purpose,
        });
      } catch (cardError) {
        console.error(`Failed to generate card for: ${cardPlan.query}`, cardError);
      }
    }

    // Save argument
    await supabase.from("arguments").insert({
      id: argumentId,
      title: plan.title,
      description: plan.description,
      author_name: authorName || "Anonymous",
      card_ids: cardIds,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      argument: {
        id: argumentId,
        title: plan.title,
        description: plan.description,
      },
      cards: generatedCards,
      planned: plan.cards.length,
      generated: generatedCards.length,
    });
  } catch (error) {
    console.error("Argument generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Argument generation failed" },
      { status: 500 }
    );
  }
}
