import { expect, test } from "@playwright/test";
import { editor, roundWithDocs, signedIn, teamOf } from "./helpers";

// FMT-2: setting the 1AR speaker to the 2A changes labels and the speaking-rate profile used for the 1AR estimate.
test("the 1AR is timed at its assigned speaker's pace", async ({ browser }) => {
  const A = await signedIn(browser, "a");
  const B = await signedIn(browser, "b");
  const teamId = await teamOf(A.page.request);
  // The partner speaks at a measured conversational pace; the owner has no calibration (default pace).
  const conversational = { preset: "conversational", rates: { cardWpm: 160, tagWpm: 150, analyticWpm: 145, perCardSeconds: 2.5, perTransitionSeconds: 1.5 }, observations: [{ kind: "analytic", words: 145, seconds: 60, at: new Date().toISOString() }], uncertainty: 0.1 };
  expect((await B.page.request.put("/api/me/settings", { data: { rateProfile: conversational } })).ok()).toBeTruthy();
  const members = (await (await A.page.request.get(`/api/teams/${teamId}/members`)).json()) as { members: { userId: string; name: string }[] };
  const a = members.members.find((m) => m.name.includes("A"))!;
  const b = members.members.find((m) => m.name.includes("B"))!;

  const roundId = await roundWithDocs(A.page.request, teamId, `speakers-${Date.now()}`);
  await A.page.request.patch(`/api/rounds/${roundId}`, { data: { roster: { "1A": a.userId, "2A": b.userId }, speakerOverrides: {} } });

  // Write a 1AR draft so there is something to time.
  await A.page.goto(`/rounds/${roundId}`);
  await A.page.getByRole("tab", { name: "1AR", exact: true }).first().click();
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("button", { name: "Add section" }).click();
  await editor(A.page).locator("section p").first().click();
  await A.page.keyboard.type("Extend the perm. ".repeat(40));
  const footer = A.page.getByText(/^~\d+:\d+ of 5:00$/).first();
  await expect(A.page.getByText(new RegExp(`${a.name}`)).first()).toBeVisible();
  const before = await footer.innerText();

  // Reassign the 1AR to the 2A (the partner): label and estimate follow.
  await A.page.request.patch(`/api/rounds/${roundId}`, { data: { speakerOverrides: { "1AR": b.userId } } });
  await A.page.reload();
  await expect(A.page.getByText(`${b.name}'s pace`).first()).toBeVisible({ timeout: 30_000 });
  const after = await A.page.getByText(/^~\d+:\d+ of 5:00$/).first().innerText();
  const secs = (t: string) => t.match(/~(\d+):(\d+)/)!.slice(1).map(Number).reduce((m, s) => m * 60 + s);
  expect(secs(after)).toBeGreaterThan(secs(before)); // slower speaker, same words → longer
  await A.context.close();
  await B.context.close();
});
