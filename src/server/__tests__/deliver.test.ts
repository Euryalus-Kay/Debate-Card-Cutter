// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { teams, user } from "@/server/db/schema";
import { createDraft, createRound, RoundInput } from "@/server/rounds";
import { applyServerChange, loadDoc } from "@/server/docs/store";
import { deliverDraft } from "@/server/drafts";
import { readArgs, upsertArg, upsertPosition } from "@/shared/round-doc";
import { DRAFT_FRAGMENT, draftSchema } from "@/shared/editor/schema";

let close: () => Promise<void>;
beforeAll(async () => {
  ({ close } = await freshDb());
});
afterAll(async () => close());

// SYNTHETIC FIXTURE: a 2AC answering two off-case positions.
const section = (id: string, title: string, targets: string[]) => ({
  type: "section",
  attrs: { id, kind: "response", relation: "answers", targets },
  content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: title }] }, { type: "paragraph", content: [{ type: "text", text: `${title}.` }] }],
});

describe("delivering a speech", () => {
  it("records our answers on the flow, numbered per position", async () => {
    await db().insert(user).values({ id: "u1", name: "Deb Ater", email: "u1@example.test" });
    await db().insert(teams).values({ id: "t1", name: "Team", createdBy: "u1" });
    const { id: roundId, stateDocId } = await createRound("t1", "u1", RoundInput.parse({ ourSide: "aff" }));
    await applyServerChange(
      stateDocId,
      (doc) => {
        upsertPosition(doc, { id: "p_da", name: "Politics DA", kind: "da", side: "neg", introducedIn: "1NC", order: 0 });
        upsertPosition(doc, { id: "p_cp", name: "States CP", kind: "cp", side: "neg", introducedIn: "1NC", order: 1 });
        for (const [id, pos] of [["a1", "p_da"], ["a2", "p_da"], ["a3", "p_cp"]] as const) {
          upsertArg(doc, { id, positionId: pos, speech: "1NC", side: "neg", order: 1, label: "1", text: id, role: "claim", cardIds: [], provenance: { type: "user_note", by: "u1" }, delivery: "confirmed" });
        }
      },
      { userId: "u1", origin: "test" },
    );
    const draftId = await createDraft({ teamId: "t1", roundId, speech: "2AC", userId: "u1" });
    await applyServerChange(
      draftId,
      (doc) => {
        const json = { type: "doc", content: [section("s1", "Non-unique", ["a1"]), section("s2", "No link", ["a2"]), section("s3", "Perm do both", ["a3"]), section("s4", "Solvency deficit", ["a3"])] };
        prosemirrorJSONToYXmlFragment(draftSchema(), json, doc.getXmlFragment(DRAFT_FRAGMENT));
      },
      { userId: "u1", origin: "test" },
    );

    const r = await deliverDraft(draftId, "u1");
    expect(r.args).toBe(4);
    const { doc } = await loadDoc(stateDocId);
    const ours = readArgs(doc).filter((a) => a.speech === "2AC");
    const labels = (pos: string) => ours.filter((a) => a.positionId === pos).sort((x, y) => x.order - y.order).map((a) => `${a.label} ${a.text}`);
    expect(labels("p_da")).toEqual(["1 Non-unique", "2 No link"]);
    expect(labels("p_cp")).toEqual(["1 Perm do both", "2 Solvency deficit"]);
    expect(ours.every((a) => a.delivery === "confirmed")).toBe(true);
  });

  it("a card marked skipped isn't counted as read, and a section of only skipped cards wasn't said", async () => {
    const { id: roundId, stateDocId } = await createRound("t1", "u1", RoundInput.parse({ ourSide: "aff" }));
    await applyServerChange(
      stateDocId,
      (doc) => {
        upsertPosition(doc, { id: "p_da", name: "Politics DA", kind: "da", side: "neg", introducedIn: "1NC", order: 0 });
        for (const id of ["b1", "b2"]) upsertArg(doc, { id, positionId: "p_da", speech: "1NC", side: "neg", order: 1, label: "1", text: id, role: "claim", cardIds: [], provenance: { type: "user_note", by: "u1" }, delivery: "confirmed" });
      },
      { userId: "u1", origin: "test" },
    );
    const draftId = await createDraft({ teamId: "t1", roundId, speech: "2AC", userId: "u1" });
    const card = (id: string, read: string) => ({ type: "card", attrs: { id, cardId: `card_${id}`, read }, content: [{ type: "cardTag", content: [{ type: "text", text: "Tag" }] }, { type: "cardCite", attrs: { short: `Lee 2${id.slice(-1)}`, full: "Lee" } }, { type: "cardBody", content: [{ type: "cardPara", content: [{ type: "text", text: "Words." }] }] }] });
    await applyServerChange(
      draftId,
      (doc) => {
        const json = {
          type: "doc",
          content: [
            { type: "section", attrs: { id: "s1", kind: "response", relation: "answers", targets: ["b1"] }, content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Read card" }] }, card("c1", "planned"), card("c2", "skipped")] },
            { type: "section", attrs: { id: "s2", kind: "response", relation: "answers", targets: ["b2"] }, content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Skipped card" }] }, card("c3", "skipped")] },
          ],
        };
        prosemirrorJSONToYXmlFragment(draftSchema(), json, doc.getXmlFragment(DRAFT_FRAGMENT));
      },
      { userId: "u1", origin: "test" },
    );
    await deliverDraft(draftId, "u1");
    const { doc } = await loadDoc(stateDocId);
    const ours = Object.fromEntries(readArgs(doc).filter((a) => a.speech === "2AC").map((a) => [a.text, a]));
    expect(ours["Read card"]).toMatchObject({ delivery: "confirmed", cardIds: ["card_c1"], cites: ["Lee 21"] });
    expect(ours["Skipped card"].delivery).toBe("not_read");
  });
});

describe("after delivery: where cards were read, and the team's answers for later rounds", () => {
  it("banks answer sections with what they answered, records card uses, and later rounds find them", async () => {
    const { analyticsBank, cardUses } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const { pastAnswers } = await import("@/server/delivered");
    const { createCard } = await import("@/server/cards");
    const { makeText } = await import("@/domain/card");
    const cardId = await createCard({ teamId: "t1", userId: "u1", tag: "States can't coordinate", citation: { authors: [{ name: "Invented", family: "Invented" }], date: { year: 2025 }, provenance: {} }, body: [makeText("States can't coordinate across borders.")], origin: "ai_cut", verification: { status: "verified", issues: [] } });
    const { id: roundId, stateDocId } = await createRound("t1", "u1", RoundInput.parse({ ourSide: "aff" }));
    await applyServerChange(
      stateDocId,
      (doc) => {
        upsertPosition(doc, { id: "p_cp", name: "States CP", kind: "cp", side: "neg", introducedIn: "1NC", order: 0 });
        upsertArg(doc, { id: "c1", positionId: "p_cp", speech: "1NC", side: "neg", order: 1, label: "1", text: "The fifty states should each establish their own insurance program", role: "cp_text", cardIds: [], provenance: { type: "user_note", by: "u1" }, delivery: "confirmed" });
      },
      { userId: "u1", origin: "test" },
    );
    const draftId = await createDraft({ teamId: "t1", roundId, speech: "2AC", userId: "u1" });
    await applyServerChange(
      draftId,
      (doc) => {
        const card = { type: "card", attrs: { id: "k1", cardId, read: "planned" }, content: [{ type: "cardTag", content: [{ type: "text", text: "States can't coordinate" }] }, { type: "cardCite", attrs: { short: "Invented 25", full: "Invented" } }, { type: "cardBody", content: [{ type: "cardPara", content: [{ type: "text", text: "States can't coordinate across borders." }] }] }] };
        const json = { type: "doc", content: [{ type: "section", attrs: { id: "s1", kind: "response", relation: "answers", targets: ["c1"] }, content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "1. Solvency deficit" }] }, { type: "paragraph", content: [{ type: "text", text: "Fifty separate programs can't coordinate coverage for people who cross state lines, so the counterplan leaves gaps the plan closes." }] }, card] }] };
        prosemirrorJSONToYXmlFragment(draftSchema(), json, doc.getXmlFragment(DRAFT_FRAGMENT));
      },
      { userId: "u1", origin: "test" },
    );
    await deliverDraft(draftId, "u1");
    const banked = await db().select().from(analyticsBank).where(eq(analyticsBank.draftId, draftId));
    expect(banked).toHaveLength(1);
    expect(banked[0]).toMatchObject({ position: "States CP", title: "1. Solvency deficit", speech: "2AC" });
    expect(banked[0].answers).toContain("fifty states");
    expect(await db().select().from(cardUses).where(eq(cardUses.cardId, cardId))).toHaveLength(1);

    // A later round against a similar CP finds that answer; the same round doesn't count.
    const { id: later } = await createRound("t1", "u1", RoundInput.parse({ ourSide: "aff" }));
    const found = await pastAnswers("t1", later, [{ id: "x1", text: "States CP: the fifty states establish insurance programs instead" }]);
    expect(found.map((f) => f.title)).toEqual(["1. Solvency deficit"]);
    expect(await pastAnswers("t1", roundId, [{ id: "x1", text: "States CP: the fifty states establish insurance programs instead" }])).toEqual([]);

    // Re-delivering without that section removes it from the bank.
    await applyServerChange(draftId, (doc) => { const f = doc.getXmlFragment(DRAFT_FRAGMENT); f.delete(0, f.length); prosemirrorJSONToYXmlFragment(draftSchema(), { type: "doc", content: [{ type: "paragraph" }] }, f); }, { userId: "u1", origin: "test" });
    await deliverDraft(draftId, "u1");
    expect(await db().select().from(analyticsBank).where(eq(analyticsBank.draftId, draftId))).toHaveLength(0);
    expect(await db().select().from(cardUses).where(eq(cardUses.cardId, cardId))).toHaveLength(0);
  });
});
