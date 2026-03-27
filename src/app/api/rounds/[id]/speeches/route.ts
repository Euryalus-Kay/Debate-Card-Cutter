import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseSpeech } from '@/lib/anthropic';
import { v4 as uuid } from 'uuid';

export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase
    .from('speeches')
    .select('*')
    .eq('round_id', id)
    .order('speech_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params;
  const body = await req.json();
  const { speech_type, speaker, content, source_type, source_filename, speech_order, hasHighlights } = body;

  // Get round info for context
  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).single();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      // Keepalive: send a comment every 10s to prevent connection drop
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          // stream already closed
        }
      }, 10000);

      try {
        send('progress', { step: 1, total: 4, label: 'Processing document...', icon: 'doc' });

        const speechId = uuid();
        const now = new Date().toISOString();

        // Step 1: Save the speech IMMEDIATELY so the user sees it
        send('progress', { step: 2, total: 4, label: 'Saving speech...', icon: 'save' });

        const { data: speech, error: saveError } = await supabase
          .from('speeches')
          .insert({
            id: speechId,
            round_id: roundId,
            speech_type,
            speaker,
            raw_content: content,
            parsed_content: [],
            generated_html: content,
            source_type: source_type || 'paste',
            source_filename: source_filename || null,
            speech_order: speech_order || 0,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();

        if (saveError) {
          clearInterval(keepalive);
          send('error', { message: saveError.message });
          controller.close();
          return;
        }

        // Tell frontend the speech is saved — UI can update immediately
        send('done', speech);

        // Step 2: Parse with AI — full content, no truncation
        send('progress', { step: 3, total: 4, label: 'AI analyzing arguments — this may take a minute for long speeches...', icon: 'brain' });

        try {
          const parsed = await parseSpeech(
            content,
            speech_type,
            round?.side || 'aff',
            round?.round_context || '',
            hasHighlights || false
          );

          send('progress', { step: 4, total: 4, label: 'Saving analysis...', icon: 'save' });

          await supabase
            .from('speeches')
            .update({ parsed_content: parsed })
            .eq('id', speechId);

          // Send updated speech with parsed content
          send('parsed', { id: speechId, parsed_content: parsed });
        } catch (e) {
          console.error('Parse error (non-fatal, speech already saved):', e);
          send('parse_error', { message: 'AI analysis failed but your speech is saved. You can still use it.' });
        }

        clearInterval(keepalive);
        controller.close();
      } catch (error) {
        clearInterval(keepalive);
        send('error', { message: error instanceof Error ? error.message : 'Speech processing failed' });
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
