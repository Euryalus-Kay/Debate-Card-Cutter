// @vitest-environment node
/** Checking imported cards against their source (B4), on PGlite with the page fetch mocked. SYNTHETIC text. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { cards, teams, user } from "@/server/db/schema";

const pages = new Map<string, string | null>();
vi.mock("@/server/research/fetcher", async (orig) => ({
  ...(await orig<typeof import("@/server/research/fetcher")>()),
  fetchSource: async (url: string) => {
    const text = pages.get(url);
    return text
      ? { ok: true, url, finalUrl: url, method: "direct", format: "html", text, paragraphs: text.split("\n\n"), metadata: { authors: [], canonicalUrl: url } }
      : { ok: false, url, finalUrl: url, method: "direct", format: "html", text: "", paragraphs: [], metadata: { authors: [] }, blocked: "paywall", error: "paywall" };
  },
}));

const { createCard } = await import("@/server/cards");
const { checkCardAgainstSource } = await import("@/server/card-verify");
const { makeText } = await import("@/domain/card");

let close: () => Promise<void>;
beforeAll(async () => {
  ({ close } = await freshDb());
  await db().insert(user).values({ id: "u1", name: "Deb Ater", email: "u1@example.test" });
  await db().insert(teams).values({ id: "t1", name: "Team", createdBy: "u1" });
});
afterAll(async () => close());

const TEXT = "State water programs vary widely, and fewer than half of states run a permitting program of their own.";
// A card of more usual length (SYNTHETIC), and the same passage with its central claim changed.
const LONG = "State water programs vary widely across the country, and the invented survey in this report finds that fewer than half of states run a permitting program of their own for small streams. Where programs exist, they differ in scope, staffing, and enforcement, which leaves many wetlands without any review before they are filled. The report concludes that a national floor would close these gaps faster than state action alone.";
const LONG_CHANGED = LONG.replace("fewer than half of states run a permitting program of their own for small streams", "nearly every state now runs a strong permitting program for small streams and rivers").replace("which leaves many wetlands without any review", "which still protects most wetlands with a careful review");
async function imported(url: string | undefined, text = TEXT) {
  return createCard({ teamId: "t1", userId: "u1", tag: "States lack programs", citation: { authors: [{ name: "Invented Author", family: "Author" }], date: { year: 2024 }, url, title: "An Invented Report", publication: "Synthetic Journal", provenance: {} }, body: [makeText(text, { highlight: [{ start: 0, end: 30, color: "yellow" }] })], origin: "imported", verification: { status: "imported", issues: [] } });
}
const status = async (id: string) => (await db().select().from(cards).where(eq(cards.id, id)))[0].verificationStatus;

describe("checking a card against its source", () => {
  it("every word on the page, in order: verified, and the page is saved as its source", async () => {
    pages.set("https://example.test/a", `Intro paragraph.\n\n${TEXT} More text after.`);
    const id = await imported("https://example.test/a");
    const r = await checkCardAgainstSource("t1", id);
    expect(r.outcome).toBe("verified");
    expect(await status(id)).toMatch(/^verified/);
    expect((await db().select().from(cards).where(eq(cards.id, id)))[0].sourceId).toBeTruthy();
  });

  it("a card whose words really differ from the page: mismatch, with what didn't match", async () => {
    // Same passage, but the claims in the middle differ from the card's.
    pages.set("https://example.test/b", LONG_CHANGED);
    const id = await imported("https://example.test/b", LONG);
    const r = await checkCardAgainstSource("t1", id);
    expect(r.outcome).toBe("mismatch");
    expect(r.issues.length).toBeGreaterThan(0);
    expect(await status(id)).toBe("mismatch");
  });

  it("nearly all of the card on the page (a dateline or byline differs): noted, not a mismatch", async () => {
    pages.set("https://example.test/f", `WASHINGTON, March 3 — ${TEXT.replace("widely, and", "widely and")} Reporting by Invented Staff.`);
    const id = await imported("https://example.test/f");
    const r = await checkCardAgainstSource("t1", id);
    expect(r.outcome).toBe("close");
    expect(await status(id)).toBe("imported");
  });

  it("a page with little of the card (a landing page or preview) changes nothing", async () => {
    pages.set("https://example.test/g", "Abstract. This article studies state water programs. Download the PDF to read the full text.");
    const id = await imported("https://example.test/g");
    expect((await checkCardAgainstSource("t1", id)).outcome).toBe("partial_source");
    expect(await status(id)).toBe("imported");
  });

  it("a page that can't be read, or no link, changes nothing", async () => {
    pages.set("https://example.test/c", null);
    const a = await imported("https://example.test/c");
    expect((await checkCardAgainstSource("t1", a)).outcome).toBe("unreachable");
    expect(await status(a)).toBe("imported");
    const b = await imported(undefined);
    expect((await checkCardAgainstSource("t1", b)).outcome).toBe("no_link");
    await expect(checkCardAgainstSource("t2", a)).rejects.toThrow(/Not found/);
  });
});

describe("checking many cards as a job", () => {
  it("checks every imported card with a link and sums up what it found", async () => {
    const { createCheckJob, runCheckJob } = await import("@/server/library/check-job");
    const { jobs } = await import("@/server/db/schema");
    pages.set("https://example.test/d", `Some intro.\n\n${TEXT}`);
    pages.set("https://example.test/e", LONG_CHANGED);
    await imported("https://example.test/d");
    await imported("https://example.test/e", LONG);
    const r = await createCheckJob("t1", "u1");
    expect(r?.cards).toBeGreaterThanOrEqual(2);
    await runCheckJob(r!.jobId);
    const [j] = await db().select().from(jobs).where(eq(jobs.id, r!.jobId));
    expect(j.status).toBe("succeeded");
    expect(j.result).toMatchObject({ total: r!.cards, done: r!.cards });
    expect((j.result as { verified: number }).verified).toBeGreaterThanOrEqual(1);
    expect((j.result as { mismatch: number }).mismatch).toBeGreaterThanOrEqual(1);
    // Verified cards and mismatches drop out; cards still "imported" (unreadable, partial or close) stay checkable.
    const again = await createCheckJob("t1", "u1");
    expect(again?.cards).toBeLessThan(r!.cards);
  });
});
