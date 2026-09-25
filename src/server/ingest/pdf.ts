/**
 * PDF text extraction. Text-layer PDFs are extracted directly; if a PDF has
 * little or no text layer it is reported as probably scanned so the caller can
 * offer OCR (clearly labeled as machine-transcribed) instead of silently
 * accepting empty or scrambled text.
 */

import { extractText, getDocumentProxy } from "unpdf";

export interface PdfExtraction {
  pages: string[];
  text: string;
  pageCount: number;
  /** characters per page on average */
  density: number;
  likelyScanned: boolean;
  warnings: string[];
}

export async function extractPdf(bytes: Uint8Array): Promise<PdfExtraction> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+\n/g, "\n"));
  const total = pages.reduce((a, p) => a + p.trim().length, 0);
  const density = totalPages ? total / totalPages : 0;
  const warnings: string[] = [];
  const likelyScanned = density < 200;
  if (likelyScanned) warnings.push(`Only ${Math.round(density)} characters of text per page: this PDF is probably scanned images. OCR is needed, and OCR text must be checked against the page images.`);
  const replacementChars = (pages.join("").match(/�/g) ?? []).length;
  if (replacementChars > 20) warnings.push("The PDF's text layer contains unreadable characters (font encoding problems). Quotes from it may not match the visible page.");
  return { pages, text: pages.join("\n\n"), pageCount: totalPages, density, likelyScanned, warnings };
}
