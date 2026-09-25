import { and, eq, gte } from "drizzle-orm";
import { handle, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { telemetry } from "@/server/db/schema";
import { costOf, TASK_LABEL } from "@/server/ai/cost";

/** The team's AI spend: this month by feature, and last month's total (standard API prices). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ teamId: string }> }) => {
  const { teamId } = await ctx.params;
  const u = await requireUser();
  await requireTeam(u.id, teamId);
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const rows = await db()
    .select({ name: telemetry.name, data: telemetry.data, createdAt: telemetry.createdAt })
    .from(telemetry)
    .where(and(eq(telemetry.teamId, teamId), eq(telemetry.kind, "ai"), eq(telemetry.ok, true), gte(telemetry.createdAt, lastMonth)));
  const byFeature = new Map<string, { calls: number; usd: number }>();
  let month = 0;
  let previous = 0;
  for (const r of rows) {
    const [task, model] = r.name.split(":");
    const data = r.data as { usage?: Parameters<typeof costOf>[1]; searches?: number } | null;
    // Web search also bills $10 per 1,000 searches.
    const usd = (costOf(model, data?.usage) ?? 0) + (data?.searches ?? 0) * 0.01;
    if (r.createdAt >= thisMonth) {
      month += usd;
      const label = TASK_LABEL[task] ?? task.replace(/_/g, " ");
      const e = byFeature.get(label) ?? { calls: 0, usd: 0 };
      e.calls++;
      e.usd += usd;
      byFeature.set(label, e);
    } else previous += usd;
  }
  return Response.json({
    month: { usd: +month.toFixed(2), byFeature: [...byFeature].map(([feature, v]) => ({ feature, calls: v.calls, usd: +v.usd.toFixed(2) })).sort((a, b) => b.usd - a.usd) },
    lastMonth: { usd: +previous.toFixed(2) },
    note: "Estimated from token counts at standard API prices; your provider's bill is the final word. Speech-to-text isn't included.",
  });
});
