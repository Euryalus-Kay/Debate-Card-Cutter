/**
 * Re-highlight a card to a target length. Returns a PROPOSAL (new marks on the
 * same verbatim text) with its read-aloud text; nothing is saved here.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireAccess, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { aiAllowed } from "@/server/ai/policy";
import { highlightCard } from "@/server/research/highlight";
import { AiRunError } from "@/server/ai/run";
import { verbatimText, type BodyBlock } from "@/domain/card";

export const maxDuration = 120;

const Body = z.object({
  teamId: z.string(),
  roundId: z.string().optional(),
  tag: z.string().max(2000),
  body: z.array(z.unknown()).min(1).max(400),
  targetWords: z.number().int().min(8).max(400),
});

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Invalid highlight request.");
  const { teamId, roundId, tag, targetWords } = parsed.data;
  const body = parsed.data.body as BodyBlock[];
  await requireTeam(u.id, teamId);
  if (roundId) {
    const roundTeam = await requireAccess(u.id, "round", roundId);
    if (roundTeam !== teamId) throw new HttpError(404, "Not found.");
    const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
    if (!aiAllowed(round)) throw new HttpError(403, "AI is turned off for this round (tournament rules setting).");
  }
  if (!verbatimText(body).trim()) throw new HttpError(400, "This card has no text to highlight.");
  try {
    const r = await highlightCard({ tag, body, targetWords, teamId, repair: true });
    // Integrity: the proposal must have exactly the same words as the card.
    if (verbatimText(r.body) !== verbatimText(body)) throw new HttpError(500, "Highlighting changed the card text; refusing.");
    return Response.json({ body: r.body, read: r.read, metrics: { ...r.metrics, readText: undefined }, issues: r.issues, protectedWords: r.protectedWords, repaired: r.repaired, model: r.runs[r.runs.length - 1]?.model, ms: r.runs.reduce((a, x) => a + x.ms, 0) });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, e instanceof AiRunError ? e.message : "Highlighting failed. Try again.");
  }
});
