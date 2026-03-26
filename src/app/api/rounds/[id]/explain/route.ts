import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { explainArgument } from '@/lib/anthropic';

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params;
  const { argument_text } = await req.json();

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).single();
  const explanation = await explainArgument(argument_text, round?.round_context || '');
  return NextResponse.json({ explanation });
}
