import mammoth from 'mammoth';

export async function parseDocument(buffer: Buffer, filename: string): Promise<{
  text: string;
  html: string;
  has_highlights: boolean;
}> {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'docx' || ext === 'doc') {
    return parseDocx(buffer);
  } else if (ext === 'pdf') {
    return parsePdf(buffer);
  } else {
    // Plain text
    const text = buffer.toString('utf-8');
    return { text, html: text, has_highlights: false };
  }
}

async function parseDocx(buffer: Buffer): Promise<{ text: string; html: string; has_highlights: boolean }> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: [
        "b => b",
        "u => u",
        "highlight => mark",
      ],
    }
  );

  const html = result.value;
  // Check for highlights (bold+underline or mark tags)
  const has_highlights = html.includes('<mark>') || html.includes('<mark ') ||
    (html.includes('<b>') && html.includes('<u>'));

  // Also extract plain text
  const textResult = await mammoth.extractRawText({ buffer });
  const text = textResult.value;

  return { text, html, has_highlights };
}

async function parsePdf(buffer: Buffer): Promise<{ text: string; html: string; has_highlights: boolean }> {
  // Dynamic import for pdf-parse
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    html: data.text,
    has_highlights: false,
  };
}
