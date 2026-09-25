/**
 * Direct browser → Blob uploads (Phase B1/C): the browser asks here for a
 * short-lived token scoped to one path in the team's folder, then sends the
 * file straight to storage (no 4.5 MB request limit). Evidence files up to
 * 50 MB; recordings up to 25 MB.
 */

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { MAX_IMPORT_BYTES } from "@/server/library/import-job";

const Payload = z.object({ teamId: z.string().min(1), purpose: z.enum(["library", "recording"]) });

const TYPES = {
  library: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/pdf", "text/plain", "application/octet-stream"],
  recording: ["audio/*", "video/webm", "application/octet-stream"],
};

export const POST = handle(async (request: Request) => {
  const u = await requireUser();
  const body = (await request.json()) as HandleUploadBody;
  const json = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const p = Payload.safeParse(JSON.parse(clientPayload ?? "{}"));
      if (!p.success) throw new HttpError(400, "Invalid upload.");
      await requireTeam(u.id, p.data.teamId);
      if (!pathname.startsWith(`teams/${p.data.teamId}/incoming/`)) throw new HttpError(400, "Invalid upload path.");
      return {
        allowedContentTypes: TYPES[p.data.purpose],
        maximumSizeInBytes: p.data.purpose === "library" ? MAX_IMPORT_BYTES : 25 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: u.id, teamId: p.data.teamId }),
      };
    },
  });
  return Response.json(json);
});
