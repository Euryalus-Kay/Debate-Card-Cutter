/**
 * Reusable argument build pipeline. Used by:
 *   - The SSE-based /api/argument route (live progress).
 *   - The approval-gated /api/build-requests/[id] approve flow (background).
 *
 * Both paths share this single implementation so the build behavior is
 * identical regardless of who triggers it.
 */

import { planArgumentAdvanced, generateCard, selectBestSource } from "./anthropic";
import type { ArgumentType, CampFilePlan } from "./anthropic";
import { searchEvidence } from "./perplexity";
import { fetchSourceText, SourceFetchError } from "./source-fetcher";
import { supabase } from "./supabase";
import { v4 as uuid } from "uuid";
import { localAnalyticCheck, auditAnalytic } from "./anthropic-analytics";

export interface BuildEvent {
  type:
    | "progress"
    | "plan"
    | "component_done"
    | "component_error"
    | "build_job"
    | "done"
    | "error";
  payload: Record<string, unknown>;
}

export interface BuildArgs {
  query: string;
  context: string;
  authorName: string;
  argumentType: ArgumentType;
  judgeId?: string | null;
  highlightMode?: string;
  highlightInstruction?: string;
  onEvent?: (event: BuildEvent) => void;
}

export interface BuildResult {
  argumentId: string;
  cardCount: number;
  componentCount: number;
  buildJobId?: string;
  failed: number;
}

/**
 * The core build pipeline.
 *
 * Plans the camp file, then generates each component (card or analytic) in
 * parallel batches of 3. Cards use strict-mode source fetching and the
 * hardened no-modification prompt. Analytics get a local quality check and
 * are rewritten via Claude if blippy.
 */
export async function buildArgument(args: BuildArgs): Promise<BuildResult> {
  const emit = (type: BuildEvent["type"], payload: Record<string, unknown>) => {
    args.onEvent?.({ type, payload });
  };

  const argType: ArgumentType = (args.argumentType || "custom") as ArgumentType;
  let buildJobId: string | undefined;

  try {
    const { data: buildJob } = await supabase
      .from("build_jobs")
      .insert({
        type: "argument",
        title: `Building ${argType.toUpperCase()}...`,
        status: "building",
        author_name: args.authorName || "Anonymous",
        total_components: 0,
        completed_components: 0,
        failed_components: 0,
        current_label: "Planning...",
      })
      .select()
      .single();
    buildJobId = buildJob?.id;
    emit("build_job", { id: buildJobId });

    emit("progress", {
      step: "planning",
      label: `Planning ${argType.toUpperCase()} camp file structure...`,
      icon: "brain",
    });

    const plan: CampFilePlan = await planArgumentAdvanced(
      argType,
      args.query,
      args.context || ""
    );

    interface FlatComp {
      sectionIndex: number;
      sectionHeader: string;
      componentIndex: number;
      type: string;
      label: string;
      query?: string;
      purpose: string;
      content?: string;
    }

    const allComponents: FlatComp[] = [];
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

    emit("plan", {
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

    const argumentId = uuid();
    const cardIds: string[] = [];
    const generatedComponents: Array<Record<string, unknown>> = [];

    await supabase.from("arguments").insert({
      id: argumentId,
      title: plan.title,
      description: plan.file_notes || args.query,
      argument_type: argType,
      strategy_overview: plan.file_notes || "",
      author_name: args.authorName || "Anonymous",
      card_ids: [],
      components: [],
      created_at: new Date().toISOString(),
    });

    // Repair analytics that fail the local quality check
    const repairAnalytic = async (text: string) => {
      const local = localAnalyticCheck(text);
      if (!local.isBlippy && local.hasCausalConnective) return text;
      try {
        const audit = await auditAnalytic(text);
        return audit.improvedVersion || text;
      } catch {
        return text;
      }
    };

    const cardComponents: FlatComp[] = [];
    for (let i = 0; i < allComponents.length; i++) {
      const comp = allComponents[i];
      if (
        comp.type === "analytic" ||
        comp.type === "plan_text" ||
        comp.type === "interp_text"
      ) {
        const content =
          comp.type === "analytic"
            ? await repairAnalytic(comp.content || "")
            : comp.content || "";

        generatedComponents.push({
          index: i,
          sectionIndex: comp.sectionIndex,
          sectionHeader: comp.sectionHeader,
          type: comp.type,
          label: comp.label,
          purpose: comp.purpose,
          content,
        });
        emit("component_done", {
          index: i,
          sectionIndex: comp.sectionIndex,
          sectionHeader: comp.sectionHeader,
          type: comp.type,
          label: comp.label,
          purpose: comp.purpose,
          content,
        });
      } else {
        cardComponents.push(comp);
      }
    }

    if (buildJobId) {
      await supabase
        .from("build_jobs")
        .update({
          title: plan.title || `${argType.toUpperCase()} Argument`,
          total_components: cardComponents.length,
          current_label: `Generating ${cardComponents.length} cards...`,
        })
        .eq("id", buildJobId);
    }

    emit("progress", {
      step: "generating_cards",
      label: `Generating ${cardComponents.length} cards in parallel...`,
      total: cardComponents.length,
      icon: "sparkle",
      cards: cardComponents.map((c) => ({
        label: c.label,
        section: c.sectionHeader,
      })),
    });

    let cardsDone = 0;

    async function generateOneCard(
      comp: FlatComp,
      i: number,
      retryCount = 0
    ): Promise<void> {
      try {
        const searchResults = await searchEvidence(
          comp.query || comp.label,
          args.context || ""
        );

        if (!searchResults.sources.length) {
          generatedComponents.push({
            index: i,
            sectionIndex: comp.sectionIndex,
            sectionHeader: comp.sectionHeader,
            type: "analytic",
            label: comp.label,
            purpose: comp.purpose,
            content: `[No evidence found — write your own warrant for: ${comp.label}]`,
          });
          emit("component_done", {
            index: i,
            sectionIndex: comp.sectionIndex,
            sectionHeader: comp.sectionHeader,
            type: "analytic",
            label: comp.label,
            purpose: comp.purpose,
            content: "[No evidence found]",
            fallback: true,
          });
          return;
        }

        // Order candidates: best first, rest as scrape fallbacks
        let orderedCandidates = [...searchResults.sources];
        if (searchResults.sources.length > 1) {
          try {
            const selection = await selectBestSource(
              comp.query || comp.label,
              searchResults.answer,
              searchResults.sources
            );
            const idx = orderedCandidates.findIndex(
              (s) => s.url === selection.selectedUrl
            );
            if (idx > 0) {
              const chosen = orderedCandidates[idx];
              orderedCandidates = [
                chosen,
                ...orderedCandidates.slice(0, idx),
                ...orderedCandidates.slice(idx + 1),
              ];
            }
          } catch {
            /* fall back to ranked order */
          }
        }

        let fetched;
        try {
          fetched = await fetchSourceText(orderedCandidates);
        } catch (fetchErr) {
          if (fetchErr instanceof SourceFetchError) {
            generatedComponents.push({
              index: i,
              sectionIndex: comp.sectionIndex,
              sectionHeader: comp.sectionHeader,
              type: "analytic",
              label: comp.label,
              purpose: comp.purpose,
              content: `[Could not retrieve verbatim source text. Cut this card manually for: ${comp.label}]`,
            });
            emit("component_done", {
              index: i,
              sectionIndex: comp.sectionIndex,
              sectionHeader: comp.sectionHeader,
              type: "analytic",
              label: comp.label,
              purpose: comp.purpose,
              content:
                "[Source fetch failed — sources may be paywalled or anti-bot protected]",
              fallback: true,
            });
            return;
          }
          throw fetchErr;
        }

        const card = await generateCard(
          comp.query || comp.label,
          fetched.text,
          fetched.url,
          searchResults.answer,
          args.context || "",
          {
            mode: (args.highlightMode || "medium") as
              | "low"
              | "medium"
              | "high"
              | "custom",
            customInstruction: args.highlightInstruction || undefined,
          }
        );

        const cardId = uuid();
        const cite = `${card.cite_author}, ${card.cite_credentials} ("${card.cite_title}" ${card.cite_date}. ${card.cite_url})//${card.cite_initials}`;
        const now = new Date().toISOString();

        const { error: cardInsertError } = await supabase.from("cards").insert({
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
          author_name: args.authorName || "Anonymous",
          argument_id: argumentId,
          created_at: now,
          updated_at: now,
        });
        if (cardInsertError) {
          console.error(
            `Failed to save card ${comp.label}:`,
            cardInsertError.message
          );
        }

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
        emit("component_done", {
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
        if (retryCount < 1) {
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
          return generateOneCard(comp, i, retryCount + 1);
        }
        console.error(`Failed to generate card for: ${comp.label}`, cardError);
        emit("component_error", {
          index: i,
          sectionIndex: comp.sectionIndex,
          sectionHeader: comp.sectionHeader,
          label: comp.label,
          error:
            cardError instanceof Error
              ? cardError.message
              : "Card generation failed",
        });
      } finally {
        cardsDone++;
        emit("progress", {
          step: "generating_cards",
          label: `Generated ${cardsDone}/${cardComponents.length} cards...`,
          done: cardsDone,
          total: cardComponents.length,
          justCompleted: comp.label,
          icon: "sparkle",
        });
        if (buildJobId) {
          supabase
            .from("build_jobs")
            .update({
              completed_components: cardsDone,
              current_label: comp.label,
            })
            .eq("id", buildJobId)
            .then(() => {});
        }
      }
    }

    const BATCH_SIZE = 3;
    const originalIndices = cardComponents.map((c) =>
      allComponents.indexOf(c)
    );
    for (let batch = 0; batch < cardComponents.length; batch += BATCH_SIZE) {
      const batchComps = cardComponents.slice(batch, batch + BATCH_SIZE);
      const batchIndices = originalIndices.slice(batch, batch + BATCH_SIZE);
      await Promise.all(
        batchComps.map((comp, idx) => generateOneCard(comp, batchIndices[idx]))
      );
    }

    interface SlimComp {
      [key: string]: unknown;
      evidence_html?: string;
    }
    const slimComponents = generatedComponents.map((c) => {
      const slim: SlimComp = { ...c };
      delete slim.evidence_html;
      return slim;
    });
    await supabase
      .from("arguments")
      .update({ card_ids: cardIds, components: slimComponents })
      .eq("id", argumentId);

    if (buildJobId) {
      await supabase
        .from("build_jobs")
        .update({
          status: "done",
          argument_id: argumentId,
          current_label: "Complete",
          completed_components: cardsDone,
          failed_components: cardComponents.length - cardIds.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", buildJobId);
    }

    emit("done", {
      argument_id: argumentId,
      title: plan.title,
      file_notes: plan.file_notes,
      argument_type: argType,
      total_components: allComponents.length,
      generated_components: generatedComponents.length,
      card_count: cardIds.length,
      section_count: plan.sections.length,
    });

    return {
      argumentId,
      cardCount: cardIds.length,
      componentCount: generatedComponents.length,
      buildJobId,
      failed: cardComponents.length - cardIds.length,
    };
  } catch (error) {
    if (buildJobId) {
      await supabase
        .from("build_jobs")
        .update({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Argument generation failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", buildJobId);
    }
    emit("error", {
      message:
        error instanceof Error ? error.message : "Argument generation failed",
    });
    throw error;
  }
}

/**
 * Wrapper for the approval flow — runs the build in the background and
 * reports status updates back to a callback so the build_requests row can
 * be updated as we go (pending → building → built/failed).
 */
export async function spawnApprovedBuild(args: {
  requestId: string;
  requesterName: string;
  argumentType: string;
  query: string;
  context: string;
  judgeId: string | null;
  highlightMode: string;
  highlightInstruction: string;
  onStatus: (
    status: "building" | "built" | "failed",
    message: string,
    argumentId?: string
  ) => Promise<void>;
}): Promise<void> {
  await args.onStatus("building", "Build started — planning camp file...");
  try {
    const result = await buildArgument({
      query: args.query,
      context: args.context,
      authorName: args.requesterName,
      argumentType: args.argumentType as ArgumentType,
      judgeId: args.judgeId,
      highlightMode: args.highlightMode,
      highlightInstruction: args.highlightInstruction,
    });
    await args.onStatus(
      "built",
      `Built ${result.cardCount} cards${result.failed ? ` (${result.failed} failed)` : ""}`,
      result.argumentId
    );
  } catch (err) {
    await args.onStatus(
      "failed",
      err instanceof Error ? err.message : "Build failed"
    );
  }
}
