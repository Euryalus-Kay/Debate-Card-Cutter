import { NextRequest } from "next/server";
import { planArgumentAdvanced, generateCard, selectBestSource } from "@/lib/anthropic";
import type { ArgumentType, CampFilePlan } from "@/lib/anthropic";
import { searchEvidence, deepSearchSource } from "@/lib/perplexity";
import { scrapeArticle } from "@/lib/scraper";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const list = req.nextUrl.searchParams.get('list');
  if (list) {
    const { data, error } = await supabase
      .from('arguments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(data || []), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
}

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
        // Step 1: Plan the camp file
        send("progress", {
          step: "planning",
          label: `Planning ${argType.toUpperCase()} camp file structure...`,
          icon: "brain",
        });

        const plan: CampFilePlan = await planArgumentAdvanced(argType, query, context || "");

        // Flatten all components across sections for tracking
        const allComponents: Array<{
          sectionIndex: number;
          sectionHeader: string;
          componentIndex: number;
          type: string;
          label: string;
          query?: string;
          purpose: string;
          content?: string;
        }> = [];

        for (let si = 0; si < plan.sections.length; si++) {
          const section = plan.sections[si];
          for (let ci = 0; ci < section.components.length; ci++) {
            const comp = section.components[ci];
            allComponents.push({
              sectionIndex: si,
              sectionHeader: section.section_header,
              componentIndex: ci,
              type: comp.type,
              label: comp.label,
              query: comp.query,
              purpose: comp.purpose,
              content: comp.content,
            });
          }
        }

        send("plan", {
          title: plan.title,
          file_notes: plan.file_notes,
          argument_type: plan.argument_type,
          total_components: allComponents.length,
          sections: plan.sections.map((s, si) => ({
            index: si,
            section_header: s.section_header,
            components: s.components.map((c, ci) => ({
              index: ci,
              type: c.type,
              label: c.label,
              purpose: c.purpose,
            })),
          })),
        });

        // Step 2: Generate each component
        const argumentId = uuid();
        const cardIds: string[] = [];
        const generatedComponents: Array<Record<string, unknown>> = [];

        for (let i = 0; i < allComponents.length; i++) {
          const comp = allComponents[i];

          send("progress", {
            step: "component",
            index: i,
            total: allComponents.length,
            sectionIndex: comp.sectionIndex,
            sectionHeader: comp.sectionHeader,
            label: `[${comp.sectionHeader}] ${comp.label}`,
            icon: comp.type === "card" ? "search" : "pen",
            type: comp.type,
          });

          if (comp.type === "analytic" || comp.type === "plan_text" || comp.type === "interp_text") {
            generatedComponents.push({
              index: i,
              sectionIndex: comp.sectionIndex,
              sectionHeader: comp.sectionHeader,
              type: comp.type,
              label: comp.label,
              purpose: comp.purpose,
              content: comp.content || "",
            });

            send("component_done", {
              index: i,
              sectionIndex: comp.sectionIndex,
              sectionHeader: comp.sectionHeader,
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
              total: allComponents.length,
              sectionHeader: comp.sectionHeader,
              label: `Searching evidence for: ${comp.label}`,
              icon: "search",
            });

            const searchResults = await searchEvidence(comp.query || comp.label, context || "");

            if (!searchResults.sources.length) {
              generatedComponents.push({
                index: i,
                sectionIndex: comp.sectionIndex,
                sectionHeader: comp.sectionHeader,
                type: "analytic",
                label: comp.label,
                purpose: comp.purpose,
                content: `[No evidence found -- write your own warrant here for: ${comp.label}]`,
              });
              send("component_done", {
                index: i,
                sectionIndex: comp.sectionIndex,
                sectionHeader: comp.sectionHeader,
                type: "analytic",
                label: comp.label,
                purpose: comp.purpose,
                content: `[No evidence found -- write your own warrant here for: ${comp.label}]`,
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
              total: allComponents.length,
              sectionHeader: comp.sectionHeader,
              label: `Fetching source for: ${comp.label}`,
              icon: "download",
            });

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
              total: allComponents.length,
              sectionHeader: comp.sectionHeader,
              label: `Cutting card: ${comp.label}`,
              icon: "sparkle",
            });

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
              sectionIndex: comp.sectionIndex,
              sectionHeader: comp.sectionHeader,
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
              sectionIndex: comp.sectionIndex,
              sectionHeader: comp.sectionHeader,
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
              sectionIndex: comp.sectionIndex,
              sectionHeader: comp.sectionHeader,
              label: comp.label,
              error: cardError instanceof Error ? cardError.message : "Card generation failed",
            });
          }
        }

        // Save the argument with camp file structure
        await supabase.from("arguments").insert({
          id: argumentId,
          title: plan.title,
          description: plan.file_notes,
          argument_type: argType,
          strategy_overview: plan.file_notes,
          author_name: authorName || "Anonymous",
          card_ids: cardIds,
          components: generatedComponents,
          created_at: new Date().toISOString(),
        });

        send("done", {
          argument_id: argumentId,
          title: plan.title,
          file_notes: plan.file_notes,
          argument_type: argType,
          total_components: allComponents.length,
          generated_components: generatedComponents.length,
          card_count: cardIds.length,
          section_count: plan.sections.length,
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
