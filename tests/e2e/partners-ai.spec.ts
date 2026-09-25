import { expect, test, type Page } from "@playwright/test";
import { editor, roundWithDocs, signedIn, teamOf } from "./helpers";

// Runs against a dev server started with AI_FAKE=1 (deterministic AI, no cost): E2E_FAKE=1 npx playwright test partners-ai
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

/** Select words in the open draft (through the dev-only editor handle). */
async function selectWords(page: Page, words: string) {
  await page.evaluate((w) => {
    const eds = (window as unknown as { __clashEditors: Map<string, { isDestroyed: boolean; state: { doc: { descendants: (f: (n: { isText: boolean; text?: string }, pos: number) => boolean) => void } }; commands: { focus: () => void; setTextSelection: (r: { from: number; to: number }) => void } }> }).__clashEditors;
    const ed = [...eds.values()].find((e) => !e.isDestroyed)!;
    let hit: { from: number; to: number } | null = null;
    ed.state.doc.descendants((n, pos) => {
      if (hit || !n.isText) return !hit;
      const i = n.text!.indexOf(w);
      if (i >= 0) hit = { from: pos + i, to: pos + i + w.length };
      return !hit;
    });
    if (!hit) throw new Error(`"${w}" not in the draft`);
    ed.commands.focus();
    ed.commands.setTextSelection(hit);
  }, words);
}

test("partners use AI on one speech at the same time: activity, updates, selection edits, and @AI comments all reach both", async ({ browser }) => {
  test.setTimeout(240_000);
  const A = await signedIn(browser, "a");
  const B = await signedIn(browser, "b");
  const roundId = await roundWithDocs(A.page.request, await teamOf(A.page.request), `partners-ai-${Date.now()}`);

  // A starts the 2AC by hand.
  await A.page.goto(`/rounds/${roundId}`);
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("button", { name: "Add section" }).click();
  await A.page.keyboard.type("1. Perm do both");
  await A.page.keyboard.press("Enter");
  await A.page.keyboard.type("Perm do both: the plan plus all fifty states, so the CP adds nothing.");
  await expect(A.page.getByText("All changes saved")).toBeVisible({ timeout: 30_000 });

  await B.page.goto(`/rounds/${roundId}`);
  const edA = editor(A.page);
  const edB = editor(B.page);
  await expect(edB).toContainText("the plan plus all fifty states", { timeout: 30_000 });

  // A asks the AI to answer everything left; B sees A's AI at work and then the proposal itself.
  await B.page.getByRole("tab", { name: "AI", exact: true }).click();
  await A.page.getByRole("button", { name: /Answer the \d+ remaining/ }).click();
  await expect(A.page.getByText("Update: 2AC").first()).toBeVisible({ timeout: 60_000 });
  await expect(B.page.getByText(/Test's AI/).first()).toBeVisible({ timeout: 30_000 });
  await expect(B.page.getByText("Update: 2AC").first()).toBeVisible({ timeout: 30_000 });

  // B applies it; the new answers reach A, and A's copy of the proposal shows it was applied.
  const sectionsBefore = await edA.locator("section").count();
  await B.page.getByRole("button", { name: /^Apply (all|\d+ selected)$/ }).first().click();
  await expect.poll(async () => edA.locator("section").count(), { timeout: 30_000 }).toBeGreaterThan(sectionsBefore);
  await expect(A.page.getByText("applied").first()).toBeVisible({ timeout: 30_000 });

  // B sharpens a few words; only those words change, for both.
  await selectWords(B.page, "so the CP adds nothing");
  await B.page.getByRole("button", { name: "Ask AI" }).click();
  await B.page.getByRole("button", { name: /^Sharpen/ }).click();
  await B.page.getByRole("button", { name: "Accept" }).click();
  await expect(edA).toContainText("so the CP adds nothing [AI_FAKE sharpen]", { timeout: 30_000 });
  await expect(edA).toContainText("Perm do both: the plan plus all fifty states,");

  // A comments with @AI; the AI's reply and suggested words reach B, who accepts them.
  await selectWords(A.page, "the plan plus all fifty states");
  await A.page.getByRole("button", { name: "Comment" }).click();
  await A.page.getByPlaceholder(/Comment for your partner/).fill("Is this explained enough? @AI");
  await A.page.getByPlaceholder(/Comment for your partner/).press("Enter");
  await B.page.getByRole("tab", { name: /Comments/ }).click();
  await expect(B.page.getByText("Is this explained enough? @AI")).toBeVisible({ timeout: 30_000 });
  await expect(B.page.getByText(/This answer needs its warrant/)).toBeVisible({ timeout: 30_000 });
  await B.page.getByRole("button", { name: "Accept" }).click();
  await expect(edA).toContainText("the plan plus all fifty states because their evidence is about the status quo", { timeout: 30_000 });
  await expect(B.page.getByText(/Accepted by/)).toBeVisible();

  // Both copies of the document end identical (the document itself, not each person's on-screen chrome).
  const docOf = (page: Page) =>
    page.evaluate(() => {
      const eds = (window as unknown as { __clashEditors: Map<string, { isDestroyed: boolean; getJSON: () => unknown }> }).__clashEditors;
      return JSON.stringify([...eds.values()].find((e) => !e.isDestroyed)!.getJSON());
    });
  await expect.poll(async () => (await docOf(A.page)) === (await docOf(B.page)), { timeout: 30_000 }).toBe(true);
  await A.context.close();
  await B.context.close();
});
