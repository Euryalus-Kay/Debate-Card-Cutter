import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseDocument } from '@/lib/document-parser';
import { parseBulkCards } from '@/lib/anthropic';
import { v4 as uuid } from 'uuid';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const collectionName =
    (formData.get('collection_name') as string) ||
    file?.name ||
    'Uploaded Collection';
  const uploadedBy = (formData.get('uploaded_by') as string) || 'Anonymous';

  if (!file) {
    return new Response(JSON.stringify({ error: 'No file provided' }), {
      status: 400,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          /* stream closed */
        }
      };

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          /* ignore */
        }
      }, 4000);

      const startedAt = Date.now();
      let buildJobId: string | undefined;

      try {
        const { data: buildJob } = await supabase
          .from('build_jobs')
          .insert({
            type: 'upload',
            title: `Uploading ${collectionName}`,
            status: 'building',
            author_name: uploadedBy,
            total_components: 0,
            completed_components: 0,
            current_label: 'Parsing document...',
          })
          .select()
          .single();
        buildJobId = buildJob?.id;

        send('progress', {
          step: 'parse',
          label: 'Parsing document...',
          icon: 'doc',
          percent: 5,
        });
        send('build_job', { id: buildJobId });

        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = await parseDocument(buffer, file.name);
        const text = parsed.html || parsed.text;
        const charCount = text.length;

        send('progress', {
          step: 'parsed',
          label: `Document parsed — ${(charCount / 1000).toFixed(1)}k chars. Splitting into cards...`,
          icon: 'doc',
          percent: 10,
          chars: charCount,
        });

        const { data: library } = await supabase
          .from('card_library')
          .insert({
            collection_name: collectionName,
            uploaded_by: uploadedBy,
            file_name: file.name,
          })
          .select()
          .single();
        const libraryId = library?.id;

        // Phase: AI extraction with live progress
        let lastReportedAt = 0;
        const cards = await parseBulkCards(text, collectionName, (done, total) => {
          const elapsed = (Date.now() - startedAt) / 1000;
          const phasePercent = total > 0 ? (done / total) * 100 : 0;
          const overall = 10 + phasePercent * 0.7; // extraction is 70% of total
          // Throttle progress events to avoid SSE spam
          if (Date.now() - lastReportedAt < 250 && done < total) return;
          lastReportedAt = Date.now();

          const eta =
            done > 0 && done < total
              ? ((elapsed / done) * (total - done)).toFixed(0)
              : null;

          const label = eta
            ? `Extracting cards — chunk ${done}/${total} · ${eta}s remaining`
            : `Extracting cards — chunk ${done}/${total}...`;

          send('progress', {
            step: 'extracting',
            label,
            icon: 'brain',
            chunkDone: done,
            chunkTotal: total,
            percent: Math.round(overall),
            elapsed: Math.round(elapsed),
            eta: eta ? Number(eta) : null,
          });

          if (buildJobId) {
            supabase
              .from('build_jobs')
              .update({
                total_components: total,
                completed_components: done,
                current_label: label,
              })
              .eq('id', buildJobId)
              .then(() => {});
          }
        });

        send('progress', {
          step: 'extracted',
          label: `Extracted ${cards.length} cards. Saving...`,
          icon: 'save',
          percent: 82,
          cardsExtracted: cards.length,
        });

        const argumentId = uuid();
        const cardIds: string[] = [];
        const slimComponents: Array<Record<string, unknown>> = [];
        const now = new Date().toISOString();

        // Parallel inserts in batches of 8 to keep Supabase happy
        const SAVE_BATCH = 8;
        for (let i = 0; i < cards.length; i += SAVE_BATCH) {
          const slice = cards.slice(i, i + SAVE_BATCH);
          const results = await Promise.all(
            slice.map(async (card, j) => {
              const cardId = uuid();
              const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;
              const { error } = await supabase.from('cards').insert({
                id: cardId,
                tag: card.tag,
                cite,
                cite_author: card.cite_author,
                cite_year: card.cite_year,
                cite_credentials: card.cite_credentials,
                cite_title: card.cite_title,
                cite_date: card.cite_date,
                cite_url: card.cite_url,
                cite_access_date: new Date().toLocaleDateString(),
                cite_initials: card.cite_initials,
                evidence_html: card.evidence_html,
                author_name: uploadedBy,
                library_id: libraryId,
                argument_id: argumentId,
                is_shared: true,
                created_at: now,
                updated_at: now,
              });
              if (error) {
                console.error(`Card save error [${i + j}]:`, error.message);
                return null;
              }
              return {
                cardId,
                index: i + j,
                tag: card.tag,
                cite,
                citeAuthor: card.cite_author,
              };
            })
          );

          for (const r of results) {
            if (!r) continue;
            cardIds.push(r.cardId);
            slimComponents.push({
              index: r.index,
              type: 'card',
              id: r.cardId,
              label: r.tag.substring(0, 80),
              tag: r.tag,
              cite: r.cite,
              cite_author: r.citeAuthor,
            });
          }

          const savePercent = ((i + slice.length) / cards.length) * 100;
          send('progress', {
            step: 'saving',
            label: `Saved ${cardIds.length}/${cards.length} cards`,
            icon: 'save',
            percent: 82 + savePercent * 0.15,
            cardsSaved: cardIds.length,
            cardsTotal: cards.length,
          });
        }

        if (cardIds.length > 0) {
          await supabase.from('arguments').insert({
            id: argumentId,
            title: collectionName,
            description: `Uploaded from ${file.name} — ${cardIds.length} cards`,
            author_name: uploadedBy,
            card_ids: cardIds,
            argument_type: 'custom',
            strategy_overview: '',
            file_notes: '',
            components: slimComponents,
            created_at: now,
          });
        }

        if (buildJobId) {
          await supabase
            .from('build_jobs')
            .update({
              status: 'done',
              title: `${collectionName} — ${cardIds.length} cards`,
              argument_id: argumentId,
              completed_components: cardIds.length,
              current_label: 'Complete',
            })
            .eq('id', buildJobId);
        }

        const totalSecs = Math.round((Date.now() - startedAt) / 1000);
        send('done', {
          count: cardIds.length,
          library_id: libraryId,
          argument_id: argumentId,
          elapsed: totalSecs,
        });
        clearInterval(keepalive);
        controller.close();
      } catch (error) {
        console.error('Upload error:', error);
        if (buildJobId) {
          await supabase
            .from('build_jobs')
            .update({
              status: 'failed',
              error_message:
                error instanceof Error ? error.message : 'Upload failed',
            })
            .eq('id', buildJobId);
        }
        send('error', {
          message: error instanceof Error ? error.message : 'Upload failed',
        });
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
