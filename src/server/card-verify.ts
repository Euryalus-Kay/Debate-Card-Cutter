/**
 * Checking a card against its source (B4): imported cards (and ones whose source was out of reach) are
 * checked word for word against the page their citation links to. A match makes the card verified; text
 * that isn't on the page makes it a mismatch, with what didn't match. A page that can't be read (paywall,
 * blocked, gone) changes nothing but is noted.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cards } from "@/server/db/schema";
import { verifyAgainstSource } from "@/domain/verify";
import { citationGaps, type Citation } from "@/domain/citation";
import { verbatimText, type BodyBlock, type Card, type CardIssue, type VerificationStatus } from "@/domain/card";
import { fetchSource } from "@/server/research/fetcher";
import { saveFetchedSource } from "@/server/research/sources";
import { HttpError } from "@/server/authz";

export interface SourceCheck {
  status: VerificationStatus;
  /** close: nearly all of the card is on the page, with small differences listed; partial_source: the page
   * we could read holds little of the card (a landing page, preview, or other version) */
  outcome: "verified" | "close" | "mismatch" | "partial_source" | "unreachable" | "no_link";
  note: string;
  issues: CardIssue[];
  /** share of the card's four-word runs found on the page */
  coverage?: number;
}

/** Share of the card's four-word runs that appear on the page (spacing, case and punctuation ignored). */
export function textCoverage(cardText: string, pageText: string): number {
  const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const grams = (w: string[]) => {
    const out: string[] = [];
    for (let i = 0; i + 4 <= w.length; i++) out.push(w.slice(i, i + 4).join(" "));
    return out;
  };
  const card = grams(words(cardText));
  if (!card.length) return 0;
  const page = new Set(grams(words(pageText)));
  return card.filter((g) => page.has(g)).length / card.length;
}

export async function checkCardAgainstSource(teamId: string, cardId: string): Promise<SourceCheck> {
  const [c] = await db().select().from(cards).where(and(eq(cards.id, cardId), eq(cards.teamId, teamId), isNull(cards.deletedAt)));
  if (!c) throw new HttpError(404, "Not found.");
  const citation = c.citation as Citation;
  const status = c.verificationStatus as VerificationStatus;
  const prior = (c.verification ?? { status, issues: [] }) as Card["verification"] & { lastCheck?: unknown };
  const url = citation.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return { status, outcome: "no_link", note: "This card's citation has no link to check it against. Add the URL in the citation, then check again.", issues: [] };

  const f = await fetchSource(url, { teamId });
  const at = new Date().toISOString();
  if (!f.ok || !f.text.trim()) {
    const why = f.blocked === "paywall" ? "the page is behind a paywall" : f.blocked === "robots" ? "the site asks not to be read by software" : f.blocked === "bot_protection" ? "the site blocked automated reading" : f.error ?? "the page couldn't be read";
    await db().update(cards).set({ verification: { ...prior, lastCheck: { at, url, outcome: "unreachable", why } } as never, updatedAt: new Date() }).where(eq(cards.id, cardId));
    return { status, outcome: "unreachable", note: `Couldn't check it: ${why}. The card is unchanged.`, issues: [] };
  }
  const result = verifyAgainstSource(c.body as BodyBlock[], f.text, { dehyphenate: f.format === "pdf" });
  if (result.ok) {
    const source = await saveFetchedSource(teamId, f, { discoveredVia: "card_check" });
    const next: VerificationStatus = citationGaps(citation).length ? "verified_quote_only" : "verified";
    await db()
      .update(cards)
      .set({ verificationStatus: next, verification: { status: next, issues: result.issues, checkedAt: at, lastCheck: { at, url: f.finalUrl, outcome: "verified" } } as never, sourceId: source.id, updatedAt: new Date() })
      .where(eq(cards.id, cardId));
    return { status: next, outcome: "verified", note: next === "verified" ? "Every word of the card is on the page, in order." : "Every word of the card is on the page, in order; some citation details are still missing.", issues: result.issues, coverage: 1 };
  }
  // Not an exact match. How much of the card is on the page decides what that means: little of it means we
  // couldn't read the real source (a landing page, a preview, another version); nearly all of it means small
  // differences to look at; in between, the card and the page really differ.
  const coverage = textCoverage(verbatimText(c.body as BodyBlock[]), f.text);
  const pct = Math.round(coverage * 100);
  if (coverage < 0.5) {
    await db().update(cards).set({ verification: { ...prior, lastCheck: { at, url: f.finalUrl, outcome: "partial_source", coverage: pct } } as never, updatedAt: new Date() }).where(eq(cards.id, cardId));
    return { status, outcome: "partial_source", note: `The page we could read has only ${pct}% of the card's text (it may be a summary, a preview, or a different version). The card is unchanged.`, issues: [], coverage };
  }
  if (coverage >= 0.9) {
    await db().update(cards).set({ verification: { ...prior, issues: [...(prior.issues ?? []).filter((i) => i.code !== "source_differs"), { severity: "warning", code: "source_differs", message: `Checked against ${f.finalUrl}: ${pct}% of the card is on the page; differences: ${result.issues.slice(0, 2).map((i) => i.message).join(" ")}`.slice(0, 600) }], lastCheck: { at, url: f.finalUrl, outcome: "close", coverage: pct } } as never, updatedAt: new Date() }).where(eq(cards.id, cardId));
    return { status, outcome: "close", note: `Nearly all of the card (${pct}%) is on the page; a few words differ. The differences are noted on the card.`, issues: result.issues, coverage };
  }
  const source = await saveFetchedSource(teamId, f, { discoveredVia: "card_check" });
  await db()
    .update(cards)
    .set({ verificationStatus: "mismatch", verification: { status: "mismatch", issues: result.issues, checkedAt: at, lastCheck: { at, url: f.finalUrl, outcome: "mismatch", coverage: pct } } as never, sourceId: source.id, updatedAt: new Date() })
    .where(eq(cards.id, cardId));
  return { status: "mismatch", outcome: "mismatch", note: `Only ${pct}% of the card is on the page as cut: its text and the source differ (it may have been changed, or cut from a different version).`, issues: result.issues, coverage };
}
