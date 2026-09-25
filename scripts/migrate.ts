/**
 * Apply SQL migrations in ./drizzle. Production: APP_DATABASE_URL_UNPOOLED
 * (from `vercel env pull --environment=production`); otherwise the development
 * database in DATABASE_URL_UNPOOLED. Safe to run repeatedly.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.APP_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const started = Date.now();
await migrate(drizzle({ client: neon(url) }), { migrationsFolder: "./drizzle" });
console.log(`migrations applied in ${Date.now() - started} ms`);
