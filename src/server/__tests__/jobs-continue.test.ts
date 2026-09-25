// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { continuationToken, continueJob, MAX_RUNS, verifyContinuation } from "@/server/jobs/continue";

const env = { ...process.env };
beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-not-real";
  delete process.env.APP_ORIGIN;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

describe("job continuation", () => {
  it("signs per job and refuses anything else", () => {
    const t = continuationToken("job_a")!;
    expect(verifyContinuation("job_a", t)).toBe(true);
    expect(verifyContinuation("job_b", t)).toBe(false);
    expect(verifyContinuation("job_a", "x".repeat(t.length))).toBe(false);
    expect(verifyContinuation("job_a", "")).toBe(false);
  });

  it("asks this deployment for the next run, signed, and stops after MAX_RUNS", async () => {
    process.env.APP_ORIGIN = "https://clash.example.test/";
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get("authorization") });
      return new Response(null, { status: 202 });
    });
    expect(await continueJob("job_a", 3)).toBe(true);
    expect(calls[0]).toEqual({ url: "https://clash.example.test/api/jobs/job_a/continue", auth: `Bearer ${continuationToken("job_a")}` });
    expect(await continueJob("job_a", MAX_RUNS)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("does nothing in local development (no deployment address) or without a signing key", async () => {
    expect(await continueJob("job_a", 1)).toBe(false);
    process.env.APP_ORIGIN = "https://clash.example.test";
    delete process.env.BETTER_AUTH_SECRET;
    expect(await continueJob("job_a", 1)).toBe(false);
  });

  it("the continue route answers 404 to an unsigned or wrongly signed request", async () => {
    const { POST } = await import("@/app/api/jobs/[jobId]/continue/route");
    const ctx = { params: Promise.resolve({ jobId: "job_a" }) };
    expect((await POST(new Request("https://x.test/api/jobs/job_a/continue", { method: "POST" }), ctx)).status).toBe(404);
    expect((await POST(new Request("https://x.test/api/jobs/job_a/continue", { method: "POST", headers: { authorization: `Bearer ${continuationToken("job_b")}` } }), ctx)).status).toBe(404);
  });
});
