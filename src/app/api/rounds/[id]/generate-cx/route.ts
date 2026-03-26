import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateCXQuestions, generateCXAnswers } from '@/lib/anthropic';

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params;
  const { target_speech_type, mode } = await req.json();

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).single();
  const { data: speeches } = await supabase
    .from('speeches').select('*').eq('round_id', roundId);

  const targetSpeech = (speeches || []).find((s: { speech_type: string }) => s.speech_type === target_speech_type);
  if (!targetSpeech) return NextResponse.json({ error: 'Speech not found' }, { status: 404 });

  if (mode === 'answers') {
    const answers = await generateCXAnswers(
      targetSpeech.parsed_content,
      target_speech_type,
      round?.side || 'aff',
      round?.round_context || ''
    );
    return NextResponse.json(answers);
  } else {
    const questions = await generateCXQuestions(
      targetSpeech.parsed_content,
      target_speech_type,
      round?.side || 'aff',
      round?.round_context || ''
    );
    return NextResponse.json(questions);
  }
}
