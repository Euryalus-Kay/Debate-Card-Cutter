import { expect, test } from "@playwright/test";
import { signedIn } from "./helpers";

// Uploads go straight to Vercel Blob (needs BLOB_READ_WRITE_TOKEN); the fake model labels the cards.
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

test("importing a file in the Library: upload, split, dedupe, label, and the cards are searchable", async ({ browser }) => {
  test.setTimeout(180_000);
  const A = await signedIn(browser, "a");
  await A.page.goto("/library");
  await A.page.locator('input[type="file"]').setInputFiles("tests/fixtures/synthetic-1nc.docx");
  // The import runs in the background and reports what it did.
  await expect(A.page.getByText(/\d+ new cards|already in the library/).first()).toBeVisible({ timeout: 120_000 });
  await A.page.getByPlaceholder(/Search tags/).fill("Rivera");
  await expect(A.page.getByText("States solve better – they can tailor protection to local watersheds").first()).toBeVisible({ timeout: 20_000 });
  await A.context.close();
});
