import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateFlow } from '@/lib/anthropic';

export const maxDuration = 120;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase
    .from('flow_entries')
    .select('*')
    .eq('round_id', id)
    .order('row_index', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params;

  // Get round and speeches
  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).single();
  const { data: speeches } = await supabase
    .from('speeches')
    .select('*')
    .eq('round_id', roundId)
    .order('speech_order', { ascending: true });

  if (!speeches || speeches.length === 0) {
    return NextResponse.json({ error: 'No speeches to generate flow from' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send('progress', { step: 1, total: 2, label: 'AI is generating the flow...', icon: 'flow' });

        const speechData = speeches.map((s: { speech_type: string; parsed_content: unknown[] }) => ({
          speech_type: s.speech_type,
          parsed_content: s.parsed_content,
        }));

        const flowEntries = await generateFlow(speechData, round?.side || 'aff');

        send('progress', { step: 2, total: 2, label: 'Saving flow...', icon: 'save' });

        // Delete old flow entries
        await supabase.from('flow_entries').delete().eq('round_id', roundId);

        // Insert new ones
        if (flowEntries.length > 0) {
          await supabase.from('flow_entries').insert(
            flowEntries.map((e) => ({
              round_id: roundId,
              row_index: e.row_index,
              category: e.category,
              label: e.label,
              entries: e.entries,
            }))
          );
        }

        const { data: saved } = await supabase
          .from('flow_entries')
          .select('*')
          .eq('round_id', roundId)
          .order('row_index', { ascending: true });

        send('done', saved);
        controller.close();
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Flow generation failed' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
