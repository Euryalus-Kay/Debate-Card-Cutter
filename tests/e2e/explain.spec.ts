import { expect, test } from "@playwright/test";
import { signedIn } from "./helpers";

// The fake model explains; uploads go straight to Vercel Blob (needs BLOB_READ_WRITE_TOKEN).
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

test("any library card can be explained in simple words, from the list or the card page", async ({ browser }) => {
  test.setTimeout(180_000);
  const A = await signedIn(browser, "a");
  await A.page.goto("/library");
  await A.page.locator('input[type="file"]').setInputFiles("tests/fixtures/synthetic-2nc-tolls.docx");
  await expect(A.page.getByText(/\d+ new cards|already in the library/).first()).toBeVisible({ timeout: 120_000 });
  await A.page.getByPlaceholder(/Search tags/).fill("Okonkwo");
  await expect(A.page.getByText("Tolls lose support once drivers see the cost").first()).toBeVisible({ timeout: 20_000 });
  await A.page.getByRole("listitem").filter({ hasText: "Tolls lose support once drivers see the cost" }).first().getByRole("button", { name: /Explain: card/ }).click();
  // (Page-level text: the dev server's own overlay also has a dialog role.)
  await expect(A.page.getByRole("heading", { name: "In simple words" })).toBeVisible();
  await expect(A.page.getByText(/\[AI_FAKE\] Tolls lose support/)).toBeVisible({ timeout: 20_000 });
  await expect(A.page.getByText(/not evidence to read/)).toBeVisible();
  await A.page.keyboard.press("Escape");
  // The card page explains it too.
  await A.page.getByText("Tolls lose support once drivers see the cost").first().click();
  await A.page.getByRole("button", { name: "Explain in simple words" }).click();
  await expect(A.page.getByText(/How to use it|How to answer it/)).toBeVisible({ timeout: 20_000 });
  await A.context.close();
});
