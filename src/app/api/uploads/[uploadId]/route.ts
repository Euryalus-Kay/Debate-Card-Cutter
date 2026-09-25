import { and, inArray, isNull, eq } from "drizzle-orm";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { uploadWithBlocks } from "@/server/uploads";
import { db } from "@/server/db/client";
import { cards } from "@/server/db/schema";
import { bodyHash, type BodyBlock } from "@/domain/card";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ uploadId: string }> }) => {
  const { uploadId } = await ctx.params;
  const u = await requireUser();
  await requireAccess(u.id, "upload", uploadId);
  const data = await uploadWithBlocks(uploadId);
  if (!data) throw new HttpError(404, "Not found.");
  const pr = (data.upload.parseResult ?? {}) as Record<string, unknown>;
  // Map each card in the file to the team's library card with the same text (imported or already there).
  const hashes = new Map<number, string>();
  for (const b of data.blocks) {
    const body = (b.data as { body?: BodyBlock[] } | null)?.body;
    if (b.kind === "card" && body?.length) hashes.set(b.idx, await bodyHash(body));
  }
  const found = hashes.size
    ? await db()
        .select({ id: cards.id, bodyHash: cards.bodyHash })
        .from(cards)
        .where(and(eq(cards.teamId, data.upload.teamId), inArray(cards.bodyHash, [...new Set(hashes.values())]), isNull(cards.deletedAt)))
    : [];
  const byHash = new Map(found.map((c) => [c.bodyHash, c.id]));
  const cardIds = Object.fromEntries([...hashes].map(([idx, h]) => [idx, byHash.get(h) ?? null]));
  return Response.json({ upload: { ...data.upload, parseResult: { ...pr, plainText: undefined } }, blocks: data.blocks, cardIds });
});
