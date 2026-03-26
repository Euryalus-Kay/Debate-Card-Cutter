import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get('user');
  if (!user) return NextResponse.json({ error: 'User required' }, { status: 400 });

  const { data, error } = await supabase
    .from('rounds')
    .select('*')
    .or(`user_name.eq.${user},partner_name.eq.${user}`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabase
    .from('rounds')
    .insert({
      user_name: body.user_name,
      side: body.side,
      opponent_name: body.opponent_name || '',
      opponent_school: body.opponent_school || '',
      tournament: body.tournament || '',
      round_number: body.round_number || '',
      topic: body.topic || '',
      round_context: body.round_context || '',
      partner_name: body.partner_name || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
