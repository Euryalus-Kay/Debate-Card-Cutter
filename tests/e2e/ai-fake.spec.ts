import { expect, test } from "@playwright/test";
import { editor, roundWithDocs, signedIn, teamOf } from "./helpers";

// Runs against a dev server started with AI_FAKE=1 (deterministic AI, no cost): E2E_FAKE=1 npx playwright test ai-fake
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

test("draft → apply → revise a section → fill to time, with progress shown and nothing applied until asked", async ({ browser }) => {
  test.setTimeout(180_000);
  const A = await signedIn(browser, "a");
  const roundId = await roundWithDocs(A.page.request, await teamOf(A.page.request), `ai-fake-${Date.now()}`);
  await A.page.goto(`/rounds/${roundId}`);
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("button", { name: "Build / revise" }).click();
  await A.page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();

  // The proposal arrives in the AI tab; the draft stays empty until it's added.
  const add = A.page.getByRole("button", { name: "Add to draft" });
  await expect(add).toBeVisible({ timeout: 60_000 });
  await expect(editor(A.page).locator("section")).toHaveCount(0);
  await add.click();
  await expect(editor(A.page).locator("section").first()).toBeVisible();
  await expect(editor(A.page)).toContainText("[AI_FAKE] They say");

  // A second "Build / revise" on a draft with content defaults to updating it (nothing new: says so).
  await A.page.getByRole("button", { name: "Build / revise" }).click();
  await expect(A.page.getByRole("dialog").getByText("Update this draft")).toBeVisible();
  await expect(A.page.getByRole("dialog").getByText(/already answers everything/)).toBeVisible();
  await A.page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

  // Revise one section through its ✦ menu; only that section changes.
  const firstAnswer = editor(A.page).locator("section section").first();
  await firstAnswer.hover();
  await firstAnswer.getByRole("button", { name: "AI actions for this section" }).click();
  await A.page.getByRole("menuitem", { name: "Make the explanation clearer" }).click();
  await A.page.getByRole("button", { name: "Apply to section" }).click();
  await expect(editor(A.page)).toContainText("[AI_FAKE clarify]");
  await expect(editor(A.page).getByText("[AI_FAKE clarify]")).toHaveCount(1);

  // The fake draft is short, so "Fill to time" is offered; applying expands the sections.
  await A.page.getByRole("button", { name: "Fill to time" }).click();
  await A.page.getByRole("button", { name: "Apply all" }).click();
  await expect(editor(A.page)).toContainText("And that matters because it decides the round", { timeout: 30_000 });
  await A.context.close();
});
