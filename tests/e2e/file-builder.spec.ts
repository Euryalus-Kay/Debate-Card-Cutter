import { expect, test } from "@playwright/test";
import { signedIn } from "./helpers";

// Runs against a dev server started with AI_FAKE=1 (deterministic AI, no cost): E2E_FAKE=1 npx playwright test file-builder
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

test("build a file: plan, review, approve, and it lands in Files with a Word copy", async ({ browser }) => {
  test.setTimeout(240_000);
  const A = await signedIn(browser, "a");
  await A.page.goto("/library");
  await A.page.getByRole("link", { name: "Build a file" }).click();
  await A.page.getByLabel("Kind of file").selectOption("da");
  await A.page.getByLabel("The argument").fill(`Capital flight ${Date.now()}: the taxes that fund national health insurance push investment offshore`);
  await A.page.getByRole("button", { name: "Plan the file" }).click();

  // The plan comes back for review: sections, card claims with checkboxes, analytics, and a cost.
  await expect(A.page.getByRole("button", { name: "Build it" })).toBeVisible({ timeout: 60_000 });
  await expect(A.page.getByText(/cards? to find: at most about \$/)).toBeVisible();
  await expect(A.page.getByText("analytic").first()).toBeVisible();
  await A.page.getByRole("button", { name: "Build it" }).click();

  // Built: a summary, a Word copy, and the file in the library's Files.
  await expect(A.page.getByRole("link", { name: "Word file" })).toBeVisible({ timeout: 180_000 });
  const href = await A.page.getByRole("link", { name: "Word file" }).getAttribute("href");
  const docx = await A.page.request.get(href!);
  expect(docx.status()).toBe(200);
  const bytes = await docx.body();
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  await A.page.getByRole("link", { name: "In Files" }).click();
  await expect(A.page.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
  await expect(A.page.getByText("built").first()).toBeVisible();
  await A.context.close();
});
