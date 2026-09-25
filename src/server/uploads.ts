/**
 * Upload validation, parsing, and storage.
 *
 * Every upload is checked by content (magic bytes), size-limited, hashed, and
 * parsed deterministically. Problems (empty text, scanned PDF, no structure)
 * are surfaced in parseResult rather than silently accepted.
 */

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { uploadBlocks, uploads } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { sha256Hex } from "@/server/docs/store";
import { parseDocx, DocxError, type DocParagraph } from "./ingest/docx";
import { parseHtmlToParagraphs, parsePlainText } from "./ingest/html";
import { extractPdf } from "./ingest/pdf";
import { structureDocument, type ImportedItem, type StructuredDoc } from "./ingest/structure";
import { HttpError } from "./authz";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type UploadKind = "docx" | "pdf" | "text" | "html";

export function sniffKind(bytes: Uint8Array, fileName: string): UploadKind | null {
  const head = bytes.subarray(0, 8);
  const isZip = head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05) && (head[3] === 0x04 || head[3] === 0x06);
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  const lower = fileName.toLowerCase();
  if (isPdf) return "pdf";
  if (isZip) return lower.endsWith(".docx") || lower.endsWith(".docm") || lower.endsWith(".dotx") ? "docx" : "docx";
  // OLE compound file = legacy .doc
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return null;
  // Treat everything else as text if it decodes as UTF-8 without many control chars.
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096));
  const controls = (sample.match(/[\u0000-\u0008\u000E-\u001F]/g) ?? []).length;
  if (controls > 10) return null;
  if (/<(html|body|p|div|span)[\s>]/i.test(sample)) return "html";
  return "text";
}

export interface IngestResult {
  paragraphs: DocParagraph[];
  structure: StructuredDoc;
  warnings: string[];
  quality: { characters: number; paragraphs: number; cards: number; analytics: number; headings: number; formatted: boolean; likelyScanned?: boolean };
  /** plain text for PDFs, kept for verification of cards cut from it */
  plainText?: string;
}

export async function ingest(bytes: Uint8Array, fileName: string, kindHint?: UploadKind): Promise<IngestResult> {
  const kind = kindHint ?? sniffKind(bytes, fileName);
  if (!kind) throw new HttpError(415, "Unsupported file. Upload .docx, .pdf, or plain text. Legacy .doc files must be re-saved as .docx.");
  const warnings: string[] = [];
  let paragraphs: DocParagraph[] = [];
  let plainText: string | undefined;
  let likelyScanned: boolean | undefined;
  try {
    if (kind === "docx") {
      const parsed = parseDocx(bytes);
      paragraphs = parsed.paragraphs;
      warnings.push(...parsed.warnings);
    } else if (kind === "pdf") {
      const pdf = await extractPdf(bytes);
      warnings.push(...pdf.warnings);
      likelyScanned = pdf.likelyScanned;
      plainText = pdf.text;
      paragraphs = parsePlainText(pdf.text);
    } else if (kind === "html") {
      paragraphs = parseHtmlToParagraphs(new TextDecoder().decode(bytes));
    } else {
      paragraphs = parsePlainText(new TextDecoder().decode(bytes));
    }
  } catch (e) {
    if (e instanceof DocxError) throw new HttpError(422, e.message);
    throw new HttpError(422, `Could not read this file: ${e instanceof Error ? e.message : "unknown error"}`);
  }
  const structure = structureDocument(paragraphs);
  warnings.push(...structure.issues);
  const characters = paragraphs.reduce((a, p) => a + p.text.length, 0);
  if (characters === 0 && !warnings.length) warnings.push("No text was found in this file.");
  const formatted = paragraphs.some((p) => p.runs.some((r) => r.props.underline || r.props.highlight));
  if (kind === "docx" && structure.counts.cards === 0 && characters > 2000) {
    warnings.push("No cards were recognized (no Tag headings followed by citations). If this is a speech doc, check that tags use Verbatim's Tag style or bold text.");
  }
  return {
    paragraphs,
    structure,
    warnings,
    plainText,
    quality: { characters, paragraphs: paragraphs.length, ...structure.counts, formatted, likelyScanned },
  };
}

export interface SavedUpload {
  id: string;
  fileName: string;
  kind: UploadKind;
  quality: IngestResult["quality"];
  warnings: string[];
  items: ImportedItem[];
}

/** Validate, parse, store the original privately, and save the structure. */
export async function saveUpload(args: {
  teamId: string;
  userId: string;
  roundId?: string | null;
  purpose: "speech_doc" | "library_file" | "source_pdf" | "other";
  fileName: string;
  bytes: Uint8Array;
  mime: string;
  attribution?: Record<string, unknown>;
}): Promise<SavedUpload> {
  if (args.bytes.byteLength === 0) throw new HttpError(400, "The file is empty.");
  if (args.bytes.byteLength > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files over 25 MB are not supported.");
  const kind = sniffKind(args.bytes, args.fileName);
  if (!kind) throw new HttpError(415, "Unsupported file. Upload .docx, .pdf, or plain text. Legacy .doc files must be re-saved as .docx.");
  const result = await ingest(args.bytes, args.fileName, kind);
  const id = newId("upl");
  const sha = await sha256Hex(args.bytes);

  let blobPath: string | null = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const safeName = args.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 120);
      const blob = await put(`teams/${args.teamId}/uploads/${id}/${safeName}`, Buffer.from(args.bytes), {
        access: "private",
        contentType: args.mime || "application/octet-stream",
        addRandomSuffix: false,
      });
      blobPath = blob.pathname;
    } catch (e) {
      result.warnings.push("The original file could not be archived (storage unavailable); the parsed text was saved.");
      console.error("blob put failed", e);
    }
  }

  await db()
    .insert(uploads)
    .values({
      id,
      teamId: args.teamId,
      roundId: args.roundId ?? null,
      purpose: args.purpose,
      fileName: args.fileName.slice(0, 300),
      mime: args.mime || kind,
      size: args.bytes.byteLength,
      sha256: sha,
      blobPath,
      status: "parsed",
      parseResult: { kind, quality: result.quality, warnings: result.warnings, plainText: result.plainText?.slice(0, 2_000_000) },
      attribution: args.attribution ?? {},
      createdBy: args.userId,
    });
  const items = result.structure.items;
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200).map((it, j) => ({
      uploadId: id,
      idx: i + j,
      kind: it.kind,
      level: it.kind === "heading" ? it.level : null,
      text: it.kind === "card" ? it.tag : it.text,
      data: it.kind === "card" ? { cite: it.cite, citation: it.citation, body: it.body, issues: it.issues } : it.kind === "analytic" ? { detail: it.detail } : null,
      path: it.kind === "heading" ? [] : it.path,
    }));
    if (chunk.length) await db().insert(uploadBlocks).values(chunk);
  }
  return { id, fileName: args.fileName, kind, quality: result.quality, warnings: result.warnings, items };
}

export async function uploadWithBlocks(uploadId: string) {
  const [u] = await db().select().from(uploads).where(eq(uploads.id, uploadId));
  if (!u) return null;
  const blocks = await db().select().from(uploadBlocks).where(eq(uploadBlocks.uploadId, uploadId)).orderBy(uploadBlocks.idx);
  return { upload: u, blocks };
}
