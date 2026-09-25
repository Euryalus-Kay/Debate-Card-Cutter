import { z } from "zod";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { createCard, searchCards } from "@/server/cards";
import type { BodyBlock } from "@/domain/card";
import type { Citation } from "@/domain/citation";

export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  const q = url.searchParams.get("q") ?? "";
  const verification = url.searchParams.getAll("v");
  return Response.json({ cards: await searchCards(teamId, q, { limit: Number(url.searchParams.get("limit") ?? 30), verification }) });
});

const Body = z.object({
  teamId: z.string(),
  tag: z.string().min(1).max(2000),
  citation: z.unknown(),
  body: z.array(z.unknown()).min(1).max(400),
  commentary: z.string().max(10_000).optional(),
  labels: z.array(z.string().max(80)).max(20).optional(),
});

/** Manually created card (user_cut, unverified until checked against a source). */
export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Invalid card.");
  await requireTeam(u.id, parsed.data.teamId);
  const id = await createCard({
    teamId: parsed.data.teamId,
    userId: u.id,
    tag: parsed.data.tag,
    citation: parsed.data.citation as Citation,
    body: parsed.data.body as BodyBlock[],
    origin: "user_cut",
    verification: { status: "unverified", issues: [] },
    commentary: parsed.data.commentary,
    labels: parsed.data.labels,
  });
  return Response.json({ id });
});
