import { expect, test, type Page } from "@playwright/test";
import { editor, roundWithDocs, signedIn, teamOf } from "./helpers";

// Runs against a dev server started with AI_FAKE=1 (deterministic AI, no cost): E2E_FAKE=1 npx playwright test heard-loop
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

/** Every section of the open draft, by id, as the editor holds it. */
function sections(page: Page) {
  return page.evaluate(() => {
    const eds = (window as unknown as { __clashEditors: Map<string, { isDestroyed: boolean; getJSON: () => { content?: unknown[] } }> }).__clashEditors;
    const out: Record<string, string> = {};
    const walk = (n: { type?: string; attrs?: { id?: string }; content?: unknown[] }) => {
      if (n.type === "section" && n.attrs?.id) out[n.attrs.id] = JSON.stringify(n.content);
      for (const c of (n.content ?? []) as (typeof n)[]) walk(c);
    };
    walk([...eds.values()].find((e) => !e.isDestroyed)!.getJSON() as never);
    return out;
  });
}

test("what we type from their speech reaches the flow; updating the draft adds only what's new", async ({ browser }) => {
  test.setTimeout(180_000);
  const A = await signedIn(browser, "a");
  const roundId = await roundWithDocs(A.page.request, await teamOf(A.page.request), `heard-${Date.now()}`);

  // Their 1NC: type analytics the doc doesn't have, then put them on the flow.
  await A.page.goto(`/rounds/${roundId}?speech=1NC`);
  const pad = A.page.getByLabel("What I heard in their 1NC");
  await pad.fill("Topicality\n1. we meet is wrong - the plan isn't insurance\n2. limits - explodes the topic\n");
  await A.page.getByRole("button", { name: "Update flow" }).click();
  await expect(A.page.getByText(/[0-9]+\/[0-9]+ on the flow/)).toHaveText(/(\d+)\/\1 on the flow/, { timeout: 30_000 });

  // The 2AC must now answer them; one click answers everything left, placed by position.
  await A.page.goto(`/rounds/${roundId}?speech=2AC`);
  await A.page.getByRole("button", { name: "Blank draft" }).click();
  await expect(A.page.getByText("the plan isn't insurance").first()).toBeVisible();
  await A.page.getByRole("button", { name: /Answer the \d+ remaining/ }).click();
  await A.page.getByRole("button", { name: /^Apply (all|\d+ selected)$/ }).first().click();
  await expect(A.page.getByRole("button", { name: /Answer the \d+ remaining/ })).toHaveCount(0, { timeout: 30_000 });
  await expect(editor(A.page)).toContainText("the plan isn't insurance");
  const before = await sections(A.page);

  // One more line in their 1NC → one new answer; every existing section stays exactly as it was.
  await A.page.goto(`/rounds/${roundId}?speech=1NC`);
  await A.page.getByLabel("What I heard in their 1NC").fill("Topicality\n1. we meet is wrong - the plan isn't insurance\n2. limits - explodes the topic\n3. ground - no stable neg links\n");
  await A.page.getByRole("button", { name: "Update flow" }).click();
  await expect(A.page.getByText(/(\d+)\/\1 on the flow/)).toBeVisible({ timeout: 30_000 });
  await A.page.goto(`/rounds/${roundId}?speech=2AC`);
  await A.page.getByRole("button", { name: "Answer the 1 remaining" }).click();
  await A.page.getByRole("button", { name: /^Apply (all|\d+ selected)$/ }).first().click();
  await expect(editor(A.page)).toContainText("no stable neg links", { timeout: 30_000 });
  const after = await sections(A.page);
  const added = Object.keys(after).filter((id) => !(id in before));
  expect(added).toHaveLength(1);
  for (const [id, content] of Object.entries(before)) {
    // The section that received the new answer changes only by gaining it (its own words are untouched).
    if (after[id] !== content) expect(after[id]).toContain(added[0]);
  }
  await A.context.close();
});
