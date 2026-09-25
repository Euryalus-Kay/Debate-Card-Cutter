/**
 * Remove ONLY the QA accounts created by prod-smoke.ts (listed in
 * <scratch>/qa-accounts.json), the teams whose members are all QA accounts,
 * those teams' Blob files, and their telemetry. Refuses to touch a team that
 * has any non-QA member.
 *
 *   npx tsx --env-file=.env.local scripts/e2e/prod-cleanup-qa.ts <scratch-dir>
 * (needs <scratch>/prod-db.json from create-prod-db.ts and BLOB_READ_WRITE_TOKEN)
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { del, list } from "@vercel/blob";

const scratch = process.argv[2];
const { accounts } = JSON.parse(readFileSync(`${scratch}/qa-accounts.json`, "utf8")) as { accounts: { email: string }[] };
const { unpooled } = JSON.parse(readFileSync(`${scratch}/prod-db.json`, "utf8")) as { unpooled: string };
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN missing");

const QA = /^qa-[a-z]+-[0-9a-f]{8}@clash\.test$/;
const emails = accounts.map((a) => a.email).filter((e) => QA.test(e));
if (!emails.length) throw new Error("no QA accounts listed");
const sql = neon(unpooled);

const users = (await sql`select id, email from "user" where email = any(${emails})`) as { id: string; email: string }[];
const ids = users.map((u) => u.id);
console.log(`QA users found: ${users.map((u) => u.email).join(", ") || "none"}`);
const teams = ids.length ? ((await sql`select distinct team_id from team_members where user_id = any(${ids})`) as { team_id: string }[]) : [];

for (const { team_id } of teams) {
  const others = (await sql`select count(*)::int as n from team_members where team_id = ${team_id} and not (user_id = any(${ids}))`) as { n: number }[];
  if (others[0].n > 0) {
    console.log(`skip team ${team_id}: has non-QA members`);
    continue;
  }
  let blobs = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `teams/${team_id}/`, token, cursor });
    if (page.blobs.length) await del(page.blobs.map((b) => b.url), { token });
    blobs += page.blobs.length;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  await sql`delete from telemetry where team_id = ${team_id}`;
  await sql`delete from teams where id = ${team_id}`;
  console.log(`deleted team ${team_id} (cascade) and ${blobs} blob file(s)`);
}
if (ids.length) await sql`delete from "user" where id = any(${ids})`;
const left = (await sql`select count(*)::int as users, (select count(*)::int from teams) as teams, (select count(*)::int from rounds) as rounds, (select count(*)::int from cards) as cards from "user"`) as Record<string, number>[];
console.log(`remaining in production: ${JSON.stringify(left[0])}`);
