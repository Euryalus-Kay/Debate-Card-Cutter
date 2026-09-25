import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { aiAllowed } from "@/server/ai/policy";
import { getCards } from "@/server/cards";
import { findEvidence } from "@/server/library/find";

export const maxDuration = 60;

const Body = z.object({ roundId: z.string().min(1), claim: z.string().min(3).max(1000), context: z.string().max(500).optional() });

/**
 * Before cutting a new card (B4): does the team's library already have one that proves this claim for our
 * side? Uses the same fit check as drafts (and its cache), so asking twice costs nothing.
 */
export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Describe what the card should say.");
  await requireAccess(u.id, "round", p.data.roundId);
  const [round] = await db().select().from(rounds).where(eq(rounds.id, p.data.roundId));
  if (!aiAllowed(round)) throw new HttpError(403, "AI is turned off for this round (tournament rules setting).");
  const text = p.data.context?.trim() ? `${p.data.claim.trim()} (context: ${p.data.context.trim()})` : p.data.claim.trim();
  const found = await findEvidence(round.teamId, [{ id: "claim", text, intent: "support" }], { side: round.ourSide as "aff" | "neg", perNeed: 8, maxCards: 3 });
  const rows = await getCards(round.teamId, found.cardIds);
  const cards = found.cardIds
    .map((id) => rows.find((c) => c.id === id))
    .filter((c) => !!c)
    .map((c) => ({ id: c!.id, tag: c!.tag, shortCite: c!.shortCite, verificationStatus: c!.verificationStatus, fit: found.byCard.get(c!.id)?.[0]?.fit ?? 0, use: found.byCard.get(c!.id)?.[0]?.use ?? "" }));
  return Response.json({ cards, checked: !found.skipped, skipped: found.skipped ?? null });
});
