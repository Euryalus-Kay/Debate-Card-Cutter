// @vitest-environment node
/**
 * Finding library cards for a speech (B2), on PGlite with the fake model (ratings by shared words).
 * SYNTHETIC cards: invented tags, authors and text.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { cards, teams, user } from "@/server/db/schema";
import { createCard } from "@/server/cards";
import { makeText } from "@/domain/card";
import { findEvidence } from "@/server/library/find";

let close: () => Promise<void>;
const prevFake = process.env.AI_FAKE;
const ids: Record<string, string> = {};

async function card(key: string, tag: string, text: string, meta: Record<string, string> | null) {
  const id = await createCard({ teamId: "t1", userId: "u1", tag, citation: { authors: [{ name: "Invented", family: "Invented" }], date: { year: 2025 }, provenance: {} }, body: [makeText(text, { highlight: [{ start: 0, end: text.length, color: "yellow" }] })], origin: "imported", verification: { status: "imported", issues: [] } });
  if (meta) await db().update(cards).set({ meta, metaText: Object.values(meta).join(" · ") }).where(eq(cards.id, id));
  ids[key] = id;
}

beforeAll(async () => {
  process.env.AI_FAKE = "1";
  ({ close } = await freshDb());
  await db().insert(user).values({ id: "u1", name: "Deb Ater", email: "u1@example.test" });
  await db().insert(teams).values([
    { id: "t1", name: "Team", createdBy: "u1" },
    { id: "t2", name: "Other", createdBy: "u1" },
  ]);
  await card("nonUnique", "Capital is already spent — the health bill is dead in committee", "The health bill is dead in committee because political capital is already spent on the budget fight.", { side: "aff", argType: "disad", position: "Politics DA", role: "answer", claim: "Political capital is already spent, so the health bill is dead" });
  await card("negLink", "The plan drains political capital and kills the health bill", "Passing the plan drains political capital, and the health bill dies as a result.", { side: "neg", argType: "disad", position: "Politics DA", role: "link", claim: "The plan drains political capital needed for the health bill" });
  await card("unrelated", "Warming causes extinction", "Unchecked warming causes extinction through ocean collapse.", { side: "either", argType: "impact", position: "Warming", role: "impact", claim: "Warming causes extinction" });
  await card("unlabeled", "States lack the money for insurance programs", "The states lack the money to run insurance programs without federal help.", null);
});
afterAll(async () => {
  process.env.AI_FAKE = prevFake;
  await close();
});

describe("findEvidence", () => {
  it("offers only cards that fit what we must answer, from our side, with what they prove", async () => {
    const r = await findEvidence("t1", [{ id: "a1", text: "Political capital is high now, so the health bill passes; the plan spends that capital", intent: "answer", position: "Politics DA" }], { side: "aff" });
    expect(r.cardIds).toContain(ids.nonUnique);
    expect(r.cardIds).not.toContain(ids.negLink); // labeled as the neg's card
    expect(r.cardIds).not.toContain(ids.unrelated);
    expect(r.byCard.get(ids.nonUnique)?.[0]).toMatchObject({ needId: "a1" });
    expect(r.byCard.get(ids.nonUnique)?.[0].use).toBeTruthy();
  });

  it("finds unlabeled cards too, and never cards already in the speech", async () => {
    const need = { id: "a2", text: "The states counterplan solves: states can run their own insurance programs with their own money", intent: "answer" as const, position: "States CP" };
    const r = await findEvidence("t1", [need], { side: "aff" });
    expect(r.cardIds).toContain(ids.unlabeled);
    const again = await findEvidence("t1", [need], { side: "aff", exclude: new Set([ids.unlabeled]) });
    expect(again.cardIds).not.toContain(ids.unlabeled);
    expect(again.cached).toBe(1); // same argument, same library: the earlier check is reused
  });

  it("skips cleanly with nothing to check, and never crosses teams", async () => {
    expect((await findEvidence("t1", [], { side: "aff" })).skipped).toBeTruthy();
    const other = await findEvidence("t2", [{ id: "a1", text: "Political capital is high now, so the health bill passes", intent: "answer" }], { side: "aff" });
    expect(other.cardIds).toEqual([]);
    expect(other.skipped).toBe("the library is empty");
  });
});

import { checkCardTags } from "@/server/ai/ops";
import { getCards } from "@/server/cards";

describe("findEvidence cache", () => {
  it("a new card in the library makes earlier checks stale", async () => {
    const need = { id: "a9", text: "Federal water rules crowd out state programs and state budgets", intent: "answer" as const };
    const first = await findEvidence("t1", [need], { side: "aff" });
    expect(first.cached).toBe(0);
    expect((await findEvidence("t1", [need], { side: "aff" })).cached).toBe(1);
    await card("fresh", "State budgets for water programs keep growing without federal rules", "State budgets for water programs keep growing without federal rules crowding them out.", { side: "aff", argType: "case_answer", position: "Case", role: "answer", claim: "State water budgets grow without federal rules" });
    const after = await findEvidence("t1", [need], { side: "aff" });
    expect(after.cached).toBe(0);
    expect(after.cardIds).toContain(ids.fresh);
  });
});

describe("checkCardTags", () => {
  it("keeps a supported new tag for a library card the speech reads, and nothing else", async () => {
    const rows = await getCards("t1", [ids.nonUnique, ids.unrelated]);
    const ctx = { cards: rows, libraryCardIds: [ids.nonUnique] };
    const r = checkCardTags(
      [
        { cardId: ids.nonUnique, tag: "The health bill is dead in committee — capital is already spent on the budget fight" },
        { cardId: ids.unrelated, tag: "Warming causes extinction through ocean collapse" }, // not a library card offered here
      ],
      ctx as never,
      new Set([ids.nonUnique, ids.unrelated]),
    );
    expect(r.kept).toEqual([{ cardId: ids.nonUnique, tag: "The health bill is dead in committee — capital is already spent on the budget fight" }]);
    expect(r.notes[0]).toMatchObject({ cardId: ids.nonUnique, was: "Capital is already spent — the health bill is dead in committee" });
  });

  it("refuses a tag that adds what the card doesn't say, and ignores cards the speech doesn't read", async () => {
    const rows = await getCards("t1", [ids.nonUnique]);
    const ctx = { cards: rows, libraryCardIds: [ids.nonUnique] };
    const refused = checkCardTags([{ cardId: ids.nonUnique, tag: "90% of senators say the health bill is dead" }], ctx as never, new Set([ids.nonUnique]));
    expect(refused.kept).toEqual([]);
    expect(refused.refused[0].problems.join(" ")).toMatch(/90%/);
    expect(checkCardTags([{ cardId: ids.nonUnique, tag: "The health bill is dead" }], ctx as never, new Set()).kept).toEqual([]);
  });
});
