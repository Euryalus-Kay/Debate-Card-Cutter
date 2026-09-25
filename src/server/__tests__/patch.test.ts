// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { teams, user } from "@/server/db/schema";
import { createDraft, createRound, RoundInput } from "@/server/rounds";
import { applyServerChange } from "@/server/docs/store";
import { patchSpeech } from "@/server/ai/ops";
import { upsertArg, upsertPosition } from "@/shared/round-doc";
import { DRAFT_FRAGMENT, draftSchema } from "@/shared/editor/schema";
import { argBasisHash } from "@/domain/patch";
import type { ArgUnit } from "@/domain/flow";

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

// SYNTHETIC FIXTURE: we are aff; the 2AC draft answers the 1NC's Politics DA, then the partner types a States CP.
const section = (id: string, title: string, targets: string[], extra: Record<string, unknown> = {}, children: object[] = []) => ({
  type: "section",
  attrs: { id, kind: "response", relation: "answers", targets, ...extra },
  content: [{ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: title }] }, { type: "paragraph", content: [{ type: "text", text: `${title} because the evidence says so, so it matters.` }] }, ...children],
});
const arg = (id: string, positionId: string, text: string): ArgUnit => ({ id, positionId, speech: "1NC", side: "neg", order: 1, text, role: "claim", cardIds: [], provenance: { type: "user_note", by: "u1" }, delivery: "confirmed" });

async function setup() {
  await db().insert(user).values({ id: "u1", name: "Deb Ater", email: "u1@example.test" });
  await db().insert(teams).values({ id: "t1", name: "Team", createdBy: "u1" });
  const { id: roundId, stateDocId } = await createRound("t1", "u1", RoundInput.parse({ ourSide: "aff" }));
  await applyServerChange(
    stateDocId,
    (doc) => {
      upsertPosition(doc, { id: "p_da", name: "Politics DA", kind: "da", side: "neg", introducedIn: "1NC", order: 0 });
      upsertArg(doc, arg("a1", "p_da", "Plan drains political capital"));
      upsertArg(doc, arg("a2", "p_da", "Bill passes now"));
    },
    { userId: "u1", origin: "test" },
  );
  const draftId = await createDraft({ teamId: "t1", roundId, speech: "2AC", userId: "u1" });
  await applyServerChange(
    draftId,
    (doc) => {
      const json = { type: "doc", content: [section("s_pol", "Politics DA", [], { kind: "position", relation: "none" }, [section("s1", "1. No link", ["a1"], { basis: { a1: argBasisHash({ text: "Plan drains political capital" }) } }), section("s2", "2. Non-unique", ["a2"])])] };
      prosemirrorJSONToYXmlFragment(draftSchema(), json, doc.getXmlFragment(DRAFT_FRAGMENT));
    },
    { userId: "u1", origin: "test" },
  );
  return { roundId, stateDocId, draftId };
}

describe("updating a draft (patch_speech)", () => {
  it("does nothing, with no model call, when the draft answers everything", async () => {
    const { roundId, draftId } = await setup();
    const r = await patchSpeech({ roundId, speech: "2AC", draftId, instructions: "", cardIds: [], evidenceMode: "selected_only", teamId: "t1" });
    expect(r.upToDate).toBe(true);
    expect(r.run).toBeNull();
    expect(r.output.adds).toEqual([]);

    // The partner types a new position and changes an argument's words.
    const { stateDocId } = (await db().query.rounds.findFirst({ where: (t, { eq }) => eq(t.id, roundId) }))!;
    await applyServerChange(
      stateDocId,
      (doc) => {
        upsertPosition(doc, { id: "p_cp", name: "States CP", kind: "cp", side: "neg", introducedIn: "1NC", order: 1 });
        upsertArg(doc, arg("c1", "p_cp", "The fifty states should establish NHI"));
        upsertArg(doc, { ...arg("a1", "p_da", "Plan drains political capital with moderates"), humanEdited: true } as ArgUnit);
      },
      { userId: "u1", origin: "test" },
    );
    const p = await patchSpeech({ roundId, speech: "2AC", draftId, instructions: "", cardIds: [], evidenceMode: "selected_only", teamId: "t1" });
    expect(p.upToDate).toBe(false);
    expect(p.changes.unanswered.map((a) => a.id)).toEqual(["c1"]);
    expect(p.changes.stale).toEqual([{ sectionId: "s1", title: "1. No link", argIds: ["a1"] }]);
    // The fake answers each new argument once; code places it as a new States CP section at the end.
    expect(p.output.adds.map((a) => a.targets)).toEqual([["c1"]]);
    expect(p.addInfo[p.output.adds[0].ref]).toMatchObject({ positionId: "p_cp", where: "at the end, as a new States CP section" });
    expect(p.argHashes.c1).toBe(argBasisHash({ text: "The fifty states should establish NHI" }));
    expect(p.remaining).toEqual([]);
    expect(p.checks.filter((c) => c.severity === "critical")).toEqual([]);
    expect(p.estimatedSeconds).toBeGreaterThan(p.previousSeconds);
  });
});
