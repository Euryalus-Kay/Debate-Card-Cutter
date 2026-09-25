import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { roundWithDocs, signedIn, teamOf } from "./helpers";

// Accessibility scan (Phase G): WCAG 2.1 A/AA rules on the main pages, light and dark.
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

for (const scheme of ["light", "dark"] as const) {
  test(`main pages have no serious accessibility violations (${scheme})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const A = await signedIn(browser, "a");
    await A.page.emulateMedia({ colorScheme: scheme });
    const roundId = await roundWithDocs(A.page.request, await teamOf(A.page.request), `a11y-${Date.now()}`);
    const pages = ["/rounds", `/rounds/${roundId}?speech=2AC`, `/rounds/${roundId}?speech=1NC`, "/library", "/library?tab=files", "/library/build", "/research", "/settings"];
    const problems: string[] = [];
    for (const path of pages) {
      await A.page.goto(path);
      await A.page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page: A.page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of r.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) problems.push(`${path} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`);
    }
    expect(problems).toEqual([]);
    await A.context.close();
  });
}
