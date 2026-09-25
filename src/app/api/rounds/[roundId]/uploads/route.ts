import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { saveUpload } from "@/server/uploads";
import { SPEECH_IDS } from "@/domain/format";

export const maxDuration = 120;

/**
 * Upload a speech document (or pasted text) for a speech in this round.
 * The document is recorded as "documented, not confirmed delivered".
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ roundId: string }> }) => {
  const { roundId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "round", roundId);
  const form = await req.formData();
  const speech = String(form.get("speech") ?? "");
  const owner = String(form.get("owner") ?? "opponent");
  if (!(SPEECH_IDS as readonly string[]).includes(speech)) throw new HttpError(400, "Choose which speech this document is for.");
  if (owner !== "opponent" && owner !== "us") throw new HttpError(400, "Invalid owner.");
  const file = form.get("file");
  const pasted = form.get("text");
  let bytes: Uint8Array;
  let fileName: string;
  let mime: string;
  if (file instanceof File && file.size > 0) {
    bytes = new Uint8Array(await file.arrayBuffer());
    fileName = file.name || "upload";
    mime = file.type;
  } else if (typeof pasted === "string" && pasted.trim()) {
    const html = String(form.get("html") ?? "");
    bytes = new TextEncoder().encode(html.trim() ? html : pasted);
    fileName = html.trim() ? "pasted.html" : "pasted.txt";
    mime = html.trim() ? "text/html" : "text/plain";
  } else {
    throw new HttpError(400, "Attach a file or paste text.");
  }
  const saved = await saveUpload({
    teamId,
    userId: u.id,
    roundId,
    purpose: "speech_doc",
    fileName,
    bytes,
    mime,
    attribution: { speech, owner, confirmedDelivered: false, uploadedBy: u.id, uploadedAt: new Date().toISOString() },
  });
  return Response.json({ upload: { id: saved.id, fileName: saved.fileName, kind: saved.kind, quality: saved.quality, warnings: saved.warnings } });
});
