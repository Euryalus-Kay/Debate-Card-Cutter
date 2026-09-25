/**
 * Create an isolated production database ("clash_prod") next to the
 * development database in the same Neon project, and apply migrations.
 * Non-destructive: never drops or alters existing databases.
 *
 * Writes the derived connection strings (secrets) to the file given as the
 * first argument (mode 600) so they can be piped into `vercel env add`
 * without being printed.
 */
import { writeFileSync, chmodSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const out = process.argv[2];
const NAME = "clash_prod";
const unpooled = process.env.DATABASE_URL_UNPOOLED;
const pooled = process.env.DATABASE_URL;
if (!unpooled || !pooled || !out) throw new Error("usage: create-prod-db.ts <secrets-out-file> (needs DATABASE_URL and DATABASE_URL_UNPOOLED)");

const withDb = (u: string) => {
  const x = new URL(u);
  x.pathname = `/${NAME}`;
  return x.toString();
};

const admin = neon(unpooled);
const exists = await admin`select 1 from pg_database where datname = ${NAME}`;
if (exists.length === 0) {
  await admin.query(`create database ${NAME}`);
  console.log(`created database ${NAME}`);
} else console.log(`database ${NAME} already exists`);

const prodUnpooled = withDb(unpooled);
const prodPooled = withDb(pooled);
const t0 = Date.now();
await migrate(drizzle({ client: neon(prodUnpooled) }), { migrationsFolder: "./drizzle" });
const tables = await neon(prodUnpooled)`select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
const users = await neon(prodUnpooled)`select count(*)::int as n from "user"`;
console.log(`migrations applied in ${Date.now() - t0} ms; public tables: ${tables[0].n}; users: ${users[0].n}`);
writeFileSync(out, JSON.stringify({ pooled: prodPooled, unpooled: prodUnpooled }));
chmodSync(out, 0o600);
console.log(`connection strings written to ${out}`);
