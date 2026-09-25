import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { editor, roundWithDocs, signedIn, teamOf } from "./helpers";

// A walkthrough as a debater would use Clash, with screenshots for docs/QA_REPORT.md (synthetic data,
// fake model). Run on its own: E2E_FAKE=1 WALKTHROUGH=1 npx playwright test walkthrough
test.skip(!process.env.E2E_FAKE || !process.env.WALKTHROUGH, "screenshots for the QA report (set E2E_FAKE=1 WALKTHROUGH=1)");

const shot = (page: Page, name: string) => page.screenshot({ path: `docs/qa/screens/${name}.png`, fullPage: false });

test("walkthrough", async ({ browser }) => {
  test.setTimeout(300_000);
  const A = await signedIn(browser, "a");
  const teamId = await teamOf(A.page.request);
  const roundId = await roundWithDocs(A.page.request, teamId, `Walkthrough ${new Date().toISOString().slice(0, 10)}`);
  await A.page.request.post("/api/library/uploads", { multipart: { teamId, file: { name: "synthetic-2ac-blocks.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync("tests/fixtures/synthetic-2ac-blocks.docx") } } });

  // 1. Their 1NC: what's on the flow, typed notes, and "Listen".
  await A.page.goto(`/rounds/${roundId}?speech=1NC`);
  await A.page.getByLabel("What I heard in their 1NC").fill("Theory\n1. condo bad - three conditional worlds kill aff strategy\n");
  await A.page.getByRole("button", { name: "Update flow" }).click();
  await expect(A.page.getByText(/(\d+)\/\1 on the flow/)).toBeVisible({ timeout: 30_000 });
  await shot(A.page, "01-their-1nc-notes-and-flow");

  // 2. Our 2AC: what it must answer, a draft that reads fitting library cards, with progress.
  await A.page.goto(`/rounds/${roundId}?speech=2AC`);
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("button", { name: "Build / revise" }).click();
  await A.page.getByRole("dialog").getByRole("button", { name: "Generate" }).click();
  await expect(A.page.getByRole("button", { name: "Add to draft" })).toBeVisible({ timeout: 60_000 });
  await shot(A.page, "02-2ac-proposal");
  await A.page.getByRole("button", { name: "Add to draft" }).click();
  await expect(editor(A.page).locator("section").first()).toBeVisible();
  await shot(A.page, "03-2ac-draft");

  // 3. The flow grid.
  await A.page.getByRole("tab", { name: "Flow" }).click();
  await shot(A.page, "04-flow");
  await A.page.getByRole("tab", { name: "2AC" }).first().click();

  // 4. Cross-ex help.
  await A.page.getByRole("tab", { name: "CX" }).click();
  const box = A.page.getByLabel("Notes: CX of the 1NC").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await box.getByRole("button", { name: "Suggest questions" }).click();
  await expect(box.getByText(/\[AI_FAKE\]/).first()).toBeVisible({ timeout: 30_000 });
  await shot(A.page, "05-cx-help");

  // 5. Library: cards, files, and building a file.
  await A.page.goto("/library");
  await shot(A.page, "06-library");
  await A.page.goto("/library/build");
  await A.page.getByLabel("The argument").fill("Deficits: the program's new spending raises interest rates and crowds out investment");
  await A.page.getByRole("button", { name: "Plan the file" }).click();
  await expect(A.page.getByRole("button", { name: "Build it" })).toBeVisible({ timeout: 60_000 });
  await shot(A.page, "07-file-plan-review");

  // 6. Research (card maker) and settings (spend and budget).
  await A.page.goto("/research");
  await shot(A.page, "08-card-maker");
  await A.page.goto("/settings");
  await shot(A.page, "09-settings-spend");
  await A.context.close();
});
