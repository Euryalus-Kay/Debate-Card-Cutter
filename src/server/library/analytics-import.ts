/**
 * Analytics from imported files (backfiles, speech docs, blocks) join the analytics bank, so drafts can adapt
 * the team's own answers the way they adapt answers from delivered speeches. One row per block: the analytics
 * under one heading, in order, with the short cites of the cards read in that block. The words are the file's
 * own; nothing is written by a model.
 */

import { createHash } from "node:crypto";
import { db } from "@/server/db/client";
import { analyticsBank } from "@/server/db/schema";
import { MARKER_LINE, type ImportedItem } from "@/server/ingest/structure";

const SPEECH = /\b(1AC|2AC|1AR|2AR|1NC|2NC|1NR|2NR)\b/i;
// Headings that name a speech or a round rather than an argument ("1NC", "Speech 2NC TOC rnd 4 9-12", "Off").
const NOT_A_POSITION = /^(?:send[_\s-]*)?(?:speech\s+)?(?:(?:1AC|2AC|1AR|2AR|1NC|2NC|1NR|2NR)\b.*(?:round|rnd|\bv\b|\bvs\b|doc|toc|opener|\d{1,2}[-/]\d{1,2}).*|(?:1AC|2AC|1AR|2AR|1NC|2NC|1NR|2NR)|off|on case|case|kick|blocks?|ext(?:ension)?s?|ov|overview|main)$/i;

export interface AnalyticBlock {
  /** index of the block's first item, unique within the file */
  at: number;
  speech: string;
  side: "aff" | "neg" | "";
  position: string;
  /** what the block answers, when its heading says ("AT: Perm do both" → "Perm do both") */
  answers: string;
  title: string;
  analytic: string;
  cites: string[];
}

export function speechOf(path: string[], fileName: string): string {
  // "Impact---2NC" names the speech; "2AC 1 – PDCP" and "AT: 2AC 3" name what the block answers.
  const own = (h: string) => SPEECH.exec(h.replace(/\b(?:1AC|2AC|1AR|2AR|1NC|2NC|1NR|2NR)\s*#?\d+\b/gi, "").replace(/\b(?:AT|A2|A\/T)\b.*$/i, ""))?.[1].toUpperCase();
  const last = path[path.length - 1];
  return (last && own(last)) || own(fileName) || [...path.slice(0, -1)].reverse().map(own).find(Boolean) || "";
}

export function sideOf(speech: string, fileName: string, path: string[]): "aff" | "neg" | "" {
  if (speech) return /^[12]A/.test(speech) ? "aff" : "neg";
  const where = `${fileName} ${path.join(" ")}`;
  if (/\bneg\b/i.test(where)) return "neg";
  if (/\baff\b/i.test(where)) return "aff";
  return "";
}

function positionOf(path: string[]): string {
  const clean = (h: string) => {
    const t = h.trim();
    if (!t || NOT_A_POSITION.test(t)) return "";
    // "1AC---Single Payer" → "Single Payer"; "Theory---AT: Conditionality" → "Theory"
    return t.replace(/^(?:1AC|2AC|1AR|2AR|1NC|2NC|1NR|2NR)\s*[-–—:]+\s*/i, "").replace(/\s*[-–—:,]*\s*\b(?:AT|A2|A\/T)\b[\s:\-–—,].*$/i, "").trim().slice(0, 120);
  };
  // The block's own heading is the position only when nothing above it names one ("1NC" > "T---Multi Payer").
  for (const h of path.slice(0, -1)) if (clean(h)) return clean(h);
  return clean(path[path.length - 1] ?? "");
}

function answersOf(heading: string): string {
  const at = /(?:^|[\s\-–—:,])(?:AT|A2|A\/T)\b[\s:\-–—,]+(.+)$/i.exec(heading);
  if (at) return at[1].replace(/[-–—]+\s*(?:1AC|2AC|1AR|2AR|1NC|2NC|1NR|2NR)\s*$/i, "").trim();
  const numbered = /^(?:1AC|2AC|1AR|2AR|1NC|2NC|1NR|2NR)\s*#?\d+\s*[-–—:]+\s*(.+)$/i.exec(heading.trim());
  return numbered ? numbered[1].trim() : "";
}

/** The file's analytics, one block per heading. Blocks with fewer than eight words of analytics are skipped. */
export function analyticBlocks(items: ImportedItem[], fileName: string): AnalyticBlock[] {
  const out: AnalyticBlock[] = [];
  let cur: { at: number; path: string[]; lines: string[]; cites: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const analytic = cur.lines.join("\n").slice(0, 4000);
    if (analytic.split(/\s+/).filter(Boolean).length >= 8) {
      // A file can skip heading levels, leaving holes in the path.
      const path = cur.path.filter((h): h is string => !!h?.trim());
      const title = path[path.length - 1] ?? "";
      const speech = speechOf(path, fileName);
      out.push({ at: cur.at, speech, side: sideOf(speech, fileName, path), position: positionOf(path), answers: answersOf(title).slice(0, 300), title: title.slice(0, 300), analytic, cites: [...new Set(cur.cites)].slice(0, 20) });
    }
    cur = null;
  };
  items.forEach((it, i) => {
    if (it.kind === "heading") return void flush();
    const path = it.path;
    if (cur && cur.path.join("\u0001") !== path.join("\u0001")) flush();
    cur ??= { at: i, path, lines: [], cites: [] };
    if (it.kind === "card") {
      if (it.cite?.short) cur.cites.push(it.cite.short);
      return;
    }
    const text = it.text.trim();
    if (!text || MARKER_LINE.test(text)) return;
    cur.lines.push(text, ...it.detail.map((d) => `   ${d.trim()}`).filter((d) => d.trim()));
  });
  flush();
  return out;
}

/** Save a file's analytic blocks to the bank; the same words imported twice are kept once. */
export async function saveImportedAnalytics(args: { teamId: string; uploadId: string; fileName: string; items: ImportedItem[] }): Promise<number> {
  const blocks = analyticBlocks(args.items, args.fileName);
  if (!blocks.length) return 0;
  const rows = blocks.map((b) => ({
    id: `ab_imp_${createHash("sha256").update(`${args.teamId}\u0001${b.title}\u0001${b.analytic}`).digest("hex").slice(0, 24)}`,
    teamId: args.teamId,
    roundId: null,
    draftId: args.uploadId,
    sectionId: `blk_${b.at}`,
    speech: b.speech,
    position: b.position,
    answers: b.answers,
    title: b.title,
    analytic: b.analytic,
    cites: b.cites,
    source: args.fileName.slice(0, 300),
    side: b.side,
    uploadId: args.uploadId,
  }));
  let saved = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const r = await db().insert(analyticsBank).values(rows.slice(i, i + 100)).onConflictDoNothing().returning();
    saved += r.length;
  }
  return saved;
}
