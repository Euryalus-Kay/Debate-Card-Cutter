import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: collections } = await supabase
    .from('card_library')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .eq('is_shared', true)
    .order('created_at', { ascending: false });

  return NextResponse.json({ collections: collections || [], cards: cards || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabase
    .from('card_library')
    .insert({
      collection_name: body.collection_name,
      uploaded_by: body.uploaded_by || 'Anonymous',
      file_name: body.file_name || '',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
