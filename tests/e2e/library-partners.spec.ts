import { expect, test } from "@playwright/test";
import { signedIn } from "./helpers";

// Uploads go straight to Vercel Blob (needs BLOB_READ_WRITE_TOKEN); the fake model labels the cards and reviews.
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

test("partners share the library: one imports, the other sees the labels and analytics, and both see one gaps review", async ({ browser }) => {
  test.setTimeout(240_000);
  const A = await signedIn(browser, "a");
  const B = await signedIn(browser, "b");

  // A imports a (synthetic) 2NC block: a card and two numbered analytics under "AT: Tolls are popular".
  await A.page.goto("/library");
  await A.page.locator('input[type="file"]').setInputFiles("tests/fixtures/synthetic-2nc-tolls.docx");
  await expect(A.page.getByText(/\d+ new cards|already in the library/).first()).toBeVisible({ timeout: 120_000 });

  // B sees the card with its library label (what it proves), without reloading anything A did.
  await B.page.goto("/library");
  await B.page.getByPlaceholder(/Search tags/).fill("Okonkwo");
  await expect(B.page.getByText("Tolls lose support once drivers see the cost").first()).toBeVisible({ timeout: 20_000 });
  await expect(B.page.getByText(/proves:/).first()).toBeVisible();

  // …and the block's analytics, saved for drafts, marked neg and 2NC, with the file they came from.
  await B.page.getByRole("tab", { name: "Analytics" }).click();
  await B.page.getByLabel("Search analytics").fill("tolls");
  await expect(B.page.getByText("AT: Tolls are popular").first()).toBeVisible({ timeout: 20_000 });
  await expect(B.page.getByText(/from synthetic-2nc-tolls\.docx/).first()).toBeVisible();

  // B reviews the library; A sees the same review.
  await B.page.getByRole("tab", { name: "Gaps & ideas" }).click();
  await B.page.getByRole("button", { name: /Review (my library|again)/ }).click();
  await expect(B.page.getByText(/\[AI_FAKE\] \d+ cards and \d+ analytics blocks reviewed/).first()).toBeVisible({ timeout: 60_000 });
  await A.page.goto("/library?tab=gaps");
  await expect(A.page.getByText(/\[AI_FAKE\] \d+ cards and \d+ analytics blocks reviewed/).first()).toBeVisible({ timeout: 20_000 });
  await expect(A.page.getByRole("link", { name: /Find this card/ }).first()).toBeVisible();

  await A.context.close();
  await B.context.close();
});
