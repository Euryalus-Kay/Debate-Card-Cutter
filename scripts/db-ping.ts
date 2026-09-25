import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const t0 = Date.now();
const r = await sql`select version(), current_database(), now()`;
const t1 = Date.now();
await sql`select 1`;
const t2 = Date.now();
const ext = await sql`select name, default_version from pg_available_extensions where name in ('vector','pg_trgm','pgcrypto','unaccent') order by name`;
console.log({ firstMs: t1 - t0, secondMs: t2 - t1, version: String(r[0].version).slice(0, 40), db: r[0].current_database, ext });
