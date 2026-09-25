import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { editor, roundWithDocs, signedIn } from "./helpers";

// Runs against a dev server started with AI_FAKE=1 (deterministic AI, no cost): E2E_FAKE=1 npx playwright test library-reuse
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

test("a draft reads a library card only where it fits what the speech must answer, with a checked new tag", async ({ browser }) => {
  test.setTimeout(180_000);
  const A = await signedIn(browser, "a");
  // A fresh team, so its library holds only what this test puts there.
  const team = await A.page.request.post("/api/teams", { data: { name: `E2E reuse ${Date.now()}` } });
  const { id: teamId } = (await team.json()) as { id: string };
  const roundId = await roundWithDocs(A.page.request, teamId, `reuse-${Date.now()}`);

  // Our blocks (synthetic) in the library: answers to their States CP and Climate DA, and an unrelated card.
  const up = await A.page.request.post("/api/library/uploads", {
    multipart: { teamId, file: { name: "synthetic-2ac-blocks.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync("tests/fixtures/synthetic-2ac-blocks.docx") } },
  });
  expect(up.ok()).toBeTruthy();

  await A.page.goto(`/rounds/${roundId}?speech=2AC`);
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("button", { name: "Build / revise" }).click();
  await A.page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
  const add = A.page.getByRole("button", { name: "Add to draft" });
  await expect(add).toBeVisible({ timeout: 60_000 });
  await expect(A.page.getByText(/Library: \d+ cards? fit what this speech must answer/)).toBeVisible();
  await expect(A.page.getByText(/New tag on Castellanos 25 for this speech/)).toBeVisible();
  await add.click();

  // The fitting card is read under the CP answer with its new tag; the unrelated card isn't read at all.
  await expect(editor(A.page)).toContainText("Castellanos 25");
  await expect(editor(A.page)).toContainText("Card says an interstate compact needs every member legislature");
  await expect(editor(A.page)).not.toContainText("Moreau 24");
  await expect(editor(A.page)).toContainText("Haldane 25");

  // Before cutting a new card, the library is checked first; a card that proves the claim is one click away.
  await A.page.getByRole("tab", { name: /Evidence/ }).click();
  await A.page.getByLabel("Search cards").fill("interstate compact takes years to ratify");
  await A.page.getByRole("button", { name: "Cut new cards from the web" }).click();
  const dialog = A.page.getByRole("dialog");
  await expect(dialog.getByText("Already in your library")).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText(/Castellanos 25 · proves it/)).toBeVisible();
  await expect(dialog.getByText("Moreau 24")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Insert at cursor" }).click();
  await expect(dialog.getByRole("button", { name: "Inserted" })).toBeVisible();
  await A.context.close();
});
