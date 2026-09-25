/**
 * Source snapshots. The exact text a card was cut from is stored and never
 * overwritten, so every card can be re-verified later. A page whose text has
 * changed since an earlier snapshot gets a new row.
 */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { sources } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { normalizeUrl } from "./discover";
import type { FetchedSource } from "./fetcher";

export interface SourceRow {
  id: string;
  fullText: string;
  textFormat: "html" | "pdf" | "plain" | "docx";
  paragraphs: string[];
  paragraphPages?: [number, number][];
}

export function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sourceType(f: FetchedSource): string {
  const host = (() => {
    try {
      return new URL(f.finalUrl).hostname;
    } catch {
      return "";
    }
  })();
  if (/\.(gov|mil)$/.test(host)) return "government";
  if (f.metadata.doi || /citation_journal|sciencedirect|springer|wiley|tandfonline|jstor|sagepub|mdpi|nature\.com|oup\.com|cambridge\.org/.test(host + (f.metadata.publisher ?? ""))) return "journal";
  if (f.format === "pdf") return "report";
  return "web";
}

export async function saveFetchedSource(teamId: string, f: FetchedSource, extra: { bibliographic?: unknown; discoveredVia?: string } = {}): Promise<SourceRow> {
  const hash = textHash(f.text);
  const canonical = normalizeUrl(f.metadata.canonicalUrl || f.finalUrl);
  const existing = await db()
    .select({ id: sources.id, textHash: sources.textHash, canonicalUrl: sources.canonicalUrl })
    .from(sources)
    .where(and(eq(sources.teamId, teamId), eq(sources.canonicalUrl, canonical)))
    .limit(1);
  const base = {
    url: f.finalUrl,
    doi: f.metadata.doi ?? null,
    title: f.metadata.title ?? "",
    publication: f.metadata.publisher || f.metadata.siteName || "",
    authors: f.metadata.authors.map((name) => ({ name, provenance: "source" })),
    publishedDate: f.metadata.published ? { raw: f.metadata.published } : null,
    sourceType: sourceType(f),
    retrieval: { method: f.method, httpStatus: f.httpStatus ?? null, contentType: f.contentType ?? null, fetchedAt: new Date().toISOString(), requestedUrl: f.url, notes: f.notes ?? [] },
    access: "open" as const,
    textHash: hash,
    textLength: f.text.length,
    fullText: f.text,
    textFormat: f.format,
    metadata: { ...f.metadata, paragraphs: f.paragraphs.length, paragraphPages: f.paragraphPages ?? null, ...extra },
  };
  const row = { id: "", fullText: f.text, textFormat: f.format, paragraphs: f.paragraphs, paragraphPages: f.paragraphPages };
  if (existing[0]?.textHash === hash) return { ...row, id: existing[0].id };
  const id = newId("src");
  // Keep the earlier snapshot intact: a changed page is stored under a snapshot-specific key.
  const canonicalUrl = existing[0] ? `${canonical}#snapshot-${hash.slice(0, 12)}` : canonical;
  await db()
    .insert(sources)
    .values({ id, teamId, canonicalUrl, ...base })
    .onConflictDoNothing();
  const again = await db().select({ id: sources.id }).from(sources).where(and(eq(sources.teamId, teamId), eq(sources.canonicalUrl, canonicalUrl))).limit(1);
  return { ...row, id: again[0]?.id ?? id };
}

export async function saveTextSource(
  teamId: string,
  input: { text: string; paragraphs: string[]; title?: string; url?: string; publication?: string; authors?: string[]; date?: string },
): Promise<SourceRow> {
  const id = newId("src");
  await db()
    .insert(sources)
    .values({
      id,
      teamId,
      url: input.url ?? null,
      canonicalUrl: null,
      title: input.title ?? "",
      publication: input.publication ?? "",
      authors: (input.authors ?? []).map((name) => ({ name, provenance: "user" })),
      publishedDate: input.date ? { raw: input.date } : null,
      sourceType: "user_text",
      retrieval: { method: "user_paste", fetchedAt: new Date().toISOString() },
      access: "user_provided",
      textHash: textHash(input.text),
      textLength: input.text.length,
      fullText: input.text,
      textFormat: "plain",
      metadata: { paragraphs: input.paragraphs.length },
    });
  return { id, fullText: input.text, textFormat: "plain", paragraphs: input.paragraphs };
}

export async function getSourceText(teamId: string, id: string): Promise<{ id: string; fullText: string; textFormat: string; url: string | null; title: string } | null> {
  const rows = await db()
    .select({ id: sources.id, fullText: sources.fullText, textFormat: sources.textFormat, url: sources.url, title: sources.title })
    .from(sources)
    .where(and(eq(sources.teamId, teamId), eq(sources.id, id)))
    .limit(1);
  const r = rows[0];
  return r ? { ...r, fullText: r.fullText ?? "" } : null;
}
