/**
 * DEV/TEST ONLY: sign in as a synthetic test user without typing credentials.
 * Disabled unless ENABLE_DEV_LOGIN=1, the request comes from localhost, the
 * app is not on Vercel, and either NODE_ENV !== "production" or the server was
 * started for a local production-build test (CLASH_LOCAL_PROD_TEST=1, set only
 * by the local launch config). Never available in deployed environments.
 */
import { auth } from "@/server/auth";

const TEST_USERS: Record<string, { email: string; name: string }> = {
  a: { email: "test-a@clash.test", name: "Test Debater A" },
  b: { email: "test-b@clash.test", name: "Test Debater B" },
  c: { email: "test-c@clash.test", name: "Outsider C" },
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const devBuild = process.env.NODE_ENV !== "production" || process.env.CLASH_LOCAL_PROD_TEST === "1";
  if (!devBuild || process.env.ENABLE_DEV_LOGIN !== "1" || !local || process.env.VERCEL) {
    return new Response("Not found", { status: 404 });
  }
  const who = TEST_USERS[url.searchParams.get("as") ?? "a"];
  if (!who) return new Response("unknown test user", { status: 400 });
  const password = process.env.DEV_TEST_PASSWORD ?? "dev-only-password-not-secret";
  const a = auth();
  try {
    await a.api.signUpEmail({ body: { email: who.email, password, name: who.name } });
  } catch {
    /* already exists */
  }
  const res = (await a.api.signInEmail({ body: { email: who.email, password }, asResponse: true })) as Response;
  const next = url.searchParams.get("next") ?? "/rounds";
  const out = new Response(null, { status: 302, headers: { location: next } });
  for (const c of res.headers.getSetCookie()) out.headers.append("set-cookie", c);
  return out;
}
