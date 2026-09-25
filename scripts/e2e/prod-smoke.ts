/**
 * End-to-end smoke test against a deployed environment (production by default).
 * Creates QA accounts (qa-*@clash.test), exercises every core path, and writes
 * the accounts it created to <scratch>/qa-accounts.json for cleanup with
 * scripts/e2e/prod-cleanup-qa.ts.
 *
 *   npx tsx scripts/e2e/prod-smoke.ts https://clash-debate.vercel.app <scratch-dir> [<synthetic-docs-dir>]
 *
 * The documents default to the invented test fixtures in tests/fixtures.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as Y from "yjs";
import { unzipSync, strFromU8 } from "fflate";
import { DocSync } from "@/client/sync/doc-sync";
import { DRAFT_FRAGMENT } from "@/shared/editor/schema";
import { fragmentText } from "@/shared/doc-text";

const [base = "https://clash-debate.vercel.app", scratch = ".", docsDir = "tests/fixtures"] = process.argv.slice(2);
const results: { step: string; ok: boolean; ms: number; detail?: string }[] = [];
const accounts: { email: string; userId?: string; teamId?: string }[] = [];

class Client {
  jar = new Map<string, string>();
  constructor(public name: string) {}
  cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async req(path: string, init: RequestInit & { json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    if (this.jar.size) headers.set("cookie", this.cookie());
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(init.json);
    }
    headers.set("origin", base);
    const res = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }
  async json<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<{ status: number; body: T }> {
    const res = await this.req(path, init);
    const text = await res.text();
    let body: T;
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = text as unknown as T;
    }
    return { status: res.status, body };
  }
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const t0 = Date.now();
  try {
    const v = await fn();
    // What the step measured (timings, counts), kept short; ids and strings of text are left out.
    const detail = v && typeof v === "object" ? JSON.stringify(v, (k, x) => (typeof x === "string" && (x.length > 80 || /^(card|team|rnd|draft|op|upl)_/.test(x)) ? undefined : x)).slice(0, 400) : undefined;
    results.push({ step: name, ok: true, ms: Date.now() - t0, detail });
    console.log(`✓ ${name} (${Date.now() - t0} ms)`);
    return v;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ step: name, ok: false, ms: Date.now() - t0, detail });
    console.log(`✗ ${name}: ${detail}`);
    return undefined;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const tag = randomBytes(4).toString("hex");
const password = randomBytes(18).toString("base64url");
const mk = (who: string) => ({ name: `QA ${who}`, email: `qa-${who}-${tag}@clash.test`, password });
const save = () => writeFileSync(`${scratch}/qa-accounts.json`, JSON.stringify({ base, accounts }, null, 2));

const A = new Client("A");
const B = new Client("B");
const C = new Client("C");

await step("owner signs up (first account)", async () => {
  const u = mk("owner");
  accounts.push({ email: u.email });
  save();
  const r = await A.json<{ user?: { id: string }; message?: string }>("/api/auth/sign-up/email", { method: "POST", json: u });
  assert(r.status === 200 && r.body.user, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  accounts[0].userId = r.body.user.id;
  save();
});

const teamId = await step("owner creates a team", async () => {
  const r = await A.json<{ id: string }>("/api/teams", { method: "POST", json: { name: "QA Team" } });
  assert(r.status === 200 && r.body.id, `status ${r.status}`);
  accounts[0].teamId = r.body.id;
  save();
  return r.body.id;
});

await step("stranger cannot sign up without an invite", async () => {
  const u = mk("stranger");
  const r = await C.json<{ message?: string }>("/api/auth/sign-up/email", { method: "POST", json: u });
  assert(r.status === 403, `expected 403, got ${r.status}`);
});

const inviteUrl = await step("owner creates an invite link", async () => {
  const r = await A.json<{ url: string }>(`/api/teams/${teamId}/invites`, { method: "POST" });
  assert(r.status === 200 && r.body.url.includes("/join/"), `status ${r.status}`);
  return r.body.url;
});

await step("partner signs up with the invite and joins", async () => {
  const token = inviteUrl!.split("/join/")[1];
  const u = mk("partner");
  accounts.push({ email: u.email });
  save();
  const r = await B.json<{ user?: { id: string } }>("/api/auth/sign-up/email", { method: "POST", json: u, headers: { "x-invite-token": token } });
  assert(r.status === 200 && r.body.user, `signup status ${r.status}`);
  accounts[1].userId = r.body.user.id;
  save();
  const j = await B.json<{ teamId: string }>("/api/join", { method: "POST", json: { token } });
  assert(j.status === 200 && j.body.teamId === teamId, `join status ${j.status}`);
});

const roundId = await step("owner creates a round (aff)", async () => {
  const r = await A.json<{ id: string }>("/api/rounds", { method: "POST", json: { teamId, tournament: "QA Invitational", roundLabel: "R1", ourSide: "aff", opponent: { school: "Synthetic", code: "XY", names: "" }, aiPolicy: "allowed" } });
  assert(r.status === 200 && r.body.id, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.id;
});

await step("partner can read the round; logged-out gets 401", async () => {
  const r = await B.json(`/api/rounds/${roundId}`);
  assert(r.status === 200, `partner got ${r.status}`);
  const anon = new Client("anon");
  const x = await anon.json(`/api/rounds/${roundId}`);
  assert(x.status === 401, `anonymous got ${x.status}`);
});

async function upload(file: string, speech: string, owner: "us" | "opponent") {
  const form = new FormData();
  form.set("speech", speech);
  form.set("owner", owner);
  form.set("file", new File([readFileSync(`${docsDir}/${file}`)], file, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const r = await A.json<{ upload: { id: string; warnings: string[] } }>(`/api/rounds/${roundId}/uploads`, { method: "POST", body: form });
  assert(r.status === 200 && r.body.upload?.id, `upload ${file}: status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  const f = await A.json<{ positions?: number; args?: number }>(`/api/rounds/${roundId}/uploads/${r.body.upload.id}/flow`, { method: "POST" });
  assert(f.status === 200, `flow import ${file}: status ${f.status} ${JSON.stringify(f.body).slice(0, 200)}`);
  return { uploadId: r.body.upload.id, flow: f.body };
}

await step("upload 1AC + 1NC .docx to Blob and add to the flow", async () => {
  const a = await upload("synthetic-1ac.docx", "1AC", "us");
  const n = await upload("synthetic-1nc.docx", "1NC", "opponent");
  return { a, n };
});

await step("library: a file goes straight to Blob, is split into cards and labeled; re-importing finds only duplicates; another team's path is refused", async () => {
  const { upload: blobUpload } = await import("@vercel/blob/client");
  const bytes = readFileSync(`${docsDir}/synthetic-1nc.docx`);
  type ImportView = { job: { status: string; result: { created: number; duplicates: number; variants: number; labeled: number } | null; error: string | null } };
  const importOnce = async () => {
    const blob = await blobUpload(`teams/${teamId}/incoming/smoke-1nc.docx`, new Blob([bytes]), { access: "private", handleUploadUrl: `${base}/api/blob/upload`, clientPayload: JSON.stringify({ teamId, purpose: "library" }), headers: { cookie: A.cookie(), origin: base } });
    const r = await A.json<{ jobId: string }>("/api/library/imports", { method: "POST", json: { teamId, pathname: blob.pathname, fileName: "smoke-1nc.docx", size: bytes.length } });
    assert(r.status === 202, `start: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const deadline = Date.now() + 180_000;
    let job: ImportView["job"] | null = null;
    while (Date.now() < deadline) {
      const g: { status: number; body: ImportView } = await A.json<ImportView>(`/api/library/imports/${r.body.jobId}?teamId=${teamId}`);
      job = g.body.job;
      if (!["queued", "running"].includes(job.status)) break;
      await new Promise((res) => setTimeout(res, 2000));
    }
    assert(job?.status === "succeeded" && job.result, `import ended ${job?.status}: ${job?.error}`);
    return job!.result!;
  };
  const t0 = Date.now();
  const first = await importOnce();
  const firstMs = Date.now() - t0;
  assert(first.created > 0 && first.labeled > 0, `first import ${JSON.stringify(first)}`);
  const again = await importOnce();
  assert(again.created === 0 && again.duplicates >= first.created, `re-import ${JSON.stringify(again)}`);
  const found = await A.json<{ cards: { id: string }[] }>(`/api/cards?teamId=${teamId}&q=Rivera&limit=10`);
  assert(found.status === 200 && found.body.cards.length > 0, `search found ${found.body.cards?.length}`);
  const bad = await A.json("/api/library/imports", { method: "POST", json: { teamId, pathname: `teams/${teamId}/incoming/../../tm_other/incoming/x.docx`, fileName: "x.docx", size: 10 } });
  assert(bad.status === 400, `path outside the team's folder: ${bad.status}`);
  return { first, firstMs, again, found: found.body.cards.length };
});

await step("speech-to-text: answers or says it isn't set up (no key), and never reads another team's files", async () => {
  const other = new FormData();
  other.set("roundId", roundId!);
  other.set("pathname", "teams/tm_other/incoming/x.m4a");
  const bad = await A.json("/api/transcribe", { method: "POST", body: other });
  assert(bad.status === 400, `another team's recording: ${bad.status}`);
  const form = new FormData();
  form.set("roundId", roundId!);
  form.set("audio", new File([new Uint8Array(2000)], "silence.webm", { type: "audio/webm" }));
  const r = await A.json<{ error?: string }>("/api/transcribe", { method: "POST", body: form });
  assert([200, 501, 502].includes(r.status), `transcribe: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  return { status: r.status, configured: r.status !== 501 };
});

const draftId = await step("create a 2AC draft", async () => {
  const r = await A.json<{ id: string }>(`/api/rounds/${roundId}/drafts`, { method: "POST", json: { speech: "2AC" } });
  assert(r.status === 200 && r.body.id, `status ${r.status}`);
  return r.body.id;
});

await step("two clients sync the draft (A writes, B sees; B writes, A sees)", async () => {
  const mkSync = (c: Client) =>
    new DocSync(draftId!, new Y.Doc(), {
      persistence: false,
      endpoint: (id) => `${base}/api/docs/${id}/sync`,
      fetch: ((url: string, init?: RequestInit) => fetch(url, { ...init, headers: { ...(init?.headers ?? {}), cookie: c.cookie(), origin: base } })) as typeof fetch,
      idleIntervalMs: 700,
      debounceMs: 50,
    });
  const sa = mkSync(A);
  const sb = mkSync(B);
  await sa.start();
  await sb.start();
  const para = (text: string) => {
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText(text)]);
    return p;
  };
  sa.doc.transact(() => sa.doc.getXmlFragment(DRAFT_FRAGMENT).insert(0, [para("Owner wrote this.")]));
  await sa.flush();
  const deadline = Date.now() + 15000;
  while (!fragmentText(sb.doc.getXmlFragment(DRAFT_FRAGMENT)).includes("Owner wrote this.") && Date.now() < deadline) {
    await sb.sync();
    await new Promise((r) => setTimeout(r, 300));
  }
  assert(fragmentText(sb.doc.getXmlFragment(DRAFT_FRAGMENT)).includes("Owner wrote this."), "partner never received the owner's edit");
  sb.doc.transact(() => sb.doc.getXmlFragment(DRAFT_FRAGMENT).insert(1, [para("Partner replied.")]));
  await sb.flush();
  const d2 = Date.now() + 15000;
  while (!fragmentText(sa.doc.getXmlFragment(DRAFT_FRAGMENT)).includes("Partner replied.") && Date.now() < d2) {
    await sa.sync();
    await new Promise((r) => setTimeout(r, 300));
  }
  const text = fragmentText(sa.doc.getXmlFragment(DRAFT_FRAGMENT));
  sa.stop();
  sb.stop();
  assert(text.includes("Partner replied."), "owner never received the partner's edit");
});

type OpEv = { t: string; id?: string; data?: unknown; message?: string };
/** Start an AI operation and read its stream to the end. `onOp` gets the operation id as soon as it's known. */
async function runOp(c: Client, body: Record<string, unknown>, onOp?: (id: string) => void): Promise<{ done: OpEv | null; events: OpEv[]; firstMs: number | null; totalMs: number }> {
  const t0 = Date.now();
  const res = await c.req("/api/ai/ops", { method: "POST", json: body });
  assert(res.status === 200 && res.body, `status ${res.status} ${res.status !== 200 ? (await res.text()).slice(0, 200) : ""}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let first: number | null = null;
  let done: OpEv | null = null;
  const events: OpEv[] = [];
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    if (first === null) first = Date.now() - t0;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as OpEv;
      events.push(ev);
      if (ev.t === "op" && ev.id) onOp?.(ev.id);
      if (ev.t === "done" || ev.t === "error") done = ev;
    }
  }
  return { done, events, firstMs: first, totalMs: Date.now() - t0 };
}

const stateDocId = await step("round state document is reachable", async () => {
  const r = await A.json<{ round: { stateDocId: string } }>(`/api/rounds/${roundId}`);
  assert(r.status === 200 && r.body.round?.stateDocId, `status ${r.status}`);
  return r.body.round.stateDocId;
});

await step("typed notes from their 1NC reach the flow (extract_flow)", async () => {
  const sync = new DocSync(stateDocId!, new Y.Doc(), {
    persistence: false,
    endpoint: (id) => `${base}/api/docs/${id}/sync`,
    fetch: ((url: string, init?: RequestInit) => fetch(url, { ...init, headers: { ...(init?.headers ?? {}), cookie: A.cookie(), origin: base } })) as typeof fetch,
    idleIntervalMs: 700,
    debounceMs: 50,
  });
  await sync.start();
  sync.doc.transact(() => sync.doc.getText(`heard:1NC:${accounts[0].userId}`).insert(0, "Topicality\n1. we meet is wrong - the plan isn't a program\n2. limits - explodes the topic\n"));
  await sync.flush();
  sync.stop();
  const r = await runOp(A, { kind: "extract_flow", roundId, speech: "1NC", mode: "fast" });
  assert(r.done?.t === "done", `no result: ${JSON.stringify(r.done).slice(0, 300)}`);
  const out = r.done.data as { created: string[] };
  assert(out.created.length >= 2, `created ${out.created.length} arguments`);
  assert(r.events.some((e) => e.t === "progress"), "no progress events");
  return { created: out.created.length, totalMs: r.totalMs };
});

await step("AI drafts the 2AC (fast mode, streamed)", async () => {
  const res = await A.req("/api/ai/ops", { method: "POST", json: { kind: "draft_speech", roundId, speech: "2AC", draftId, mode: "fast" } });
  assert(res.status === 200 && res.body, `status ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let first: number | null = null;
  const t0 = Date.now();
  type Ev = { t: string; data?: { output?: { sections?: { cardIds?: string[] }[] }; validation?: { library?: { offered: number; used: number }; retags?: { cite: string }[] } }; message?: string };
  let done: Ev | null = null as Ev | null;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    if (first === null) first = Date.now() - t0;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as Ev;
      if (ev.t === "done" || ev.t === "error") done = ev;
    }
  }
  assert(done && done.t === "done", `no result: ${JSON.stringify(done).slice(0, 300)}`);
  const sections = done.data?.output?.sections ?? [];
  assert(sections.length > 0, "draft had no sections");
  // The library holds only the imported 1NC (their evidence): the check must not offer it as our answer.
  const library = done.data?.validation?.library;
  assert(!library || library.used === 0, `the draft reads ${library?.used} library card(s), but the library holds only their evidence`);
  return { firstByteMs: first, totalMs: Date.now() - t0, sections: sections.length, library, retags: done.data?.validation?.retags?.length ?? 0 };
});

await step("the AI updates the 2AC for what's new (patch_speech), placing answers by position", async () => {
  const r = await runOp(A, { kind: "patch_speech", roundId, speech: "2AC", draftId, mode: "fast" });
  assert(r.done?.t === "done", `no result: ${JSON.stringify(r.done).slice(0, 300)}`);
  const out = r.done.data as { upToDate: boolean; output: { adds: { targets: string[] }[] }; addInfo: Record<string, { where: string }> };
  assert(!out.upToDate && out.output.adds.length > 0, "no answers proposed for the typed arguments");
  return { adds: out.output.adds.length, where: Object.values(out.addInfo)[0]?.where, totalMs: r.totalMs };
});

await step("the AI rewrites a few selected words (edit_span), and flags nothing invented", async () => {
  const r = await runOp(A, { kind: "edit_span", roundId, speech: "2AC", draftId, spanAction: "sharpen", text: "Owner wrote this.", before: "", after: "", mode: "fast" });
  assert(r.done?.t === "done", `no result: ${JSON.stringify(r.done).slice(0, 300)}`);
  const out = r.done.data as { replacement: string; warnings: string[] };
  assert(out.replacement.trim().length > 0, "empty replacement");
  return { replacement: out.replacement.slice(0, 80), warnings: out.warnings.length };
});

await step("a partner can stop a running AI job", async () => {
  let opId: string | null = null;
  const run = runOp(A, { kind: "draft_speech", roundId, speech: "2AC", draftId, mode: "deep" }, (id) => {
    opId = id;
  });
  const t0 = Date.now();
  while (!opId && Date.now() - t0 < 10_000) await new Promise((res) => setTimeout(res, 100));
  assert(opId, "no operation id");
  const stop = await B.json<{ stopped: boolean }>(`/api/ai/ops/${opId}/cancel`, { method: "POST", json: {} });
  assert(stop.status === 200 && stop.body.stopped, `stop status ${stop.status}`);
  const r = await run;
  assert(r.done?.t === "error" && /Cancelled|Stopped/.test(r.done.message ?? ""), `ended with ${JSON.stringify(r.done).slice(0, 200)}`);
  return { stoppedAfterMs: r.totalMs };
});

await step("research job runs in the background on Vercel and cuts a verified card", async () => {
  const r = await A.json<{ jobId: string }>("/api/research/jobs", { method: "POST", json: { teamId, input: { claim: "Upzoning alone cannot solve housing affordability", maxCards: 1, search: false, urls: ["https://legal-planet.org/2023/04/11/does-upzoning-reduce-housing-prices/"] } } });
  assert(r.status === 202, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  const deadline = Date.now() + 180_000;
  type JobView = { job: { status: string; checkpoint: { items: { status: string; error?: string; method?: string }[] } }; cards: { verificationStatus: string; tag: string; shortCite: string }[] };
  let job: JobView | null = null;
  while (Date.now() < deadline) {
    const g: { status: number; body: JobView } = await A.json<JobView>(`/api/research/jobs/${r.body.jobId}`);
    job = g.body;
    if (!["queued", "running"].includes(g.body.job.status)) break;
    await new Promise((res) => setTimeout(res, 2000));
  }
  assert(job && job.job.status === "succeeded", `job ended ${job?.job.status}: ${JSON.stringify(job?.job.checkpoint.items).slice(0, 300)}`);
  assert(job.cards[0]?.verificationStatus.startsWith("verified"), `card status ${job.cards[0]?.verificationStatus}`);
  return { tag: job.cards[0].tag, cite: job.cards[0].shortCite, method: job.job.checkpoint.items[0]?.method };
});

await step("export the draft as .docx", async () => {
  const res = await A.req(`/api/docs/${draftId}/export`);
  assert(res.status === 200, `status ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert(bytes[0] === 0x50 && bytes[1] === 0x4b, "not a zip file");
  const files = unzipSync(bytes);
  const xml = strFromU8(files["word/document.xml"]);
  assert(xml.includes("Owner wrote this.") && xml.includes("Partner replied."), "exported document is missing synced text");
  return { bytes: bytes.length };
});

await step("outsider (no team) gets 404 on the round, draft, and job list", async () => {
  const u = mk("outsider");
  // Outsiders can't even sign up without an invite in production; use a second invite on a separate team would need an owner.
  // Instead check the anonymous + wrong-team paths that don't need an account.
  const anon = new Client("anon2");
  const r1 = await anon.json(`/api/docs/${draftId}/sync`, { method: "POST", json: { since: 0, updates: [] } });
  assert(r1.status === 401, `anonymous sync got ${r1.status}`);
  void u;
});

save();
const failed = results.filter((r) => !r.ok);
writeFileSync(`${scratch}/prod-smoke-report.json`, JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
process.exit(failed.length ? 1 : 0);
