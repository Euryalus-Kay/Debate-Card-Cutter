/**
 * DEV ONLY: drop and recreate the schema, but ONLY if the database holds no
 * user data (no users, teams, cards, rounds). Refuses otherwise.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url || process.argv[2] !== "--i-understand-this-drops-tables") {
  console.error("usage: reset-empty-db.ts --i-understand-this-drops-tables");
  process.exit(1);
}
const sql = neon(url);
const tables = (await sql`select table_name from information_schema.tables where table_schema='public'`).map((r) => String(r.table_name));
for (const t of ["user", "teams", "cards", "rounds"]) {
  if (!tables.includes(t)) continue;
  const [{ n }] = await sql.query(`select count(*)::int as n from "${t}"`);
  if (Number(n) > 0) {
    console.error(`refusing: table ${t} has ${n} rows`);
    process.exit(2);
  }
}
await sql`drop schema if exists drizzle cascade`;
await sql`drop schema public cascade`;
await sql`create schema public`;
await sql`grant all on schema public to public`;
console.log(`dropped ${tables.length} empty tables`);
