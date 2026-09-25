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
async function imported(url: string | undefined) {
  return createCard({ teamId: "t1", userId: "u1", tag: "States lack programs", citation: { authors: [{ name: "Invented Author", family: "Author" }], date: { year: 2024 }, url, title: "An Invented Report", publication: "Synthetic Journal", provenance: {} }, body: [makeText(TEXT, { highlight: [{ start: 0, end: 30, color: "yellow" }] })], origin: "imported", verification: { status: "imported", issues: [] } });
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

  it("text that isn't on the page: mismatch, with what didn't match", async () => {
    pages.set("https://example.test/b", "State water programs vary widely, but most states run strong programs of their own.");
    const id = await imported("https://example.test/b");
    const r = await checkCardAgainstSource("t1", id);
    expect(r.outcome).toBe("mismatch");
    expect(r.issues.length).toBeGreaterThan(0);
    expect(await status(id)).toBe("mismatch");
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
