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

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  // Unlink cards from this argument (don't delete the cards themselves)
  await supabase.from("cards").update({ argument_id: null }).eq("argument_id", id);
  // Delete the argument
  const { error } = await supabase.from("arguments").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
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

      // Keepalive every 15s to prevent connection drop on Railway
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          // stream closed
        }
      }, 5000);

      let buildJobId: string | undefined;
      try {
        // Create a build job so the user can track it even if they leave the page
        const { data: buildJob } = await supabase.from("build_jobs").insert({
          type: "argument",
          title: `Building ${argType.toUpperCase()}...`,
          status: "building",
          author_name: authorName || "Anonymous",
          total_components: 0,
          completed_components: 0,
          failed_components: 0,
          current_label: "Planning...",
        }).select().single();
        buildJobId = buildJob?.id;

        send("build_job", { id: buildJobId });

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

        // Step 2: Create the argument row FIRST so card FK constraints work
        const argumentId = uuid();
        const cardIds: string[] = [];
        const generatedComponents: Array<Record<string, unknown>> = [];

        // Insert argument shell first (will update with components at end)
        const { error: argInsertError } = await supabase.from("arguments").insert({
          id: argumentId,
          title: plan.title,
          description: plan.file_notes || query,
          argument_type: argType,
          strategy_overview: plan.file_notes || "",
          author_name: authorName || "Anonymous",
          card_ids: [],
          components: [],
          created_at: new Date().toISOString(),
        });
        if (argInsertError) {
          console.error("Failed to create argument shell:", argInsertError);
        }

        // Immediately emit all analytics/plan_text/interp_text components
        const cardComponents: typeof allComponents = [];
        for (let i = 0; i < allComponents.length; i++) {
          const comp = allComponents[i];
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
              index: i, sectionIndex: comp.sectionIndex, sectionHeader: comp.sectionHeader,
              type: comp.type, label: comp.label, purpose: comp.purpose, content: comp.content || "",
            });
          } else {
            cardComponents.push(comp);
          }
        }

        // Update build job with plan info
        if (buildJobId) {
          await supabase.from("build_jobs").update({
            title: plan.title || `${argType.toUpperCase()} Argument`,
            total_components: cardComponents.length,
            current_label: `Generating ${cardComponents.length} cards...`,
          }).eq("id", buildJobId);
        }

        // Generate ALL cards in parallel
        send("progress", {
          step: "generating_cards",
          label: `Generating ${cardComponents.length} cards in parallel...`,
          total: cardComponents.length,
          icon: "sparkle",
          cards: cardComponents.map(c => ({ label: c.label, section: c.sectionHeader })),
        });

        let cardsDone = 0;

        async function generateOneCard(comp: typeof allComponents[0], i: number, retryCount = 0) {
          try {
            const searchResults = await searchEvidence(comp.query || comp.label, context || "");

            if (!searchResults.sources.length) {
              generatedComponents.push({
                index: i, sectionIndex: comp.sectionIndex, sectionHeader: comp.sectionHeader,
                type: "analytic", label: comp.label, purpose: comp.purpose,
                content: `[No evidence found -- write your own warrant here for: ${comp.label}]`,
              });
              send("component_done", {
                index: i, sectionIndex: comp.sectionIndex, sectionHeader: comp.sectionHeader,
                type: "analytic", label: comp.label, purpose: comp.purpose,
                content: `[No evidence found]`, fallback: true,
              });
              return;
            }

            let selectedUrl = searchResults.sources[0].url;
            if (searchResults.sources.length > 1) {
              try {
                const selection = await selectBestSource(comp.query || comp.label, searchResults.answer, searchResults.sources);
                selectedUrl = selection.selectedUrl;
              } catch { /* use first */ }
            }

            let fullText = await scrapeArticle(selectedUrl);
            if (fullText.length < 500) fullText = await deepSearchSource(selectedUrl, comp.query || comp.label);
            if (fullText.length < 100) fullText = searchResults.answer;

            const card = await generateCard(comp.query || comp.label, fullText, selectedUrl, searchResults.answer, context || "");

            const cardId = uuid();
            const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;
            const now = new Date().toISOString();

            const { error: cardInsertError } = await supabase.from("cards").insert({
              id: cardId, tag: card.tag, cite, cite_author: card.cite_author,
              cite_year: card.cite_year, cite_credentials: card.cite_credentials,
              cite_title: card.cite_title, cite_date: card.cite_date, cite_url: card.cite_url,
              cite_access_date: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" }),
              cite_initials: card.cite_initials, evidence_html: card.evidence_html,
              author_name: authorName || "Anonymous", argument_id: argumentId,
              created_at: now, updated_at: now,
            });

            if (cardInsertError) console.error(`Failed to save card ${comp.label}:`, cardInsertError.message);

            cardIds.push(cardId);
            generatedComponents.push({
              index: i, sectionIndex: comp.sectionIndex, sectionHeader: comp.sectionHeader,
              type: "card", id: cardId, label: comp.label, purpose: comp.purpose,
              tag: card.tag, cite, cite_author: card.cite_author, evidence_html: card.evidence_html,
            });

            send("component_done", {
              index: i, sectionIndex: comp.sectionIndex, sectionHeader: comp.sectionHeader,
              type: "card", id: cardId, label: comp.label, purpose: comp.purpose,
              tag: card.tag, cite, cite_author: card.cite_author, evidence_html: card.evidence_html,
            });
          } catch (cardError) {
            // Retry once on failure (rate limit, transient error)
            if (retryCount < 1) {
              console.log(`Retrying card: ${comp.label} (attempt ${retryCount + 2})`);
              await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
              return generateOneCard(comp, i, retryCount + 1);
            }
            console.error(`Failed to generate card for: ${comp.label}`, cardError);
            send("component_error", {
              index: i, sectionIndex: comp.sectionIndex, sectionHeader: comp.sectionHeader,
              label: comp.label, error: cardError instanceof Error ? cardError.message : "Card generation failed",
            });
          } finally {
            cardsDone++;
            send("progress", {
              step: "generating_cards",
              label: `Generated ${cardsDone}/${cardComponents.length} cards...`,
              done: cardsDone,
              total: cardComponents.length,
              justCompleted: comp.label,
              icon: "sparkle",
            });
            // Update build job progress
            if (buildJobId) {
              supabase.from("build_jobs").update({
                completed_components: cardsDone,
                current_label: comp.label,
              }).eq("id", buildJobId).then(() => {});
            }
          }
        }

        // Fire card tasks in batches of 3 to avoid rate limits
        const BATCH_SIZE = 3;
        const originalIndices = cardComponents.map(c => allComponents.indexOf(c));
        for (let batch = 0; batch < cardComponents.length; batch += BATCH_SIZE) {
          const batchComps = cardComponents.slice(batch, batch + BATCH_SIZE);
          const batchIndices = originalIndices.slice(batch, batch + BATCH_SIZE);
          await Promise.all(batchComps.map((comp, idx) => generateOneCard(comp, batchIndices[idx])));
        }

        // Update the argument with completed components (strip evidence_html to keep payload small)
        const slimComponents = generatedComponents.map(c => {
          const slim = { ...c };
          delete slim.evidence_html;
          return slim;
        });
        const { error: argUpdateError } = await supabase.from("arguments")
          .update({
            card_ids: cardIds,
            components: slimComponents,
          })
          .eq("id", argumentId);
        if (argUpdateError) {
          console.error("Failed to update argument:", argUpdateError.message);
        }

        // Mark build job as complete
        if (buildJobId) {
          await supabase.from("build_jobs").update({
            status: "done",
            argument_id: argumentId,
            current_label: "Complete",
            completed_components: cardsDone,
            failed_components: cardComponents.length - cardIds.length,
            updated_at: new Date().toISOString(),
          }).eq("id", buildJobId);
        }

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

        clearInterval(keepalive);
        // Small delay to ensure the done event is flushed to the client
        await new Promise(resolve => setTimeout(resolve, 100));
        controller.close();
      } catch (error) {
        clearInterval(keepalive);
        console.error("Argument generation error:", error);
        // Mark build job as failed
        if (buildJobId) {
          await supabase.from("build_jobs").update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Argument generation failed",
            updated_at: new Date().toISOString(),
          }).eq("id", buildJobId);
        }
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
