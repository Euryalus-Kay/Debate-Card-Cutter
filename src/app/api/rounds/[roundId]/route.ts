import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { getRoundBundle, RoundInput } from "@/server/rounds";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";

type Ctx = { params: Promise<{ roundId: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { roundId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "round", roundId);
  const bundle = await getRoundBundle(roundId);
  if (!bundle) throw new HttpError(404, "Not found.");
  return Response.json(bundle);
});

const Patch = RoundInput.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
  aiOverride: z.object({ by: z.string().max(80), at: z.string().max(40), reason: z.string().min(4).max(500) }).nullable().optional(),
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { roundId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "round", roundId);
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw) throw new HttpError(400, "Invalid round settings.");
  // Only validate keys that were actually sent (defaults must not overwrite stored values).
  const parsed = Patch.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) if (k in parsed.data) patch[k] = (parsed.data as Record<string, unknown>)[k];
  delete patch.teamId;
  await db()
    .update(rounds)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(rounds.id, roundId));
  return Response.json({ ok: true });
});
