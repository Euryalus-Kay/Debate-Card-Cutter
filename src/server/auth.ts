import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

let instance: ReturnType<typeof create> | null = null;

function create() {
  return betterAuth({
    appName: "Clash",
    baseURL: baseURL(),
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days: tournaments span weekends
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
    trustedOrigins: [
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
      ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
      ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
      "http://localhost:3000",
    ],
    plugins: [nextCookies()],
  });
}

export function auth() {
  if (!instance) instance = create();
  return instance;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** Current user from the request cookies, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const s = await auth().api.getSession({ headers: await headers() });
  if (!s?.user) return null;
  return { id: s.user.id, name: s.user.name, email: s.user.email };
}
