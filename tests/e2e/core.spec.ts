import { expect, test } from "@playwright/test";
import { editor, roundWithDocs, signedIn, teamOf } from "./helpers";

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/rounds");
  await expect(page).toHaveURL(/\/login\?next=%2Frounds/);
  await expect(page.getByRole("heading", { name: "Sign in to Clash" })).toBeVisible();
});

test("a new round can be created from the Rounds page", async ({ browser }) => {
  const { page, context } = await signedIn(browser, "a");
  await page.goto("/rounds");
  await page.getByRole("button", { name: "New round" }).click();
  await page.getByRole("button", { name: "Create round" }).click();
  await expect(page).toHaveURL(/\/rounds\/rnd_/);
  await expect(page.getByText("All changes saved")).toBeVisible();
  await context.close();
});

test("partners edit one speech draft together; locks and offline edits hold", async ({ browser }) => {
  const A = await signedIn(browser, "a");
  const B = await signedIn(browser, "b");
  const teamId = await teamOf(A.page.request);
  const roundId = await roundWithDocs(A.page.request, teamId, `collab-${Date.now()}`);

  // Owner opens the round: the 2AC is next for the aff, and the 1NC positions are on the coverage list.
  await A.page.goto(`/rounds/${roundId}`);
  await expect(A.page.getByText("What the 2AC must answer")).toBeVisible();
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await A.page.getByRole("button", { name: "Add section" }).click();
  const edA = editor(A.page);
  await edA.locator("section p").first().click();
  await A.page.keyboard.type("Owner: perm do both.");
  await expect(A.page.getByText("All changes saved")).toBeVisible();

  // Partner sees it, and their reply reaches the owner.
  await B.page.goto(`/rounds/${roundId}`);
  const edB = editor(B.page);
  await expect(edB).toContainText("Owner: perm do both.", { timeout: 30_000 });
  await edB.locator("section p").first().click();
  await B.page.keyboard.press("End");
  await B.page.keyboard.type(" Partner: and the CP links.");
  await expect(edA).toContainText("Partner: and the CP links.", { timeout: 30_000 });

  // Owner locks the section: the partner's typing is refused.
  await A.page.getByRole("button", { name: "Lock section" }).first().click();
  await expect(B.page.getByRole("button", { name: "Unlock section" }).first()).toBeVisible({ timeout: 30_000 });
  const before = await edB.locator("section p").first().innerText();
  await edB.locator("section p").first().click();
  await B.page.keyboard.type(" SHOULD-NOT-APPEAR");
  await expect(B.page.getByText("That section is locked")).toBeVisible();
  expect(await edB.locator("section p").first().innerText()).toBe(before);
  await A.page.getByRole("button", { name: "Unlock section" }).first().click();

  // Owner goes offline, keeps writing, and the edit arrives after reconnecting.
  await A.context.setOffline(true);
  await A.page.getByRole("button", { name: "Add section" }).click();
  await A.page.keyboard.type("Written offline.");
  await expect(A.page.getByText(/Offline/).first()).toBeVisible({ timeout: 30_000 });
  await A.context.setOffline(false);
  await expect(A.page.getByText("All changes saved")).toBeVisible({ timeout: 45_000 });
  await expect(edB).toContainText("Written offline.", { timeout: 30_000 });

  await A.context.close();
  await B.context.close();
});

test("someone outside the team cannot open the round", async ({ browser }) => {
  const A = await signedIn(browser, "a");
  const roundId = await roundWithDocs(A.page.request, await teamOf(A.page.request), `outsider-${Date.now()}`);
  const C = await signedIn(browser, "c");
  // The outsider belongs to a different team (not to no team, which would just show onboarding).
  const teams = (await (await C.page.request.get("/api/teams")).json()) as { teams: unknown[] };
  if (!teams.teams.length) await C.page.request.post("/api/teams", { data: { name: "Outsider team" } });
  const api = await C.page.request.get(`/api/rounds/${roundId}`);
  expect(api.status()).toBe(404);
  await C.page.goto(`/rounds/${roundId}`);
  await expect(C.page.getByText(/not found/i)).toBeVisible();
  await expect(C.page.getByText("E2E")).toHaveCount(0);
  await A.context.close();
  await C.context.close();
});
