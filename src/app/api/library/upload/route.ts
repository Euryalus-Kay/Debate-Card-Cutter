import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseDocument } from '@/lib/document-parser';
import { parseBulkCards } from '@/lib/anthropic';
import { v4 as uuid } from 'uuid';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const collectionName = formData.get('collection_name') as string || file?.name || 'Uploaded Collection';
  const uploadedBy = formData.get('uploaded_by') as string || 'Anonymous';

  if (!file) {
    return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {}
      }

      // Keepalive to prevent connection drops
      const keepalive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch {}
      }, 5000);

      // Create a build job so progress persists if user leaves
      let buildJobId: string | undefined;

      try {
        const { data: buildJob } = await supabase.from('build_jobs').insert({
          type: 'upload',
          title: `Uploading ${collectionName}`,
          status: 'building',
          author_name: uploadedBy,
          total_components: 0,
          completed_components: 0,
          current_label: 'Parsing document...',
        }).select().single();
        buildJobId = buildJob?.id;

        send('progress', { step: 1, total: 4, label: 'Parsing document...', icon: 'doc' });
        send('build_job', { id: buildJobId });

        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = await parseDocument(buffer, file.name);

        send('progress', { step: 2, total: 4, label: 'AI splitting cards...', icon: 'brain' });

        // Create library entry
        const { data: library } = await supabase
          .from('card_library')
          .insert({ collection_name: collectionName, uploaded_by: uploadedBy, file_name: file.name })
          .select()
          .single();
        const libraryId = library?.id;

        // Parse cards with progress updates
        const cards = await parseBulkCards(parsed.html || parsed.text, collectionName, (done, total) => {
          const label = `Splitting cards — chunk ${done + 1}/${total}...`;
          send('progress', { step: 2, total: 4, label, icon: 'brain' });
          if (buildJobId) {
            supabase.from('build_jobs').update({
              total_components: total,
              completed_components: done,
              current_label: label,
            }).eq('id', buildJobId).then(() => {});
          }
        });

        send('progress', { step: 3, total: 4, label: `Saving ${cards.length} cards...`, icon: 'save' });

        // Save cards
        const argumentId = uuid();
        const cardIds: string[] = [];
        const slimComponents: Array<Record<string, unknown>> = [];
        const now = new Date().toISOString();

        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          const cardId = uuid();
          const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;

          const { error } = await supabase.from('cards').insert({
            id: cardId,
            tag: card.tag, cite, cite_author: card.cite_author, cite_year: card.cite_year,
            cite_credentials: card.cite_credentials, cite_title: card.cite_title,
            cite_date: card.cite_date, cite_url: card.cite_url,
            cite_access_date: new Date().toLocaleDateString(),
            cite_initials: card.cite_initials, evidence_html: card.evidence_html,
            author_name: uploadedBy, library_id: libraryId, argument_id: argumentId,
            is_shared: true, created_at: now, updated_at: now,
          });

          if (error) {
            console.error(`Card save error [${i}]:`, error.message);
            continue;
          }

          cardIds.push(cardId);
          slimComponents.push({
            index: i, type: 'card', id: cardId,
            label: card.tag.substring(0, 80),
            tag: card.tag, cite, cite_author: card.cite_author,
          });
        }

        send('progress', { step: 4, total: 4, label: 'Creating argument collection...', icon: 'save' });

        // Save as argument
        if (cardIds.length > 0) {
          await supabase.from('arguments').insert({
            id: argumentId,
            title: collectionName,
            description: `Uploaded from ${file.name} — ${cardIds.length} cards`,
            author_name: uploadedBy,
            card_ids: cardIds,
            argument_type: 'custom',
            strategy_overview: '', file_notes: '',
            components: slimComponents,
            created_at: now,
          });
        }

        // Mark build job complete
        if (buildJobId) {
          await supabase.from('build_jobs').update({
            status: 'done',
            title: `${collectionName} — ${cardIds.length} cards`,
            argument_id: argumentId,
            completed_components: cardIds.length,
            current_label: 'Complete',
          }).eq('id', buildJobId);
        }

        send('done', { count: cardIds.length, library_id: libraryId, argument_id: argumentId });
        clearInterval(keepalive);
        controller.close();
      } catch (error) {
        console.error('Upload error:', error);
        if (buildJobId) {
          await supabase.from('build_jobs').update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Upload failed',
          }).eq('id', buildJobId);
        }
        send('error', { message: error instanceof Error ? error.message : 'Upload failed' });
        clearInterval(keepalive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
