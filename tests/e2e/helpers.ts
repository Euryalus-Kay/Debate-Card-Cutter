import { readFileSync } from "node:fs";
import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";

/** Sign a new browser context in as a synthetic test user (dev-only route). */
export async function signedIn(browser: Browser, who: "a" | "b" | "c"): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.get(`/api/dev/login?as=${who}&next=/rounds`, { maxRedirects: 0 });
  if (res.status() !== 302) throw new Error(`dev login failed (${res.status()}); is the dev server running with ENABLE_DEV_LOGIN=1?`);
  return { context, page };
}

export async function teamOf(request: APIRequestContext): Promise<string> {
  const r = await request.get("/api/teams");
  const d = (await r.json()) as { teams: { id: string }[] };
  return d.teams[0].id;
}

/** A round with the synthetic 1AC (ours) and 1NC (theirs) already on the flow. */
export async function roundWithDocs(request: APIRequestContext, teamId: string, label: string): Promise<string> {
  const r = await request.post("/api/rounds", { data: { teamId, tournament: "E2E", roundLabel: label, ourSide: "aff", opponent: { school: "Synthetic", code: "E2E" }, aiPolicy: "allowed" } });
  if (!r.ok()) throw new Error(`create round ${r.status()} ${await r.text()}`);
  const { id } = (await r.json()) as { id: string };
  for (const [file, speech, owner] of [["synthetic-1ac.docx", "1AC", "us"], ["synthetic-1nc.docx", "1NC", "opponent"]] as const) {
    const up = await request.post(`/api/rounds/${id}/uploads`, {
      multipart: { speech, owner, file: { name: file, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync(`tests/fixtures/${file}`) } },
    });
    if (!up.ok()) throw new Error(`upload ${file}: ${up.status()}`);
    const { upload } = (await up.json()) as { upload: { id: string } };
    const flow = await request.post(`/api/rounds/${id}/uploads/${upload.id}/flow`);
    if (!flow.ok()) throw new Error(`flow ${file}: ${flow.status()}`);
  }
  return id;
}

/** The speech editor's editable area. */
export const editor = (page: Page) => page.locator(".speech-editor .ProseMirror").first();
