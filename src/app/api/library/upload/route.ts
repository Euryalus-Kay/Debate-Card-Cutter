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
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send('progress', { step: 1, total: 4, label: 'Parsing document...', icon: 'doc' });

        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = await parseDocument(buffer, file.name);

        send('progress', { step: 2, total: 4, label: 'AI is splitting cards from document...', icon: 'brain' });

        // Create library entry
        const { data: library } = await supabase
          .from('card_library')
          .insert({ collection_name: collectionName, uploaded_by: uploadedBy, file_name: file.name })
          .select()
          .single();

        const libraryId = library?.id;

        // Use AI to parse individual cards
        const cards = await parseBulkCards(parsed.html || parsed.text, collectionName);

        send('progress', { step: 3, total: 4, label: `Saving ${cards.length} cards...`, icon: 'save' });

        // Create an argument entry for the uploaded collection
        const argumentId = uuid();
        const cardIds: string[] = [];
        const components: Array<Record<string, unknown>> = [];

        // Save all cards and track them
        const now = new Date().toISOString();
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          const cardId = uuid();
          const cite = `${card.cite_author} (${card.cite_credentials}. "${card.cite_title}" ${card.cite_date}. ${card.cite_url}) ${card.cite_initials}`;

          await supabase.from('cards').insert({
            id: cardId,
            tag: card.tag, cite, cite_author: card.cite_author, cite_year: card.cite_year,
            cite_credentials: card.cite_credentials, cite_title: card.cite_title,
            cite_date: card.cite_date, cite_url: card.cite_url,
            cite_access_date: new Date().toLocaleDateString(),
            cite_initials: card.cite_initials, evidence_html: card.evidence_html,
            author_name: uploadedBy, library_id: libraryId, argument_id: argumentId,
            is_shared: true,
            created_at: now, updated_at: now,
          });

          cardIds.push(cardId);
          components.push({
            index: i,
            type: 'card',
            id: cardId,
            label: card.tag.substring(0, 80),
            purpose: 'Uploaded evidence',
            tag: card.tag,
            cite,
            cite_author: card.cite_author,
            evidence_html: card.evidence_html,
          });
        }

        send('progress', { step: 4, total: 4, label: 'Creating argument collection...', icon: 'save' });

        // Save as a combined argument (strip evidence_html to keep payload small)
        const slimComponents = components.map(c => {
          const slim = { ...c };
          delete slim.evidence_html;
          return slim;
        });
        await supabase.from('arguments').insert({
          id: argumentId,
          title: collectionName,
          description: `Uploaded from ${file.name} — ${cards.length} cards`,
          author_name: uploadedBy,
          card_ids: cardIds,
          argument_type: 'custom',
          strategy_overview: '',
          file_notes: '',
          components: slimComponents,
          created_at: now,
        });

        send('done', { count: cards.length, library_id: libraryId, argument_id: argumentId });
        controller.close();
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Upload failed' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
