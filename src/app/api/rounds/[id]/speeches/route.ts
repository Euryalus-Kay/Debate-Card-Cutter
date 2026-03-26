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

        send('progress', { step: 2, total: 3, label: 'AI is analyzing arguments in the speech...', icon: 'brain' });

        // Parse the speech with AI
        let parsed: unknown[] = [];
        try {
          parsed = await parseSpeech(
            content,
            speech_type,
            round?.side || 'aff',
            round?.round_context || '',
            hasHighlights || false
          );
        } catch (e) {
          console.error('Parse error:', e);
          parsed = [];
        }

        send('progress', { step: 3, total: 3, label: 'Saving speech...', icon: 'save' });

        const now = new Date().toISOString();
        const { data: speech, error } = await supabase
          .from('speeches')
          .insert({
            id: speechId,
            round_id: roundId,
            speech_type,
            speaker,
            raw_content: content,
            parsed_content: parsed,
            generated_html: '',
            source_type: source_type || 'paste',
            source_filename: source_filename || null,
            speech_order: speech_order || 0,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single();

        if (error) {
          send('error', { message: error.message });
        } else {
          send('done', speech);
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
