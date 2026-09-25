import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { saveUpload } from "@/server/uploads";
import { importCardsFromUpload } from "@/server/cards";

export const maxDuration = 300;

/** Upload a file of evidence (camp file, backfiles) straight into the library. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const form = await req.formData();
  const teamId = String(form.get("teamId") ?? "");
  await requireTeam(u.id, teamId);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Attach a file.");
  const saved = await saveUpload({ teamId, userId: u.id, purpose: "library_file", fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type });
  const label = file.name.replace(/\.(docx|pdf|txt)$/i, "").slice(0, 80);
  const imported = await importCardsFromUpload(saved.id, teamId, u.id, [label]);
  return Response.json({ upload: { id: saved.id, quality: saved.quality, warnings: saved.warnings }, imported });
});
