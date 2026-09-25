/**
 * Library import benchmark on real files (Phase B1), with the real model.
 * For each file: how the deterministic parser does; then the AI splitter on the
 * same file with every style stripped (as a Google Docs export or PDF would be),
 * scored against the parser's cards (recall/precision by matching card text, merges count as misses); then
 * labels for a sample of cards. Prints and saves aggregates only (no card text).
 *
 *   npx tsx --env-file=.env.local scripts/bench/library-import.ts <out.json> <file.docx>...
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { ingest } from "@/server/uploads";
import { structureDocument, type ImportedCard } from "@/server/ingest/structure";
import { applyLabels, CHUNK, segmentChunk, type LabelRuns } from "@/server/library/segment";
import { labelCards } from "@/server/library/label";
import { verbatimText, type BodyBlock } from "@/domain/card";

const [out, ...files] = process.argv.slice(2);
const HAIKU = { input: 1 / 1e6, output: 5 / 1e6 };
const results: unknown[] = [];

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

for (const path of files) {
  const name = basename(path);
  const bytes = new Uint8Array(readFileSync(path));
  const parsed = await ingest(bytes, name);
  const original = parsed.structure.items.filter((i): i is ImportedCard => i.kind === "card" && i.body.length > 0);
  const row: Record<string, unknown> = { file: name, paragraphs: parsed.paragraphs.length, parser: { ...parsed.structure.counts, styled: parsed.structure.styled } };

  // The AI splitter on the same paragraphs with styles removed.
  const plain = parsed.paragraphs.map((p) => ({ ...p, headingLevel: 0 as const, styleId: undefined, styleName: undefined, runs: p.runs.map((r) => ({ ...r, charStyle: undefined, charStyleName: undefined })) }));
  let inTok = 0;
  let outTok = 0;
  const t0 = Date.now();
  const runs: LabelRuns = [];
  const chunks = Math.ceil(plain.length / CHUNK);
  const pending: Promise<LabelRuns>[] = [];
  for (let c = 0; c < chunks; c++) pending.push(segmentChunk(plain, c * CHUNK, Math.min(plain.length - 1, (c + 1) * CHUNK - 1), { teamId: "bench", onUsage: (u) => ((inTok += u?.inputTokens ?? 0), (outTok += u?.outputTokens ?? 0)) }));
  for (const r of await Promise.all(pending)) runs.push(...r);
  const labeled = applyLabels(plain, runs);
  const split = structureDocument(labeled.paragraphs, { cites: labeled.cites, junk: labeled.junk });
  const got = split.items.filter((i): i is ImportedCard => i.kind === "card" && i.body.length > 0);
  // A card matches when one body contains the other's opening and the lengths agree (the parser sometimes
  // misses a cite line that the splitter finds, leaving the cite inside the parser's body). Two cards merged
  // into one fail the length test, so a merge counts as a miss.
  const bodyOf = (c: ImportedCard) => norm(verbatimText(c.body as BodyBlock[]));
  const same = (a: string, b: string) => (a.includes(b.slice(0, 200)) || b.includes(a.slice(0, 200))) && Math.abs(a.length - b.length) <= Math.max(300, 0.15 * Math.max(a.length, b.length));
  // Camp files repeat cards across blocks, so each side is scored on its own: an original card is found when
  // some split card matches it, and a split card is right when it matches some original.
  const originalBodies = original.map((o) => ({ o, b: bodyOf(o) }));
  const gotBodies = got.map(bodyOf);
  const found = originalBodies.filter((x) => gotBodies.some((b) => same(x.b, b))).length;
  const matched = got.map((c, n) => ({ c, hits: originalBodies.filter((x) => same(x.b, gotBodies[n])).map((x) => x.o) })).filter((x) => x.hits.length);
  const tagOk = matched.filter((x) => x.hits.some((o) => norm(o.tag) === norm(x.c.tag))).length;
  row.splitter = {
    chunks,
    ms: Date.now() - t0,
    cards: got.length,
    recall: original.length ? +(found / original.length).toFixed(3) : null,
    precision: got.length ? +(matched.length / got.length).toFixed(3) : null,
    tagExact: matched.length ? +(tagOk / matched.length).toFixed(3) : null,
    costUsd: +(inTok * HAIKU.input + outTok * HAIKU.output).toFixed(4),
  };

  // Labels for a sample of the file's cards.
  const sample = original.slice(0, 30);
  let lIn = 0;
  let lOut = 0;
  const t1 = Date.now();
  const metas = await labelCards(
    sample.map((c) => ({ tag: c.tag, cite: c.cite?.short ?? "", body: c.body as BodyBlock[], path: c.path, fileName: name })),
    { teamId: "bench", onUsage: (u) => ((lIn += u?.inputTokens ?? 0), (lOut += u?.outputTokens ?? 0)) },
  );
  const labeledCount = metas.filter(Boolean).length;
  row.labels = {
    sample: sample.length,
    labeled: labeledCount,
    ms: Date.now() - t1,
    costUsd: +(lIn * HAIKU.input + lOut * HAIKU.output).toFixed(4),
    costPer1000Cards: sample.length ? +(((lIn * HAIKU.input + lOut * HAIKU.output) / sample.length) * 1000).toFixed(2) : null,
    sides: metas.reduce((m: Record<string, number>, x) => ((m[x?.side ?? "none"] = (m[x?.side ?? "none"] ?? 0) + 1), m), {}),
    argTypes: metas.reduce((m: Record<string, number>, x) => ((m[x?.argType ?? "none"] = (m[x?.argType ?? "none"] ?? 0) + 1), m), {}),
    positions: [...new Set(metas.map((x) => x?.position).filter(Boolean))].slice(0, 8),
  };
  console.log(JSON.stringify(row));
  results.push(row);
}
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), note: "Aggregates only; real files are not stored in the repo.", results }, null, 2));
