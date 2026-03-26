import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  const { round_id } = await req.json();

  const { data: flowEntries } = await supabase
    .from('flow_entries')
    .select('*')
    .eq('round_id', round_id)
    .order('row_index', { ascending: true });

  if (!flowEntries || flowEntries.length === 0) {
    return new Response(JSON.stringify({ error: 'No flow data' }), { status: 400 });
  }

  const speechCols = ['1AC', '1NC', '2AC', '2NC', '1NR', '1AR', '2NR', '2AR'];
  const rows: Record<string, string>[] = [];

  for (const entry of flowEntries) {
    const row: Record<string, string> = {
      'Category': entry.category,
      'Argument': entry.label,
    };
    for (const col of speechCols) {
      const cell = (entry.entries as Record<string, { text?: string; status?: string }>)?.[col];
      row[col] = cell?.text || '';
    }
    rows.push(row);
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Flow');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="debate-flow.xlsx"',
    },
  });
}
