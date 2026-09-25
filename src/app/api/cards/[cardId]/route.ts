import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { getCards, updateCard } from "@/server/cards";
import { db } from "@/server/db/client";
import { cardRevisions, cards, sources } from "@/server/db/schema";
import { and, desc, eq } from "drizzle-orm";
import type { BodyBlock } from "@/domain/card";
import type { Citation } from "@/domain/citation";

type Ctx = { params: Promise<{ cardId: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { cardId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "card", cardId);
  const [card] = await getCards(teamId, [cardId]);
  if (!card) throw new HttpError(404, "Not found.");
  const revisions = await db().select({ id: cardRevisions.id, version: cardRevisions.version, reason: cardRevisions.reason, createdAt: cardRevisions.createdAt }).from(cardRevisions).where(eq(cardRevisions.cardId, cardId)).orderBy(desc(cardRevisions.version)).limit(50);
  const source = card.sourceId
    ? (await db().select({ id: sources.id, url: sources.url, title: sources.title, retrieval: sources.retrieval, access: sources.access, textLength: sources.textLength }).from(sources).where(eq(sources.id, card.sourceId)))[0] ?? null
    : null;
  return Response.json({ card, revisions, source });
});

const Patch = z.object({
  tag: z.string().max(2000).optional(),
  body: z.array(z.unknown()).max(400).optional(),
  citation: z.unknown().optional(),
  commentary: z.string().max(10_000).optional(),
  labels: z.array(z.string().max(80)).max(20).optional(),
  reason: z.string().max(200).optional(),
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { cardId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "card", cardId);
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Invalid update.");
  const { reason, ...patch } = parsed.data;
  await updateCard(teamId, cardId, u.id, { ...patch, body: patch.body as BodyBlock[] | undefined, citation: patch.citation as Citation | undefined }, reason ?? "edit");
  return Response.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { cardId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "card", cardId);
  // Soft delete: recoverable.
  await db().update(cards).set({ deletedAt: new Date() }).where(and(eq(cards.id, cardId), eq(cards.teamId, teamId)));
  return Response.json({ ok: true });
});
