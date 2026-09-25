import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { editor, roundWithDocs, signedIn, teamOf } from "./helpers";

test("a missing opponent speech is never treated as a concession", async ({ browser }) => {
  const A = await signedIn(browser, "a");
  const teamId = await teamOf(A.page.request);
  // Aff round with only our 1AC: nothing from the 1NC is on record.
  const r = await A.page.request.post("/api/rounds", { data: { teamId, tournament: "E2E", roundLabel: `missing-${Date.now()}`, ourSide: "aff", aiPolicy: "allowed" } });
  const { id } = (await r.json()) as { id: string };
  const up = await A.page.request.post(`/api/rounds/${id}/uploads`, { multipart: { speech: "1AC", owner: "us", file: { name: "synthetic-1ac.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync("tests/fixtures/synthetic-1ac.docx") } } });
  const { upload } = (await up.json()) as { upload: { id: string } };
  await A.page.request.post(`/api/rounds/${id}/uploads/${upload.id}/flow`);
  await A.page.goto(`/rounds/${id}`);
  await expect(A.page.getByText("No opponent arguments recorded")).toBeVisible();
  await expect(A.page.getByText(/missing speeches are never treated as concessions/)).toBeVisible();
  await expect(A.page.getByText(/unanswered/i)).toHaveCount(0);
  await A.context.close();
});

test("importing a Verbatim file keeps cards and marks them as imported", async ({ browser }) => {
  const A = await signedIn(browser, "a");
  await A.page.goto("/library");
  const chooser = A.page.waitForEvent("filechooser");
  await A.page.getByRole("button", { name: "Import .docx" }).click();
  await (await chooser).setFiles("tests/fixtures/synthetic-1nc.docx");
  await expect(A.page.getByText(/cards imported/)).toBeVisible({ timeout: 30_000 });
  await A.page.getByRole("button", { name: "Imported" }).click();
  await expect(A.page.getByText("Imported").first()).toBeVisible();
  await A.context.close();
});

test("the speech exports to Word with the team's text", async ({ browser }) => {
  const A = await signedIn(browser, "a");
  const roundId = await roundWithDocs(A.page.request, await teamOf(A.page.request), `export-${Date.now()}`);
  await A.page.goto(`/rounds/${roundId}`);
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("button", { name: "Add section" }).click();
  await editor(A.page).locator("section p").first().click();
  await A.page.keyboard.type("Exported analytic: the perm solves.");
  await expect(A.page.getByText("All changes saved")).toBeVisible();
  const download = A.page.waitForEvent("download");
  await A.page.getByRole("button", { name: "Download as .docx" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.docx$/);
  const files = unzipSync(new Uint8Array(readFileSync((await file.path())!)));
  expect(strFromU8(files["word/document.xml"])).toContain("Exported analytic: the perm solves.");
  expect(strFromU8(files["word/styles.xml"])).toContain('w:styleId="Heading4"');
  await A.context.close();
});

test("a block from an evidence file goes into the speech with its cards", async ({ browser }) => {
  const A = await signedIn(browser, "a");
  const teamId = await teamOf(A.page.request);
  const up = await A.page.request.post("/api/library/uploads", {
    multipart: { teamId, file: { name: "synthetic-1nc.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync("tests/fixtures/synthetic-1nc.docx") } },
  });
  expect(up.ok()).toBeTruthy();
  const roundId = await roundWithDocs(A.page.request, teamId, `blocks-${Date.now()}`);
  await A.page.goto(`/rounds/${roundId}`);
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("tab", { name: "Evidence" }).click();
  await A.page.getByRole("tab", { name: "Files & blocks" }).click();
  await A.page.getByRole("button", { name: /synthetic-1nc/ }).first().click();
  const insert = A.page.getByRole("button", { name: /^Insert block / }).first();
  const label = (await insert.getAttribute("aria-label"))!.replace(/^Insert block /, "");
  await insert.click();
  await expect(editor(A.page).locator("section").first()).toContainText(label);
  await expect(editor(A.page).locator("[data-card]").first()).toBeVisible();
  await A.context.close();
});
