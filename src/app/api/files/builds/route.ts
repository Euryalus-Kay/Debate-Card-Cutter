import { after } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { createFileBuild, FileBuildInput, listFileBuilds, runFileBuild } from "@/server/files/build-job";
import { guardAi } from "@/server/limits";

export const maxDuration = 300;

const Body = z.object({ teamId: z.string().min(1), input: FileBuildInput });

/** Plan a new file (Phase E); nothing is researched until the team approves the plan. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Describe the argument (at least a few words).");
  await requireTeam(u.id, p.data.teamId);
  await guardAi("file_build", u.id, p.data.teamId);
  const jobId = await createFileBuild(p.data.teamId, u.id, p.data.input);
  after(() => runFileBuild(jobId));
  return Response.json({ jobId }, { status: 202 });
});

export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  return Response.json({ builds: await listFileBuilds(teamId) });
});
