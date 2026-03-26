import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { iterateSpeech } from '@/lib/anthropic';

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params;
  const { speech_id, instruction } = await req.json();

  const { data: speech } = await supabase
    .from('speeches').select('*').eq('id', speech_id).single();

  if (!speech) return NextResponse.json({ error: 'Speech not found' }, { status: 404 });

  const updatedHtml = await iterateSpeech(speech.generated_html || speech.raw_content, instruction);

  await supabase
    .from('speeches')
    .update({ generated_html: updatedHtml, updated_at: new Date().toISOString() })
    .eq('id', speech_id);

  return NextResponse.json({ html: updatedHtml });
}
