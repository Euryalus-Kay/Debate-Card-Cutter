import { after } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { createImportJob, ImportInput, listImportJobs, runImportJob } from "@/server/library/import-job";
import { isTeamIncomingPath } from "@/server/uploads";
import { guardAi } from "@/server/limits";

export const maxDuration = 300;

const Body = ImportInput.extend({ teamId: z.string().min(1) });

/** Start importing a file already uploaded to the team's Blob folder. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Invalid import.");
  const { teamId, ...input } = p.data;
  await requireTeam(u.id, teamId);
  await guardAi("import", u.id, teamId);
  if (!isTeamIncomingPath(teamId, input.pathname)) throw new HttpError(400, "That file isn't in this team's uploads.");
  const jobId = await createImportJob(teamId, u.id, input);
  after(() => runImportJob(jobId));
  return Response.json({ jobId }, { status: 202 });
});

export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  return Response.json({ jobs: await listImportJobs(teamId) });
});
