// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { draftSchema } from "../editor/schema";
import { cardToPM, sectionContentHash, type PMNodeJSON } from "../draft-model";
import { makeText } from "@/domain/card";

// SYNTHETIC FIXTURE: a section holding a card, as the browser editor would hold it.
const section: PMNodeJSON = {
  type: "section",
  attrs: { id: "sec_x", kind: "response" },
  content: [
    { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Perm do both" }] },
    { type: "paragraph", content: [{ type: "text", text: "The perm shields the link." }] },
    cardToPM({ cardId: "card_1", tag: "Perm solves", shortCite: "Smith 24", fullCite: "Jane Smith, 2024", body: [makeText("States and the federal government can act together.", { underline: [{ start: 0, end: 30 }], emphasis: [{ start: 11, end: 18 }], highlight: [{ start: 0, end: 6, color: "yellow" }] })], verification: "verified" }),
  ],
};

describe("section hashes agree between the browser and the server", () => {
  it("matches after the section passes through the synced document", () => {
    const schema = draftSchema();
    const clientNode = schema.nodeFromJSON({ type: "doc", content: [section] });
    const clientHash = sectionContentHash(clientNode.toJSON().content[0] as PMNodeJSON);

    const ydoc = new Y.Doc();
    const frag = ydoc.getXmlFragment("default");
    prosemirrorJSONToYXmlFragment(schema, clientNode.toJSON(), frag);
    const raw = yXmlFragmentToProsemirrorJSON(frag) as PMNodeJSON;
    // What the server does before hashing (context.ts): round-trip through the schema.
    const serverJson = schema.nodeFromJSON(raw).toJSON() as PMNodeJSON;
    expect(sectionContentHash(serverJson.content![0])).toBe(clientHash);
    // Even without the round trip, null attributes no longer cause a mismatch.
    expect(sectionContentHash(raw.content![0])).toBe(clientHash);
  });
});
