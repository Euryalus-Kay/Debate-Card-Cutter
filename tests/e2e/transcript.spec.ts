import { expect, test } from "@playwright/test";
import { roundWithDocs, signedIn, teamOf } from "./helpers";

// Runs against a dev server started with AI_FAKE=1 (deterministic AI, no cost): E2E_FAKE=1 npx playwright test transcript
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

// SYNTHETIC captions (invented speech), in the WebVTT format Zoom and Otter export.
const VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
<v Speaker 2>Next off, the states counterplan.

2
00:00:04.000 --> 00:00:09.500
<v Speaker 2>The fifty states should each establish their own insurance program.

3
00:00:09.500 --> 00:00:14.000
<v Speaker 2>It solves the whole aff because states run Medicaid already.
`;

test("a pasted or uploaded transcript of their speech goes onto the flow like typed notes", async ({ browser }) => {
  test.setTimeout(120_000);
  const A = await signedIn(browser, "a");
  const roundId = await roundWithDocs(A.page.request, await teamOf(A.page.request), `transcript-${Date.now()}`);
  await A.page.goto(`/rounds/${roundId}?speech=1NC`);

  // Paste captions: cue numbers, times and voice tags are dropped; sentences become pad lines.
  await A.page.getByRole("button", { name: "Listen" }).click();
  await A.page.getByRole("menuitem", { name: /Upload or paste/ }).click();
  await A.page.getByPlaceholder(/Paste a transcript/).fill(VTT);
  await A.page.getByRole("button", { name: "Add pasted text" }).click();
  await expect(A.page.getByText("Transcript", { exact: true })).toBeVisible();
  await expect(A.page.getByText("The fifty states should each establish their own insurance program.").first()).toBeVisible();
  await expect(A.page.getByText("00:00:04.000")).toHaveCount(0);

  // Upload a plain-text transcript file too; its lines follow the pasted ones.
  await A.page.getByRole("button", { name: "Listen" }).click();
  await A.page.getByRole("menuitem", { name: /Upload or paste/ }).click();
  await A.page.getByLabel("Choose a recording or transcript file").setInputFiles({ name: "their-1nc.txt", mimeType: "text/plain", buffer: Buffer.from("Case turn: a public program crowds out private insurers.\n") });
  await expect(A.page.getByText("crowds out private insurers").first()).toBeVisible();

  // Onto the flow, every line accounted for.
  await A.page.getByRole("button", { name: "Update flow" }).click();
  await expect(A.page.getByText(/(\d+)\/\1 on the flow/)).toBeVisible({ timeout: 30_000 });
  await A.context.close();
});
