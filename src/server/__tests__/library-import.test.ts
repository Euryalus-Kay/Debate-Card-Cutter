// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { cards, jobs, teams, user } from "@/server/db/schema";

// Files "in Blob" for the job to read: pathname → bytes.
const store = new Map<string, Uint8Array>();
vi.mock("@vercel/blob", () => ({
  get: async (pathname: string) => {
    const bytes = store.get(pathname);
    return bytes ? { statusCode: 200, stream: new Response(bytes as BodyInit).body } : null;
  },
  put: async () => ({ pathname: "x" }),
}));

const { createImportJob, runImportJob } = await import("@/server/library/import-job");
const { buildDocx } = await import("@/server/export/docx-writer");
const { makeText } = await import("@/domain/card");

let close: () => Promise<void>;
const prevFake = process.env.AI_FAKE;
beforeAll(async () => {
  process.env.AI_FAKE = "1";
  ({ close } = await freshDb());
  await db().insert(user).values({ id: "u1", name: "Deb Ater", email: "u1@example.test" });
  await db().insert(teams).values({ id: "t1", name: "Team", createdBy: "u1" });
});
afterAll(async () => {
  process.env.AI_FAKE = prevFake;
  await close();
});

async function importFile(pathname: string, bytes: Uint8Array, fileName: string) {
  store.set(pathname, bytes);
  const id = await createImportJob("t1", "u1", { pathname, fileName, size: bytes.byteLength, labels: [], label: true });
  for (let i = 0; i < 5; i++) {
    await runImportJob(id);
    const [j] = await db().select().from(jobs).where(eq(jobs.id, id));
    if (!["queued", "running"].includes(j.status)) return j;
  }
  throw new Error("import never finished");
}

describe("importing files into the library", () => {
  it("a Verbatim file becomes labeled cards; importing it again adds nothing", async () => {
    const bytes = new Uint8Array(readFileSync("tests/fixtures/synthetic-1nc.docx"));
    const j = await importFile("teams/t1/incoming/a.docx", bytes, "synthetic-1nc.docx");
    expect(j.status).toBe("succeeded");
    expect(j.result).toMatchObject({ created: 5, duplicates: 0, variants: 0 });
    const rows = await db().select().from(cards).where(eq(cards.teamId, "t1"));
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.verificationStatus === "imported" && r.metaText.length > 0)).toBe(true);
    const again = await importFile("teams/t1/incoming/b.docx", bytes, "synthetic-1nc copy.docx");
    expect(again.result).toMatchObject({ created: 0, duplicates: 5 });
  });

  it("a plain text file with no styles is split into cards from its own words", async () => {
    const text = [
      "STATES CP ANSWERS (SYNTHETIC)",
      "Perm do both — the plan and the states together close every gap",
      "Rivera 24, synthetic source for tests, 2024, 'Floors'",
      "In this invented passage, federal floors and state programs work together, because states can go further while the floor stops a race to the bottom, which no single state can prevent alone.",
      "Solvency deficit — states can't regulate across borders",
      "Okafor 23, synthetic source for tests, 2023, 'Borders'",
      "This made-up text says upstream states have no reason to protect downstream water, so only a national rule reaches pollution that crosses state lines, which is where most of the harm starts.",
    ].join("\n\n");
    const j = await importFile("teams/t1/incoming/c.txt", new TextEncoder().encode(text.repeat(3)), "answers.txt");
    expect(j.status).toBe("succeeded");
    expect((j.result as { created: number }).created).toBeGreaterThanOrEqual(2);
    const made = await db().select().from(cards).where(eq(cards.shortCite, "Rivera 24"));
    // Card text is exactly the file's words.
    expect(made.some((c) => c.plainText.startsWith("In this invented passage"))).toBe(true);
  });

  it("the same evidence under another tag is kept as a variant of the card the library has", async () => {
    const body = [makeText("A made-up passage for tests: when budgets are tight, agencies cut enforcement staff first, so new mandates go unenforced for years.", { underline: [{ start: 0, end: 40 }], highlight: [{ start: 0, end: 40, color: "yellow" }] })];
    const file = (tag: string) => buildDocx([{ kind: "heading", level: 1, text: "SYNTHETIC" }, { kind: "card", tag, shortCite: "Lindqvist 25", fullCite: "Lindqvist 25 (synthetic test source)", body }]);
    const first = await importFile("teams/t1/incoming/v1.docx", file("Budget cuts gut enforcement"), "v1.docx");
    expect(first.result).toMatchObject({ created: 1, variants: 0 });
    const second = await importFile("teams/t1/incoming/v2.docx", file("New mandates go unenforced"), "v2.docx");
    expect(second.result).toMatchObject({ created: 1, variants: 1 });
    const rows = await db().select().from(cards).where(eq(cards.shortCite, "Lindqvist 25"));
    const original = rows.find((r) => r.tag === "Budget cuts gut enforcement")!;
    expect(rows.find((r) => r.tag === "New mandates go unenforced")!.variantOf).toBe(original.id);
  });
});
