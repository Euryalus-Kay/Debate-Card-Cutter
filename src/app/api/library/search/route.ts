import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';

  let query = supabase
    .from('cards')
    .select('*')
    .eq('is_shared', true)
    .order('created_at', { ascending: false });

  if (q) {
    query = query.or(`tag.ilike.%${q}%,cite_author.ilike.%${q}%,cite.ilike.%${q}%`);
  }

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
