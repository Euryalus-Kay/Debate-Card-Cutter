/**
 * Label (or relabel) every card in a team's library with the current labeler, in file order so each card sees
 * the card before it. Use after the labels improve; imports label new cards on their own.
 *
 *   npx tsx --env-file=.env.local scripts/relabel-library.ts <teamId>
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cards } from "@/server/db/schema";
import { labelAndSave } from "@/server/library/label";

const [teamId] = process.argv.slice(2);
if (!teamId) throw new Error("usage: relabel-library.ts <teamId>");
const rows = await db()
  .select({ id: cards.id })
  .from(cards)
  .where(and(eq(cards.teamId, teamId), isNull(cards.deletedAt)))
  .orderBy(sql`${cards.importedFrom}->>'uploadId'`, sql`(${cards.importedFrom}->>'blockIdx')::int`, cards.createdAt);
const ids = rows.map((r) => r.id);
const batches: { ids: string[]; before?: string }[] = [];
for (let i = 0; i < ids.length; i += 25) batches.push({ ids: ids.slice(i, i + 25), before: i ? ids[i - 1] : undefined });
let done = 0;
let next = 0;
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (next < batches.length) {
      const b = batches[next++];
      const n = await labelAndSave(teamId, b.ids, { before: b.before });
      done += n;
    }
  }),
);
console.log(`labeled ${done} of ${ids.length} cards`);
process.exit(0);
