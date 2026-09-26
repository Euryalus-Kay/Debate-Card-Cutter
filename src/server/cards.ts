import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cardRevisions, cards, uploadBlocks, uploads } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { bodyHash, verbatimText, type BodyBlock, type Card, type CardIssue, type CardOrigin, type VerificationStatus } from "@/domain/card";
import { normalizeText } from "@/domain/verify";
import { shortCite, type Citation } from "@/domain/citation";
import { lintCard } from "@/domain/lint";
import type { CardMeta } from "@/domain/card-label";

export interface CardRow {
  id: string;
  teamId: string;
  folderId: string | null;
  tag: string;
  shortCite: string;
  citation: Citation;
  body: BodyBlock[];
  origin: CardOrigin;
  verificationStatus: VerificationStatus;
  verification: Card["verification"];
  sourceId: string | null;
  bodyHash: string;
  commentary: string;
  labels: string[];
  importedFrom: Record<string, unknown> | null;
  /** library labels (src/server/library/label.ts) */
  meta?: CardMeta | Record<string, never> | null;
  version: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function createCard(args: {
  teamId: string;
  userId: string | null;
  tag: string;
  citation: Citation;
  body: BodyBlock[];
  origin: CardOrigin;
  verification: Card["verification"];
  sourceId?: string | null;
  commentary?: string;
  labels?: string[];
  importedFrom?: Record<string, unknown> | null;
  folderId?: string | null;
}): Promise<string> {
  const id = newId("card");
  const hash = await bodyHash(args.body);
  const issues = lintCard({ tag: args.tag, body: args.body, citation: args.citation });
  await db()
    .insert(cards)
    .values({
      id,
      teamId: args.teamId,
      folderId: args.folderId ?? null,
      tag: args.tag.slice(0, 2000),
      shortCite: shortCite(args.citation),
      citation: args.citation,
      body: args.body,
      origin: args.origin,
      verificationStatus: args.verification.status,
      verification: { ...args.verification, issues: [...args.verification.issues, ...issues] },
      sourceId: args.sourceId ?? null,
      bodyHash: hash,
      commentary: args.commentary ?? "",
      labels: args.labels ?? [],
      importedFrom: args.importedFrom ?? null,
      plainText: verbatimText(args.body).slice(0, 100_000),
      createdBy: args.userId,
    });
  return id;
}

export async function getCards(teamId: string, ids: string[]): Promise<CardRow[]> {
  if (!ids.length) return [];
  const rows = await db()
    .select()
    .from(cards)
    .where(and(eq(cards.teamId, teamId), inArray(cards.id, ids), isNull(cards.deletedAt)));
  return rows as unknown as CardRow[];
}

export interface CardSearchHit {
  id: string;
  tag: string;
  shortCite: string;
  verificationStatus: string;
  origin: string;
  snippet: string;
  labels: string[];
  meta?: CardMeta | Record<string, never> | null;
  updatedAt: Date;
  rank: number;
}

/** Full-text + trigram search over the team's cards. */
export async function searchCards(teamId: string, q: string, opts: { limit?: number; verification?: string[] } = {}): Promise<CardSearchHit[]> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const query = q.trim();
  const verif = opts.verification?.length ? sql`and ${cards.verificationStatus} in (${sql.join(opts.verification.map((v) => sql`${v}`), sql`, `)})` : sql``;
  if (!query) {
    const rows = await db()
      .select({ id: cards.id, tag: cards.tag, shortCite: cards.shortCite, verificationStatus: cards.verificationStatus, origin: cards.origin, snippet: sql<string>`left(${cards.plainText}, 240)`, labels: cards.labels, meta: cards.meta, updatedAt: cards.updatedAt })
      .from(cards)
      .where(and(eq(cards.teamId, teamId), isNull(cards.deletedAt), opts.verification?.length ? inArray(cards.verificationStatus, opts.verification as never[]) : undefined))
      .orderBy(desc(cards.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, meta: r.meta as CardSearchHit["meta"], rank: 0 }));
  }
  const res = await db().execute(sql`
    with q as (select websearch_to_tsquery('english', ${query}) as tsq)
    select c.id, c.tag, c.short_cite as "shortCite", c.verification_status as "verificationStatus", c.origin, c.labels, c.meta, c.updated_at as "updatedAt",
      ts_headline('english', c.plain_text, q.tsq, 'MaxWords=40, MinWords=15, StartSel=«, StopSel=»') as snippet,
      (ts_rank(c.search, q.tsq) * 2 + similarity(c.tag, ${query})) as rank
    from ${cards} c, q
    where c.team_id = ${teamId} and c.deleted_at is null ${verif}
      and (c.search @@ q.tsq or c.tag % ${query} or c.short_cite ilike ${"%" + query + "%"})
    order by rank desc
    limit ${limit}
  `);
  return (res as unknown as { rows: CardSearchHit[] }).rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}

/** Import every card in an uploaded document into the team library (origin "imported"). */
export async function importCardsFromUpload(uploadId: string, teamId: string, userId: string, labels: string[] = []): Promise<{ created: number; duplicates: number }> {
  const [up] = await db().select().from(uploads).where(and(eq(uploads.id, uploadId), eq(uploads.teamId, teamId)));
  if (!up) throw new Error("upload not found");
  const blocks = await db()
    .select()
    .from(uploadBlocks)
    .where(and(eq(uploadBlocks.uploadId, uploadId), eq(uploadBlocks.kind, "card")))
    .orderBy(uploadBlocks.idx);
  let created = 0;
  let duplicates = 0;
  for (const b of blocks) {
    const data = (b.data ?? {}) as { citation?: Citation; body?: BodyBlock[] };
    const body = data.body ?? [];
    if (!body.length) continue;
    const hash = await bodyHash(body);
    const [dup] = await db()
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.teamId, teamId), eq(cards.bodyHash, hash), isNull(cards.deletedAt)))
      .limit(1);
    if (dup) {
      duplicates++;
      continue;
    }
    await createCard({
      teamId,
      userId,
      tag: b.text,
      citation: data.citation ?? { authors: [], provenance: {} },
      body,
      origin: "imported",
      verification: { status: "imported", issues: [] },
      labels: [...labels, ...((b.path as string[]) ?? []).slice(0, 3)],
      importedFrom: { uploadId, fileName: up.fileName, blockIdx: b.idx, path: b.path },
    });
    created++;
  }
  return { created, duplicates };
}

export async function updateCard(teamId: string, id: string, userId: string, patch: { tag?: string; body?: BodyBlock[]; citation?: Citation; commentary?: string; labels?: string[]; folderId?: string | null }, reason: string) {
  const [cur] = (await getCards(teamId, [id])) as CardRow[];
  if (!cur) throw new Error("card not found");
  await db().insert(cardRevisions).values({ id: newId("crev"), cardId: id, version: cur.version, snapshot: { tag: cur.tag, citation: cur.citation, body: cur.body, commentary: cur.commentary }, reason, changedBy: userId });
  const next: Record<string, unknown> = { updatedAt: new Date(), version: cur.version + 1 };
  if (patch.tag !== undefined) next.tag = patch.tag;
  if (patch.commentary !== undefined) next.commentary = patch.commentary;
  if (patch.labels !== undefined) next.labels = patch.labels;
  if (patch.folderId !== undefined) next.folderId = patch.folderId;
  if (patch.citation !== undefined) {
    next.citation = patch.citation;
    next.shortCite = shortCite(patch.citation);
  }
  if (patch.body !== undefined) {
    const textChanged = verbatimText(patch.body) !== verbatimText(cur.body);
    next.body = patch.body;
    next.plainText = verbatimText(patch.body).slice(0, 100_000);
    next.bodyHash = await bodyHash(patch.body);
    if (textChanged && (cur.verificationStatus === "verified" || cur.verificationStatus === "verified_quote_only")) {
      // Editing verified text invalidates verification until re-checked.
      next.verificationStatus = "unverified";
      next.verification = { ...cur.verification, status: "unverified", issues: [{ severity: "warning", code: "text_edited_after_verification", message: "The evidence text was edited after it was verified. Re-verify against the source." }] };
    }
  }
  await db().update(cards).set(next).where(and(eq(cards.id, id), eq(cards.teamId, teamId)));
}

/** Same evidence, same tag, same highlighting: nothing new to keep. */
const hasCite = (c: Citation) => !!(c.authors?.length || c.organization || c.raw?.trim());

/** Two texts are the same words when the shorter (at least 25 words) is inside the longer. */
function sameWords(x: string, y: string): boolean {
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.split(" ").length >= 25 && long.includes(short);
}

/**
 * A card the file gives no cite for (a re-read marked "<<<1NC Jackson>>>", say) takes the cite of a card with the
 * same words: an earlier card in this file, or one already in the library. With no such card, nothing is guessed.
 */
async function citeFromSameWords(teamId: string, body: BodyBlock[], earlier: { citation: Citation; norm: string; label: string }[]): Promise<{ citation: Citation; from: string } | null> {
  const norm = normalizeText(verbatimText(body), { caseFold: true });
  const words = norm.split(" ").filter(Boolean);
  if (words.length < 25) return null;
  for (const e of [...earlier].reverse()) if (sameWords(e.norm, norm)) return { citation: e.citation, from: e.label };
  // In the library: a phrase from the middle of the card finds candidates; the full text confirms.
  const mid = Math.floor(words.length / 2);
  const phrase = words.slice(Math.max(0, mid - 4), mid + 4).join(" ");
  const rows = await db()
    .select({ shortCite: cards.shortCite, citation: cards.citation, plainText: cards.plainText })
    .from(cards)
    .where(and(eq(cards.teamId, teamId), isNull(cards.deletedAt), sql`${cards.search} @@ phraseto_tsquery('english', ${phrase})`))
    .limit(8);
  for (const r of rows) {
    const c = r.citation as Citation;
    if (hasCite(c) && sameWords(normalizeText(r.plainText, { caseFold: true }), norm)) return { citation: c, from: r.shortCite };
  }
  return null;
}

function sameCard(a: { tag: string; body: BodyBlock[] }, b: { tag: string; body: BodyBlock[] }): boolean {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  // Spans as plain tuples: stored JSON doesn't keep key order.
  const marks = (body: BodyBlock[]) =>
    JSON.stringify(body.map((x) => (x.kind === "text" ? [x.highlight.map((h) => [h.start, h.end, h.color]), x.underline.map((u) => [u.start, u.end])] : null)));
  return norm(a.tag) === norm(b.tag) && marks(a.body) === marks(b.body);
}

export interface BatchImportResult {
  created: string[];
  duplicates: number;
  variants: number;
}

/**
 * Import a file's cards in bulk (Phase B1): one lookup for all duplicates, inserts in batches. A card whose
 * evidence the library already has is skipped when its tag and highlighting match, and kept as a variant
 * of the existing card when they differ (another team's tag or highlighting of the same text).
 */
export async function importCardsBatch(args: {
  teamId: string;
  userId: string;
  uploadId: string;
  fileName: string;
  labels: string[];
  items: { blockIdx: number; tag: string; citation: Citation; body: BodyBlock[]; path: string[] }[];
}): Promise<BatchImportResult> {
  const withHash = await Promise.all(args.items.map(async (it) => ({ ...it, hash: await bodyHash(it.body) })));
  const hashes = [...new Set(withHash.map((x) => x.hash))];
  const existing = new Map<string, { id: string; tag: string; body: BodyBlock[] }[]>();
  for (let i = 0; i < hashes.length; i += 500) {
    const rows = await db()
      .select({ id: cards.id, tag: cards.tag, body: cards.body, bodyHash: cards.bodyHash })
      .from(cards)
      .where(and(eq(cards.teamId, args.teamId), inArray(cards.bodyHash, hashes.slice(i, i + 500)), isNull(cards.deletedAt)));
    for (const r of rows) existing.set(r.bodyHash, [...(existing.get(r.bodyHash) ?? []), { id: r.id, tag: r.tag, body: r.body as BodyBlock[] }]);
  }
  const out: BatchImportResult = { created: [], duplicates: 0, variants: 0 };
  const rows: (typeof cards.$inferInsert)[] = [];
  const earlier: { citation: Citation; norm: string; label: string }[] = [];
  for (const it of withHash) {
    const known = existing.get(it.hash) ?? [];
    if (known.some((k) => sameCard(k, it))) {
      out.duplicates++;
      continue;
    }
    const id = newId("card");
    const variantOf = known[0]?.id ?? null;
    if (variantOf) out.variants++;
    let citation = it.citation;
    const inherited: CardIssue[] = [];
    if (!hasCite(citation)) {
      const same = await citeFromSameWords(args.teamId, it.body, earlier);
      if (same) {
        citation = structuredClone(same.citation);
        inherited.push({ severity: "info", code: "cite_from_same_words", message: `The file gives no cite for this card; its cite comes from ${same.from}, whose text contains this card's words exactly.` });
      }
    }
    if (hasCite(citation)) earlier.push({ citation, norm: normalizeText(verbatimText(it.body), { caseFold: true }), label: shortCite(citation) });
    const issues = [...lintCard({ tag: it.tag, body: it.body, citation }), ...inherited];
    rows.push({
      id,
      teamId: args.teamId,
      tag: it.tag.slice(0, 2000),
      shortCite: shortCite(citation),
      citation,
      body: it.body,
      origin: "imported",
      verificationStatus: "imported",
      verification: { status: "imported", issues },
      bodyHash: it.hash,
      // A file can skip heading levels, leaving holes in the path: only real headings become labels.
      labels: [...new Set([...args.labels, ...it.path.slice(0, 3)].filter((l): l is string => typeof l === "string" && !!l.trim()))].slice(0, 12),
      importedFrom: { uploadId: args.uploadId, fileName: args.fileName, blockIdx: it.blockIdx, path: it.path },
      plainText: verbatimText(it.body).slice(0, 100_000),
      variantOf,
      createdBy: args.userId,
    });
    existing.set(it.hash, [...known, { id, tag: it.tag, body: it.body }]);
    out.created.push(id);
  }
  for (let i = 0; i < rows.length; i += 100) await db().insert(cards).values(rows.slice(i, i + 100));
  return out;
}
