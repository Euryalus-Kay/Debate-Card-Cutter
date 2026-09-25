/**
 * Jobs longer than one server function (research, big imports) continue on their own (B4): when a run
 * pauses, it asks this deployment to start the next run, signed with a key only the server knows. So a job
 * keeps going after the page that started it is closed; polling still resumes it as before, and the lease
 * keeps two runs from working at once. At most MAX_RUNS runs per job.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_RUNS = 30;

function signingKey(): string | null {
  return process.env.BETTER_AUTH_SECRET ?? null;
}

export function continuationToken(jobId: string): string | null {
  const key = signingKey();
  return key ? createHmac("sha256", key).update(`job-continue:${jobId}`).digest("hex") : null;
}

export function verifyContinuation(jobId: string, token: string): boolean {
  const want = continuationToken(jobId);
  if (!want || token.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(token));
}

/** Where this deployment answers: production's own domain, a preview's URL, or nowhere (local development). */
function deployment(): { url: string; headers: Record<string, string> } | null {
  if (process.env.APP_ORIGIN) return { url: process.env.APP_ORIGIN.replace(/\/$/, ""), headers: {} };
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return { url: `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`, headers: {} };
  if (process.env.VERCEL_URL) return { url: `https://${process.env.VERCEL_URL}`, headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {} };
  return null;
}

/** Start the job's next run (fire and forget). `runs` is how many runs it has had (its lease count). */
export async function continueJob(jobId: string, runs: number): Promise<boolean> {
  const d = deployment();
  const token = continuationToken(jobId);
  if (!d || !token || runs >= MAX_RUNS) return false;
  try {
    const res = await fetch(`${d.url}/api/jobs/${jobId}/continue`, { method: "POST", headers: { ...d.headers, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    return res.status === 202;
  } catch {
    return false;
  }
}
