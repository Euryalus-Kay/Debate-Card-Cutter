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

      try {
        send('progress', { step: 1, total: 3, label: 'Processing document...', icon: 'doc' });

        const speechId = uuid();
        const now = new Date().toISOString();

        // Step 1: Save the speech IMMEDIATELY so the user sees it
        send('progress', { step: 2, total: 3, label: 'Saving speech...', icon: 'save' });

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
          send('error', { message: saveError.message });
          controller.close();
          return;
        }

        send('done', speech);

        // Step 2: Parse with AI in background (update the record after)
        send('progress', { step: 3, total: 3, label: 'AI analyzing arguments (background)...', icon: 'brain' });

        try {
          // Truncate extremely long speeches for parsing (keep first ~30000 chars)
          const parseContent = content.length > 30000 ? content.substring(0, 30000) + '\n\n[... truncated for analysis ...]' : content;

          const parsed = await parseSpeech(
            parseContent,
            speech_type,
            round?.side || 'aff',
            round?.round_context || '',
            hasHighlights || false
          );

          await supabase
            .from('speeches')
            .update({ parsed_content: parsed })
            .eq('id', speechId);
        } catch (e) {
          console.error('Parse error (non-fatal, speech already saved):', e);
        }

        controller.close();
      } catch (error) {
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
