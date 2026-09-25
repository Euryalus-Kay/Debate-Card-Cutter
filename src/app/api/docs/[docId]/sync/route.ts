/**
 * Yjs sync over plain HTTPS (no WebSockets, so it works on restrictive
 * school/tournament networks). One request both pushes local updates and
 * pulls everything newer than `since`. Idempotent: resending is safe.
 */

import { after } from "next/server";
import { z } from "zod";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { compact, pull, push, stateVector } from "@/server/docs/store";
import { db } from "@/server/db/client";
import { documents, presence } from "@/server/db/schema";
import { extractDocText } from "@/shared/doc-text";
import { SCHEMA_HEADER } from "@/shared/editor/schema";

export const maxDuration = 30;

const Body = z.object({
  clientId: z.string().min(4).max(80),
  since: z.number().int().min(-1),
  updates: z.array(z.string().max(6_000_000)).max(50),
  presence: z
    .object({
      section: z.string().max(80).optional(),
      activity: z.enum(["editing", "viewing"]).optional(),
      name: z.string().max(80).optional(),
    })
    .nullable()
    .optional(),
  wantStateVector: z.boolean().optional(),
});

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

/** Oldest editor schema allowed to sync (see EDITOR_SCHEMA_VERSION). Older tabs could strip newer attributes. */
const MIN_CLIENT_SCHEMA = 2;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ docId: string }> }) => {
  const { docId } = await ctx.params;
  const u = await requireUser();
  if (Number(req.headers.get(SCHEMA_HEADER) ?? 0) < MIN_CLIENT_SCHEMA)
    throw new HttpError(426, "This tab is running an older version of Clash. Reload the page to keep syncing; your edits are saved on this device.");
  await requireAccess(u.id, "document", docId);
  const raw = await req.text();
  if (raw.length > 4_400_000) throw new HttpError(413, "Too much data in one request; the client will send it in smaller pieces.");
  const parsed = Body.safeParse(JSON.parse(raw || "null"));
  if (!parsed.success) throw new HttpError(400, "Malformed sync request.");
  const body = parsed.data;

  const pushed = body.updates.length
    ? await push(
        docId,
        body.updates.map((s) => new Uint8Array(Buffer.from(s, "base64"))),
        { clientId: body.clientId, userId: u.id, origin: "user" },
      )
    : { accepted: 0, duplicates: 0, rejected: 0, seqs: [] };

  const [pulled, others] = await Promise.all([
    pull(docId, body.since),
    (async () => {
      if (body.presence) {
        await db()
          .insert(presence)
          .values({ docId, clientId: body.clientId, userId: u.id, state: { ...body.presence, name: body.presence.name ?? u.name }, seenAt: new Date() })
          .onConflictDoUpdate({
            target: [presence.docId, presence.clientId],
            set: { state: { ...body.presence, name: body.presence.name ?? u.name }, seenAt: new Date(), userId: u.id },
          });
      }
      return db()
        .select({ clientId: presence.clientId, userId: presence.userId, state: presence.state, seenAt: presence.seenAt })
        .from(presence)
        .where(and(eq(presence.docId, docId), ne(presence.clientId, body.clientId), gt(presence.seenAt, sql`now() - interval '30 seconds'`)));
    })(),
  ]);

  const sv = body.wantStateVector ? b64((await stateVector(docId)).sv) : undefined;

  // Opportunistic compaction after the response is sent.
  if (pulled.updates.length > 150) {
    after(async () => {
      const [doc] = await db().select({ kind: documents.kind }).from(documents).where(eq(documents.id, docId));
      await compact(docId, (y) => extractDocText(y, doc?.kind ?? "notes")).catch((e) => console.error("compact failed", e));
    });
  }

  return Response.json({
    headSeq: pulled.headSeq,
    snapshotSeq: pulled.snapshotSeq,
    snapshot: pulled.snapshot ? b64(pulled.snapshot) : undefined,
    // Skip echoing this request's own updates back.
    updates: pulled.updates.filter((x) => !pushed.seqs.includes(x.seq)).map((x) => ({ seq: x.seq, u: b64(x.update) })),
    accepted: pushed.accepted,
    duplicates: pushed.duplicates,
    rejected: pushed.rejected,
    serverTime: Date.now(),
    presence: others,
    stateVector: sv,
  });
});
