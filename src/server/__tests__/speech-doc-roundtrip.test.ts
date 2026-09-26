/**
 * A speech exported to Word is flowed by the other team (synthetic draft): every top-level section is one
 * position, even when the model marked it as answering something (a 1NC's T "answers" the plan), and each
 * answer keeps its reasoning, so the other side's AI sees what to answer.
 */
import { describe, expect, it } from "vitest";
import { draftToExportNodes } from "@/server/drafts";
import { buildDocx } from "@/server/export/docx-writer";
import { parseDocx } from "@/server/ingest/docx";
import { structureDocument, type ImportedAnalytic } from "@/server/ingest/structure";
import { draftFromPM, type PMNodeJSON } from "@/shared/draft-model";

const heading = (text: string) => ({ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text }] });
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const section = (id: string, kind: string, relation: string, title: string, children: object[]) => ({ type: "section", attrs: { id, kind, relation, targets: relation === "answers" ? ["a1"] : [] }, content: [heading(title), ...children] });

describe("speech doc round trip", () => {
  it("top-level sections become positions; answers keep their reasoning", () => {
    const pm = {
      type: "doc",
      content: [
        section("s0", "overview", "none", "Roadmap", [para("Three off: topicality, the invented DA, and the invented CP.")]),
        section("s1", "response", "answers", "T---Invented Interpretation", [section("s1a", "response", "answers", "Violation and standards", [para("They violate because the invented plan is only one payer, which explodes the limits of the topic.")])]),
        section("s2", "position", "new", "Invented DA", [section("s2a", "response", "new", "Link", [para("The plan spends political capital because invented votes are scarce this fall.")])]),
      ],
    } as unknown as PMNodeJSON;
    const bytes = buildDocx(draftToExportNodes(draftFromPM(pm), { title: "1NC" }));
    const s = structureDocument(parseDocx(bytes).paragraphs);
    const headings = s.items.filter((i) => i.kind === "heading" && i.level === 3).map((i) => (i as { text: string }).text);
    expect(headings).toEqual(["Roadmap", "T---Invented Interpretation", "Invented DA"]);
    const analytics = s.items.filter((i): i is ImportedAnalytic => i.kind === "analytic");
    const violation = analytics.find((a) => a.text === "Violation and standards")!;
    expect(violation.path.filter(Boolean)).toContain("T---Invented Interpretation");
    expect(violation.detail.join(" ")).toContain("explodes the limits");
  });
});
