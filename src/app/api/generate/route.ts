import { NextRequest } from "next/server";
import { searchEvidence } from "@/lib/perplexity";
import { generateCard, generateCardFast, selectBestSource } from "@/lib/anthropic";
import {
  fetchSourceText,
  SourceFetchError,
  PREFERRED_SCRAPE_CHARS,
} from "@/lib/source-fetcher";
import { supabase } from "@/lib/supabase";
import { autoSortCard } from "@/lib/auto-sort";
import { v4 as uuid } from "uuid";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { query, context, authorName, argumentId, rapid, highlightMode, highlightInstruction } = await req.json();

  if (!query) {
    return new Response(JSON.stringify({ error: "Query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          /* ignore */
        }
      }, 5000);

      try {
        // Step 1 — Search for candidate sources
        send("progress", {
          step: 1,
          total: 5,
          label: "Searching for sources...",
          icon: "search",
        });
        const searchResults = await searchEvidence(query, context || "", rapid);

        if (!searchResults.sources.length) {
          send("error", {
            message: "No sources found for this query. Try rephrasing.",
          });
          controller.close();
          clearInterval(keepalive);
          return;
        }

        send("progress", {
          step: 2,
          total: 5,
          label: `Found ${searchResults.sources.length} candidates. Choosing the strongest...`,
          icon: "filter",
        });

        // Step 2 — Order candidates: best source first, then the rest as fallbacks
        let orderedCandidates = [...searchResults.sources];
        if (!rapid && searchResults.sources.length > 1) {
          try {
            const selection = await selectBestSource(
              query,
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
            /* fall back to original order */
          }
        }

        // Step 3 — Strict source fetch. NO summary fallback. Try direct scrape
        // on each candidate; fail if none yield real article text.
        send("progress", {
          step: 3,
          total: 5,
          label: "Fetching verbatim source text...",
          icon: "download",
        });

        let fetched;
        try {
          fetched = await fetchSourceText(orderedCandidates, {
            preferred: PREFERRED_SCRAPE_CHARS,
            onAttempt: (attempt) => {
              send("progress", {
                step: 3,
                total: 5,
                label:
                  attempt.chars >= 800
                    ? `✓ ${attempt.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)} — ${attempt.chars} chars`
                    : `✕ ${attempt.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)} — ${attempt.error || `only ${attempt.chars} chars`}`,
                icon: "download",
                attempt,
              });
            },
          });
        } catch (err) {
          if (err instanceof SourceFetchError) {
            send("error", {
              message:
                err.message +
                "\n\nNo card was created. Strict mode is enabled — we never fabricate cards from web summaries.",
              attempts: err.attempts,
            });
            controller.close();
            clearInterval(keepalive);
            return;
          }
          throw err;
        }

        send("progress", {
          step: 4,
          total: 5,
          label: rapid
            ? "Cutting card with Sonnet..."
            : "Cutting card with Opus...",
          icon: "sparkle",
          source: { url: fetched.url, domain: fetched.domain },
        });

        // Step 4 — Generate
        const cardGen = rapid ? generateCardFast : generateCard;
        const highlightOpts = {
          mode: (highlightMode || "medium") as
            | "low"
            | "medium"
            | "high"
            | "custom",
          customInstruction: highlightInstruction || undefined,
        };
        const card = await cardGen(
          query,
          fetched.text,
          fetched.url,
          searchResults.answer, // metadata for citation context only
          context || "",
          highlightOpts
        );

        // Verbatim integrity is now enforced via the system prompt's hard
        // no-modification rules. We removed the post-generation
        // verbatim-match retry to avoid paying for an extra Opus call on
        // every card.
        send("progress", {
          step: 5,
          total: 5,
          label: "Saving card...",
          icon: "save",
        });

        // Camp-file citation format: "Author YY, credentials (FirstName, date, "title," pub, url)//initials"
        const cite = `${card.cite_author}, ${card.cite_credentials} ("${card.cite_title}" ${card.cite_date}. ${card.cite_url})//${card.cite_initials}`;
        const cardId = uuid();
        const now = new Date().toISOString();

        await supabase
          .from("cards")
          .insert({
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
          })
          .then(() => {});

        autoSortCard(cardId, card.tag, card.cite_author);

        send("done", {
          id: cardId,
          tag: card.tag,
          cite,
          cite_author: card.cite_author,
          cite_year: card.cite_year,
          evidence_html: card.evidence_html,
          author_name: authorName || "Anonymous",
          sources_found: searchResults.sources.length,
          selected_source: fetched.url,
          source_domain: fetched.domain,
          source_path: fetched.path,
          rapid: !!rapid,
        });

        clearInterval(keepalive);
        controller.close();
      } catch (error) {
        clearInterval(keepalive);
        send("error", {
          message:
            error instanceof Error ? error.message : "Card generation failed",
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
