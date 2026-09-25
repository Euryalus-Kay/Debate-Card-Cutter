import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { roundWithDocs, signedIn, teamOf } from "./helpers";

// Runs against a dev server started with AI_FAKE=1: E2E_FAKE=1 npx playwright test isolation
test.skip(!process.env.E2E_FAKE, "needs a dev server with AI_FAKE=1 (set E2E_FAKE=1)");

/**
 * Team isolation sweep (Phase G): everything team A owns — a round, a draft, a library card, an imported
 * file, a file build, a source check, research — is invisible to someone on another team, on every route
 * added since the first security pass. Nothing an outsider sends is accepted.
 */
test("someone on another team gets nothing from any of team A's routes", async ({ browser }) => {
  test.setTimeout(180_000);
  const A = await signedIn(browser, "a");
  const teamA = await teamOf(A.page.request);
  const roundId = await roundWithDocs(A.page.request, teamA, `isolation-${Date.now()}`);
  const draft = await A.page.request.post(`/api/rounds/${roundId}/drafts`, { data: { speech: "2AC" } });
  const { id: draftId } = (await draft.json()) as { id: string };
  const up = await A.page.request.post("/api/library/uploads", { multipart: { teamId: teamA, file: { name: "synthetic-1nc.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync("tests/fixtures/synthetic-1nc.docx") } } });
  const { upload } = (await up.json()) as { upload: { id: string } };
  const cards = (await (await A.page.request.get(`/api/cards?teamId=${teamA}&limit=1`)).json()) as { cards: { id: string }[] };
  const cardId = cards.cards[0].id;
  const build = (await (await A.page.request.post("/api/files/builds", { data: { teamId: teamA, input: { kind: "da", argument: "Isolation test DA: a synthetic argument", maxCards: 2 } } })).json()) as { jobId: string };

  const C = await signedIn(browser, "c");
  const teams = (await (await C.page.request.get("/api/teams")).json()) as { teams: { id: string }[] };
  if (!teams.teams.length) await C.page.request.post("/api/teams", { data: { name: "Outsider team" } });
  const teamC = await teamOf(C.page.request);
  expect(teamC).not.toBe(teamA);

  const denied = (s: number) => s === 403 || s === 404;
  const checks: [string, () => Promise<number>][] = [
    ["round", async () => (await C.page.request.get(`/api/rounds/${roundId}`)).status()],
    ["round ai-ops", async () => (await C.page.request.get(`/api/rounds/${roundId}/ai-ops`)).status()],
    ["round cx help", async () => (await C.page.request.post(`/api/rounds/${roundId}/cx`, { data: { cxId: "CX2" } })).status()],
    ["opponent history", async () => (await C.page.request.get(`/api/rounds/${roundId}/opponent-history`)).status()],
    ["draft sync", async () => (await C.page.request.post(`/api/docs/${draftId}/sync`, { data: { since: 0, updates: [] } })).status()],
    ["draft export", async () => (await C.page.request.get(`/api/docs/${draftId}/export`)).status()],
    ["AI op on A's round", async () => (await C.page.request.post("/api/ai/ops", { data: { kind: "draft_speech", roundId, speech: "2AC", draftId, mode: "fast" } })).status()],
    ["card", async () => (await C.page.request.get(`/api/cards/${cardId}`)).status()],
    ["card source check", async () => (await C.page.request.post(`/api/cards/${cardId}/verify`)).status()],
    ["upload", async () => (await C.page.request.get(`/api/uploads/${upload.id}`)).status()],
    ["upload download", async () => (await C.page.request.get(`/api/uploads/${upload.id}/download`)).status()],
    ["A's library files", async () => (await C.page.request.get(`/api/library/uploads?teamId=${teamA}`)).status()],
    ["A's imports", async () => (await C.page.request.get(`/api/library/imports?teamId=${teamA}`)).status()],
    ["A's source checks", async () => (await C.page.request.get(`/api/library/checks?teamId=${teamA}`)).status()],
    ["start a check on A", async () => (await C.page.request.post("/api/library/checks", { data: { teamId: teamA } })).status()],
    ["library find on A's round", async () => (await C.page.request.post("/api/library/find", { data: { roundId, claim: "states can't coordinate" } })).status()],
    ["library find on A's team", async () => (await C.page.request.post("/api/library/find", { data: { teamId: teamA, side: "aff", claim: "states can't coordinate" } })).status()],
    ["A's file builds", async () => (await C.page.request.get(`/api/files/builds?teamId=${teamA}`)).status()],
    ["A's build", async () => (await C.page.request.get(`/api/files/builds/${build.jobId}?teamId=${teamA}`)).status()],
    ["A's build via C's team id", async () => (await C.page.request.get(`/api/files/builds/${build.jobId}?teamId=${teamC}`)).status()],
    ["approve A's build", async () => (await C.page.request.post(`/api/files/builds/${build.jobId}`, { data: { teamId: teamA, action: "approve", removed: [] } })).status()],
    ["A's spend", async () => (await C.page.request.get(`/api/teams/${teamA}/ai-usage`)).status()],
    ["set A's budget", async () => (await C.page.request.post(`/api/teams/${teamA}/ai-usage`, { data: { capUsd: 1000 } })).status()],
    ["A's research jobs", async () => (await C.page.request.get(`/api/research/jobs?teamId=${teamA}`)).status()],
    ["research for A", async () => (await C.page.request.post("/api/research/jobs", { data: { teamId: teamA, input: { claim: "states can't coordinate", maxCards: 1 } } })).status()],
    ["upload to A's storage", async () => (await C.page.request.post("/api/blob/upload", { data: { type: "blob.generate-client-token", payload: { pathname: `teams/${teamA}/incoming/x.docx`, clientPayload: JSON.stringify({ teamId: teamA, purpose: "library" }), multipart: false } } })).status()],
    ["import from A's storage", async () => (await C.page.request.post("/api/library/imports", { data: { teamId: teamA, pathname: `teams/${teamA}/incoming/x.docx`, fileName: "x.docx", size: 10, labels: [] } })).status()],
    ["transcribe on A's round", async () => (await C.page.request.post("/api/transcribe", { multipart: { roundId, audio: { name: "x.webm", mimeType: "audio/webm", buffer: Buffer.alloc(100) } } })).status()],
  ];
  const results: string[] = [];
  for (const [name, run] of checks) {
    const s = await run();
    if (!denied(s)) results.push(`${name}: ${s}`);
  }
  expect(results).toEqual([]);
  await A.context.close();
  await C.context.close();
});
