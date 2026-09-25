// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { teams, user } from "@/server/db/schema";
import { createDraft, createRound, RoundInput } from "@/server/rounds";
import { applyServerChange } from "@/server/docs/store";
import { editSpan } from "@/server/ai/ops";
import { DRAFT_FRAGMENT, draftSchema } from "@/shared/editor/schema";

let close: () => Promise<void>;
const prevFake = process.env.AI_FAKE;
beforeAll(async () => {
  process.env.AI_FAKE = "1";
  ({ close } = await freshDb());
});
afterAll(async () => {
  process.env.AI_FAKE = prevFake;
  await close();
});

// SYNTHETIC FIXTURE: a 1AR section with an analytic and a card.
async function setup() {
  await db().insert(user).values({ id: "u1", name: "Deb Ater", email: "u1@example.test" });
  await db().insert(teams).values({ id: "t1", name: "Team", createdBy: "u1" });
  const { id: roundId } = await createRound("t1", "u1", RoundInput.parse({ ourSide: "aff" }));
  const draftId = await createDraft({ teamId: "t1", roundId, speech: "1AR", userId: "u1" });
  await applyServerChange(
    draftId,
    (doc) => {
      const json = {
        type: "doc",
        content: [
          {
            type: "section",
            attrs: { id: "s1", kind: "response", relation: "answers", targets: [] },
            content: [
              { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "1. No link" }] },
              { type: "paragraph", content: [{ type: "text", text: "The plan is regulation, not spending, so it never touches the budget." }] },
              { type: "card", attrs: { id: "cin_1" }, content: [{ type: "cardTag", content: [{ type: "text", text: "Regulation costs nothing" }] }, { type: "cardCite", attrs: { short: "Lee 26", full: "Lee 26" } }, { type: "cardBody", content: [{ type: "cardPara", content: [{ type: "text", text: "Rules are enforced by existing staff." }] }] }] },
            ],
          },
        ],
      };
      prosemirrorJSONToYXmlFragment(draftSchema(), json, doc.getXmlFragment(DRAFT_FRAGMENT));
    },
    { userId: "u1", origin: "test" },
  );
  return { roundId, draftId };
}

describe("editing selected words (edit_span)", () => {
  it("rewrites the debater's own words, refuses card text, and answers comments", async () => {
    const { roundId, draftId } = await setup();
    const base = { roundId, speech: "1AR" as const, draftId, sectionId: "s1", before: "", after: "", instructions: "", teamId: "t1" };
    const r = await editSpan({ ...base, text: "not spending, so it never touches the budget", action: "shorten" });
    expect(r.kind).toBe("span_edit");
    expect(r.base).toBe("not spending, so it never touches the budget");
    await expect(editSpan({ ...base, text: "enforced by existing staff", action: "sharpen" })).rejects.toThrow(/card text/);
    await expect(editSpan({ ...base, text: "words that were never in the draft", action: "sharpen" })).rejects.toThrow(/aren't in the draft/);
    const c = await editSpan({ ...base, text: "The plan is regulation", action: "comment", thread: [{ by: "Deb", text: "Is this enough? @AI" }] });
    expect(c.kind).toBe("comment_reply");
    if (c.kind !== "comment_reply") throw new Error("expected a comment reply");
    expect(c.reply).toContain("warrant");
    expect(c.replacement).toContain("The plan is regulation");
  });
});
