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
import type { BodyBlock, Card, CardIssue, VerificationStatus } from "@/domain/card";
import { fetchSource } from "@/server/research/fetcher";
import { saveFetchedSource } from "@/server/research/sources";
import { HttpError } from "@/server/authz";

export interface SourceCheck {
  status: VerificationStatus;
  outcome: "verified" | "mismatch" | "unreachable" | "no_link";
  note: string;
  issues: CardIssue[];
}

export async function checkCardAgainstSource(teamId: string, cardId: string): Promise<SourceCheck> {
  const [c] = await db().select().from(cards).where(and(eq(cards.id, cardId), eq(cards.teamId, teamId), isNull(cards.deletedAt)));
  if (!c) throw new HttpError(404, "Not found.");
  const citation = c.citation as Citation;
  const status = c.verificationStatus as VerificationStatus;
  const prior = (c.verification ?? { status, issues: [] }) as Card["verification"] & { lastCheck?: unknown };
  const url = citation.url?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return { status, outcome: "no_link", note: "This card's citation has no link to check it against. Add the URL in the citation, then check again.", issues: [] };

  const f = await fetchSource(url);
  const at = new Date().toISOString();
  if (!f.ok || !f.text.trim()) {
    const why = f.blocked === "paywall" ? "the page is behind a paywall" : f.blocked === "robots" ? "the site asks not to be read by software" : f.blocked === "bot_protection" ? "the site blocked automated reading" : f.error ?? "the page couldn't be read";
    await db().update(cards).set({ verification: { ...prior, lastCheck: { at, url, outcome: "unreachable", why } } as never, updatedAt: new Date() }).where(eq(cards.id, cardId));
    return { status, outcome: "unreachable", note: `Couldn't check it: ${why}. The card is unchanged.`, issues: [] };
  }
  const result = verifyAgainstSource(c.body as BodyBlock[], f.text, { dehyphenate: f.format === "pdf" });
  const source = await saveFetchedSource(teamId, f, { discoveredVia: "card_check" });
  const next: VerificationStatus = result.ok ? (citationGaps(citation).length ? "verified_quote_only" : "verified") : "mismatch";
  await db()
    .update(cards)
    .set({ verificationStatus: next, verification: { status: next, issues: result.issues, checkedAt: at, lastCheck: { at, url: f.finalUrl, outcome: result.ok ? "verified" : "mismatch" } } as never, sourceId: source.id, updatedAt: new Date() })
    .where(eq(cards.id, cardId));
  return result.ok
    ? { status: next, outcome: "verified", note: next === "verified" ? "Every word of the card is on the page, in order." : "Every word of the card is on the page, in order; some citation details are still missing.", issues: result.issues }
    : { status: next, outcome: "mismatch", note: "Some of the card's text isn't on the page (it may have been changed, or cut from a different version).", issues: result.issues };
}
