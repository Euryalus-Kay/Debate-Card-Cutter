/**
 * Measured AI cost per task from telemetry (standard API prices, USD per million tokens;
 * docs/research/models-and-providers.md §1.1). Cache reads bill at the cache-read rate.
 */
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { costOf } from "@/server/ai/cost";

const rows = (await db().execute(sql`select name, ms, ok, data from telemetry where kind = 'ai' and ok = true order by id`)).rows as { name: string; ms: number; data: { usage?: Parameters<typeof costOf>[1] & { inputTokens?: number; outputTokens?: number } } | null }[];
const by = new Map<string, { n: number; cost: number; ms: number; inTok: number; outTok: number }>();
for (const r of rows) {
  const [task, model] = r.name.split(":");
  const u = r.data?.usage;
  const cost = costOf(model, u);
  if (cost === null || !u) continue;
  const k = `${task} (${model})`;
  const e = by.get(k) ?? { n: 0, cost: 0, ms: 0, inTok: 0, outTok: 0 };
  e.n++;
  e.cost += cost;
  e.ms += r.ms;
  e.inTok += u.inputTokens ?? 0;
  e.outTok += u.outputTokens ?? 0;
  by.set(k, e);
}
console.log("task (model) | calls | avg cost | avg seconds | avg in/out tokens");
for (const [k, e] of [...by].sort((a, b) => b[1].cost / b[1].n - a[1].cost / a[1].n)) console.log(`${k} | ${e.n} | $${(e.cost / e.n).toFixed(3)} | ${(e.ms / e.n / 1000).toFixed(1)} | ${Math.round(e.inTok / e.n)}/${Math.round(e.outTok / e.n)}`);
