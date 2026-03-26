import { NextRequest } from "next/server";
import { planArgumentAdvanced, generateCard, selectBestSource } from "@/lib/anthropic";
import type { ArgumentType, AdvancedArgumentPlan } from "@/lib/anthropic";
import { searchEvidence, deepSearchSource } from "@/lib/perplexity";
import { scrapeArticle } from "@/lib/scraper";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { query, context, authorName, argument_type } = await req.json();

  if (!query) {
    return new Response(JSON.stringify({ error: "Query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const argType: ArgumentType = argument_type || "custom";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        // Step 1: Plan the argument
        send("progress", {
          step: "planning",
          label: `Planning ${argType.toUpperCase()} argument structure...`,
          icon: "brain",
        });

        const plan: AdvancedArgumentPlan = await planArgumentAdvanced(argType, query, context || "");

        send("plan", {
          title: plan.title,
          description: plan.description,
          strategy_overview: plan.strategy_overview,
          argument_type: plan.argument_type,
          total_components: plan.components.length,
          components: plan.components.map((c, i) => ({
            index: i,
            type: c.type,
            label: c.label,
            purpose: c.purpose,
          })),
        });

        // Step 2: Generate each component
        const argumentId = uuid();
        const cardIds: string[] = [];
        const generatedComponents: Array<Record<string, unknown>> = [];

        for (let i = 0; i < plan.components.length; i++) {
          const comp = plan.components[i];

          send("progress", {
            step: "component",
            index: i,
            total: plan.components.length,
            label: `Generating: ${comp.label}`,
            icon: comp.type === "card" ? "search" : "pen",
            type: comp.type,
          });

          if (comp.type === "analytic" || comp.type === "plan_text" || comp.type === "interp_text") {
            // Non-card components: use AI-generated content directly
            generatedComponents.push({
              index: i,
              type: comp.type,
              label: comp.label,
              purpose: comp.purpose,
              content: comp.content || "",
            });

            send("component_done", {
              index: i,
              type: comp.type,
              label: comp.label,
              purpose: comp.purpose,
              content: comp.content || "",
            });
            continue;
          }

          // Card component: search, scrape, generate
          try {
            send("progress", {
              step: "searching",
              index: i,
              total: plan.components.length,
              label: `Searching evidence for: ${comp.label}`,
              icon: "search",
            });

            const searchResults = await searchEvidence(comp.query || comp.label, context || "");

            if (!searchResults.sources.length) {
              // If no sources, generate an analytic instead
              generatedComponents.push({
                index: i,
                type: "analytic",
                label: comp.label,
                purpose: comp.purpose,
                content: `[No evidence found — write your own warrant here for: ${comp.label}]`,
              });
              send("component_done", {
                index: i,
                type: "analytic",
                label: comp.label,
                purpose: comp.purpose,
                content: `[No evidence found — write your own warrant here for: ${comp.label}]`,
                fallback: true,
              });
              continue;
            }

            // Select best source
            let selectedUrl = searchResults.sources[0].url;
            if (searchResults.sources.length > 1) {
              try {
                const selection = await selectBestSource(
                  comp.query || comp.label,
                  searchResults.answer,
                  searchResults.sources
                );
                selectedUrl = selection.selectedUrl;
              } catch {
                // Use first source
              }
            }

            send("progress", {
              step: "scraping",
              index: i,
              total: plan.components.length,
              label: `Fetching source for: ${comp.label}`,
              icon: "download",
            });

            // Get full text
            let fullText = await scrapeArticle(selectedUrl);
            if (fullText.length < 500) {
              fullText = await deepSearchSource(selectedUrl, comp.query || comp.label);
            }
            if (fullText.length < 100) {
              fullText = searchResults.answer;
            }

            send("progress", {
              step: "generating",
              index: i,
              total: plan.components.length,
              label: `Cutting card: ${comp.label}`,
              icon: "sparkle",
            });

            // Generate card
            const card = await generateCard(
              comp.query || comp.label,
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
            generatedComponents.push({
              index: i,
              type: "card",
              id: cardId,
              label: comp.label,
              purpose: comp.purpose,
              tag: card.tag,
              cite,
              cite_author: card.cite_author,
              evidence_html: card.evidence_html,
            });

            send("component_done", {
              index: i,
              type: "card",
              id: cardId,
              label: comp.label,
              purpose: comp.purpose,
              tag: card.tag,
              cite,
              cite_author: card.cite_author,
              evidence_html: card.evidence_html,
            });
          } catch (cardError) {
            console.error(`Failed to generate card for: ${comp.label}`, cardError);
            send("component_error", {
              index: i,
              label: comp.label,
              error: cardError instanceof Error ? cardError.message : "Card generation failed",
            });
          }
        }

        // Save the argument
        await supabase.from("arguments").insert({
          id: argumentId,
          title: plan.title,
          description: plan.description,
          argument_type: argType,
          strategy_overview: plan.strategy_overview,
          author_name: authorName || "Anonymous",
          card_ids: cardIds,
          components: generatedComponents,
          created_at: new Date().toISOString(),
        });

        send("done", {
          argument_id: argumentId,
          title: plan.title,
          description: plan.description,
          strategy_overview: plan.strategy_overview,
          argument_type: argType,
          total_components: plan.components.length,
          generated_components: generatedComponents.length,
          card_count: cardIds.length,
        });

        controller.close();
      } catch (error) {
        console.error("Argument generation error:", error);
        send("error", {
          message: error instanceof Error ? error.message : "Argument generation failed",
        });
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
