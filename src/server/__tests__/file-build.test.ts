// @vitest-environment node
/**
 * Building a file (Phase E) on PGlite with the fake model: plan → approval → cards from the library or
 * research → assembled like an imported file. Research is stubbed (no web); SYNTHETIC cards.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { jobs, teams, uploadBlocks, uploads, user } from "@/server/db/schema";

vi.mock("@vercel/blob", () => ({ put: async (path: string) => ({ pathname: path }), get: async () => null }));
// Research: every job "cuts" nothing (no web in tests), so cards not in the library are reported missing.
vi.mock("@/server/research/jobs", async (orig) => ({
  ...(await orig<typeof import("@/server/research/jobs")>()),
  runResearchJob: async (id: string) => {
    await db().update(jobs).set({ status: "succeeded", result: { cardIds: [], summary: "No source made this claim." } }).where(eq(jobs.id, id));
  },
}));

const { createFileBuild, runFileBuild, approveFileBuild } = await import("@/server/files/build-job");
const { createCard } = await import("@/server/cards");
const { makeText } = await import("@/domain/card");

let close: () => Promise<void>;
const prevFake = process.env.AI_FAKE;
beforeAll(async () => {
  process.env.AI_FAKE = "1";
  ({ close } = await freshDb());
  await db().insert(user).values({ id: "u1", name: "Deb Ater", email: "u1@example.test" });
  await db().insert(teams).values({ id: "t1", name: "Team", createdBy: "u1" });
  // A library card that proves the fake plan's first card claim ("Capital flight is happening now").
  const text = "Capital flight is happening now as investors move money offshore ahead of new taxes.";
  const id = await createCard({ teamId: "t1", userId: "u1", tag: "Capital flight is happening now", citation: { authors: [{ name: "Invented Author", family: "Author" }], date: { year: 2025 }, provenance: {} }, body: [makeText(text, { highlight: [{ start: 0, end: 40, color: "yellow" }] })], origin: "ai_cut", verification: { status: "verified", issues: [] } });
  await db().update((await import("@/server/db/schema")).cards).set({ meta: { side: "neg", argType: "disad", position: "Capital flight", role: "uniqueness", claim: "Capital flight is happening now" }, metaText: "neg disad capital flight uniqueness" }).where(eq((await import("@/server/db/schema")).cards.id, id));
});
afterAll(async () => {
  process.env.AI_FAKE = prevFake;
  await close();
});

async function status(id: string) {
  return (await db().select().from(jobs).where(eq(jobs.id, id)))[0];
}

describe("building a file", () => {
  it("plans, waits for approval, then fills from the library and marks what research couldn't find", async () => {
    const id = await createFileBuild("t1", "u1", { kind: "da", argument: "Capital flight: the taxes that fund it push investment offshore", resolution: "", maxCards: 10 });
    await runFileBuild(id);
    let j = await status(id);
    expect(j.status).toBe("awaiting_approval");
    const cp = j.checkpoint as { items: { key: string; label: string }[] };
    expect(cp.items.length).toBe(2);
    // Nothing is researched before approval.
    expect((await db().select().from(jobs).where(eq(jobs.kind, "research"))).length).toBe(0);

    expect(await approveFileBuild("t1", id, [])).toBe(true);
    for (let i = 0; i < 5 && !["succeeded", "failed"].includes((await status(id)).status); i++) await runFileBuild(id);
    j = await status(id);
    expect(j.status).toBe("succeeded");
    const result = j.result as { uploadId: string; fromLibrary: number; missing: string[] };
    expect(result.fromLibrary).toBe(1);
    expect(result.missing).toEqual(["The plan causes Capital flight"]);

    // Saved like an imported file: headings, the library card, analytics, and the missing card said plainly.
    const [up] = await db().select().from(uploads).where(eq(uploads.id, result.uploadId));
    expect(up.purpose).toBe("library_file");
    const blocks = await db().select().from(uploadBlocks).where(eq(uploadBlocks.uploadId, result.uploadId)).orderBy(uploadBlocks.idx);
    expect(blocks.filter((b) => b.kind === "card").map((b) => b.text)).toEqual(["Capital flight is happening now"]);
    expect(blocks.some((b) => b.kind === "analytic" && b.text.startsWith("Card needed — The plan causes Capital flight"))).toBe(true);
    expect(blocks.filter((b) => b.kind === "heading").map((b) => b.level)).toEqual([1, 2, 3, 2, 3]);
  });

  it("a card the team drops is never researched, and a plan can't be approved twice", async () => {
    const id = await createFileBuild("t1", "u1", { kind: "da", argument: "Deficits: the program's cost raises interest rates", resolution: "", maxCards: 10 });
    await runFileBuild(id);
    const keys = ((await status(id)).checkpoint as { items: { key: string }[] }).items.map((i) => i.key);
    const before = (await db().select().from(jobs).where(eq(jobs.kind, "research"))).length;
    expect(await approveFileBuild("t1", id, keys)).toBe(true);
    expect(await approveFileBuild("t1", id, [])).toBe(false);
    for (let i = 0; i < 5 && (await status(id)).status !== "succeeded"; i++) await runFileBuild(id);
    expect((await db().select().from(jobs).where(eq(jobs.kind, "research"))).length).toBe(before);
    expect((await status(id)).result).toMatchObject({ cards: 0, missing: [] });
  });
});
