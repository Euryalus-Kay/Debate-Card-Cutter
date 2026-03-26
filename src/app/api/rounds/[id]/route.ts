import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: round, error } = await supabase.from('rounds').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: speeches } = await supabase
    .from('speeches')
    .select('*')
    .eq('round_id', id)
    .order('speech_order', { ascending: true });

  const { data: flowEntries } = await supabase
    .from('flow_entries')
    .select('*')
    .eq('round_id', id)
    .order('row_index', { ascending: true });

  return NextResponse.json({ round, speeches: speeches || [], flowEntries: flowEntries || [] });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { data, error } = await supabase
    .from('rounds')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from('rounds').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
