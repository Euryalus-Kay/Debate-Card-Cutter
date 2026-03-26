import { NextRequest, NextResponse } from 'next/server';
import { parseDocument } from '@/lib/document-parser';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseDocument(buffer, file.name);
  return NextResponse.json(result);
}
