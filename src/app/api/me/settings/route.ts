import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { userSettings } from "@/server/db/schema";

export const GET = handle(async () => {
  const u = await requireUser();
  const [row] = await db().select().from(userSettings).where(eq(userSettings.userId, u.id));
  return Response.json({ rateProfile: row?.rateProfile ?? null, preferences: row?.preferences ?? {} });
});

const Body = z.object({ rateProfile: z.unknown().optional(), preferences: z.record(z.string(), z.unknown()).optional() });

export const PUT = handle(async (req: Request) => {
  const u = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Invalid settings.");
  const values = { userId: u.id, ...(parsed.data.rateProfile !== undefined ? { rateProfile: parsed.data.rateProfile } : {}), ...(parsed.data.preferences ? { preferences: parsed.data.preferences } : {}), updatedAt: new Date() };
  await db()
    .insert(userSettings)
    .values(values)
    .onConflictDoUpdate({ target: userSettings.userId, set: values });
  return Response.json({ ok: true });
});
