/**
 * A card is read once per speech (synthetic round): a second reading in the same draft is removed and
 * reported, so the speech cross-applies the first instead.
 */
import { describe, expect, it } from "vitest";
import { validateDraft } from "@/server/ai/ops";
import type { RoundContext } from "@/server/ai/context";
import { makeText } from "@/domain/card";
import { presetProfile } from "@/domain/timing";

const card = { id: "card_1", tag: "Invented tag", shortCite: "Smith 24", citation: { authors: [{ name: "Ann Smith" }], date: { year: 2024 }, provenance: {} }, body: [makeText("Invented card text that a debater would read aloud in a speech about invented things.", { underline: [{ start: 0, end: 40 }] })], verificationStatus: "verified" };
const arg = (id: string, text: string) => ({ id, positionId: "p1", speech: "1NC", side: "neg", order: 1, text, role: "claim", cardIds: [], provenance: { type: "user_note", by: "u" }, delivery: "confirmed" });
const ctx = {
  graph: { ourSide: "aff", positions: [{ id: "p1", name: "Invented DA", kind: "da", side: "neg", introducedIn: "1NC", order: 0 }], args: [arg("a1", "Plan causes the invented harm"), arg("a2", "The invented harm is coming now")], relations: [], decisions: [] },
  cards: [card],
  draft: null,
  recorded: new Set(["1AC", "1NC"]),
  confirmed: new Set(["1AC", "1NC"]),
  limitSeconds: 480,
  rates: presetProfile("fast"),
  judgeLay: false,
  newArgumentPolicy: "standard",
  libraryCardIds: [],
  libraryFor: {},
} as unknown as RoundContext;
const section = (ref: string, targets: string[], cardIds: string[]) => ({ ref, parentRef: "", kind: "response", title: `${ref} answer`, relation: "answers", targets, crossApplyFrom: "", role: "no_link", analytic: "The plan avoids it because the invented mechanism never triggers, so there's no risk.", cardIds, needsEvidence: "", budgetSeconds: 20, priority: "must" });

describe("read each card once per speech", () => {
  it("removes a second reading of the same card and says so", () => {
    const out = { strategy: { summary: "", choices: [], risks: [] }, outline: [], sections: [section("s1", ["a1"], ["card_1"]), section("s2", ["a2"], ["card_1"])], cardTags: [], omitted: [], questions: [] };
    const r = validateDraft(out as never, ctx, "2AC", "aff", presetProfile("fast"));
    expect(r.output.sections.map((s) => s.cardIds)).toEqual([["card_1"], []]);
    expect(r.validation.repeatedCards).toEqual(["Smith 24"]);
  });
});

describe("text a model cut off", () => {
  it("ends at the last whole sentence, or is refused", async () => {
    const { wholeSentences } = await import("@/server/ai/ops");
    expect(wholeSentences("The link is clear. The plan costs trillions, so the")).toBe("The link is clear.");
    expect(wholeSentences("A complete answer.")).toBe("A complete answer.");
    expect(wholeSentences("Short. And then most of the text trails off without any end at all here and here")).toBe("");
  });
});
