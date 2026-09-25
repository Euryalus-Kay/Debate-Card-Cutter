import { expect, test } from "@playwright/test";
import { editor, roundWithDocs, signedIn, teamOf } from "./helpers";

// Uses the real model (costs API credits, ~1–2 minutes). Run with E2E_AI=1.
test.skip(!process.env.E2E_AI, "AI scenarios run only with E2E_AI=1");

test("AI drafts the 2AC from the flow; it applies as editable sections and fits the time limit", async ({ browser }) => {
  test.setTimeout(300_000);
  const A = await signedIn(browser, "a");
  const roundId = await roundWithDocs(A.page.request, await teamOf(A.page.request), `ai-${Date.now()}`);
  await A.page.goto(`/rounds/${roundId}`);
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("button", { name: "Build / revise" }).click();
  await A.page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();

  // The proposal streams into the AI tab; nothing touches the draft until it's applied.
  const addToDraft = A.page.getByRole("button", { name: "Add to draft" });
  await expect(addToDraft).toBeVisible({ timeout: 180_000 });
  await expect(editor(A.page).locator("section")).toHaveCount(0);
  const adjusted = A.page.getByText(/^(Trimmed|Filled out) from \d+:\d+ to \d+:\d+/);
  if (await adjusted.count()) console.log(`length fix: ${await adjusted.first().innerText()}`);
  await addToDraft.click();
  await expect(editor(A.page).locator("section").first()).toBeVisible();
  const sections = await editor(A.page).locator("section").count();
  expect(sections).toBeGreaterThan(2);

  // Every generated section answers something on the flow, and the estimate is shown against the limit.
  // Drafts are trimmed or filled to time before they are shown, so the applied draft fits.
  const footer = await A.page.getByText(/^~\d+:\d+ of 8:00$/).first().innerText();
  const [m, s] = footer.match(/~(\d+):(\d+)/)!.slice(1).map(Number);
  const seconds = m * 60 + s;
  console.log(`2AC estimate: ${footer}`);
  expect(seconds).toBeLessThanOrEqual(8 * 60 + 5);

  // If a draft still came in short (the automatic fill is best effort), "Fill to time" is offered:
  // the plan expands sections, and after applying it the speech uses most of the 8 minutes.
  if (seconds < 8 * 60 * 0.9) {
    await A.page.getByRole("button", { name: "Fill to time" }).click();
    const apply = A.page.getByRole("button", { name: "Apply all" });
    await expect(apply).toBeVisible({ timeout: 120_000 });
    await apply.click();
    await expect(A.page.getByText(/^~\d+:\d+ of 8:00$/).first()).not.toHaveText(footer, { timeout: 20_000 });
    const after = await A.page.getByText(/^~\d+:\d+ of 8:00$/).first().innerText();
    const [m2, s2] = after.match(/~(\d+):(\d+)/)!.slice(1).map(Number);
    console.log(`after fill: ${after}`);
    expect(m2 * 60 + s2).toBeGreaterThanOrEqual(7 * 60);
    expect(m2 * 60 + s2).toBeLessThanOrEqual(8 * 60 + 15);
  }
  await A.context.close();
});
