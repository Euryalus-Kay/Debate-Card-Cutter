/**
 * Speech-to-text for flowing (Phase C): a short audio segment (or an uploaded
 * recording already in Blob) → text, with OpenAI gpt-transcribe on the team's
 * parent-owned account (OPENAI_API_KEY, set in the Vercel dashboard). No audio
 * is stored: segments are sent through, and an uploaded recording is deleted
 * from Blob as soon as its text returns. Without a key this answers 501 and the
 * browser uses Chrome's on-device speech recognition instead.
 */

import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { isTeamIncomingPath, readPrivateBlob } from "@/server/uploads";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { ruleSetOf } from "@/domain/rules";

export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024; // the transcription endpoint's per-request limit
const DEBATE_TERMS = "Policy debate speech. Terms: perm, permutation, counterplan, CP, disad, DA, kritik, K, topicality, T, uniqueness, non-unique, link turn, impact turn, condo, fiat, solvency, advantage, inherency, extend, cross-apply, 1AC, 1NC, 2AC, 2NC, 1NR, 1AR, 2NR, 2AR.";

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "Send the audio as a form upload.");
  const roundId = String(form.get("roundId") ?? "");
  await requireAccess(u.id, "round", roundId);
  const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
  if (ruleSetOf(round.settings as never).recording === "off") throw new HttpError(403, "This round's tournament rules don't allow recording. Type what you hear instead.");
  const pathname = form.get("pathname") ? String(form.get("pathname")) : null;
  if (pathname && !isTeamIncomingPath(round.teamId, pathname)) throw new HttpError(400, "That recording isn't in this team's uploads.");
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new HttpError(501, "Speech-to-text isn't set up on the server yet (OPENAI_API_KEY). Using this browser's own speech recognition instead.");

  // A segment recorded in the browser, or a recording uploaded to the team's storage first (too big for one
  // request body). Only the round's own team folder is read, and deleted after.
  let audio = form.get("audio") as File | null;
  if (!audio && pathname) {
    const bytes = await readPrivateBlob(pathname);
    if (bytes.byteLength > MAX_BYTES) {
      await del(pathname).catch(() => {});
      throw new HttpError(413, "That recording is over 25 MB. Upload one speech at a time (about 25 minutes of audio at most).");
    }
    const name = String(form.get("fileName") ?? "recording.m4a");
    audio = new File([bytes as BlobPart], name, { type: /\.webm$/i.test(name) ? "audio/webm" : /\.wav$/i.test(name) ? "audio/wav" : /\.mp3$/i.test(name) ? "audio/mpeg" : "audio/mp4" });
  }
  if (!audio || audio.size === 0) throw new HttpError(400, "No audio.");
  if (audio.size > MAX_BYTES) throw new HttpError(413, "That recording is over 25 MB. Upload one speech at a time (about 25 minutes of audio at most).");

  // Context helps with names and jargon: debate terms, the round's positions and authors, and the text just before.
  const context = [DEBATE_TERMS, String(form.get("keywords") ?? "").slice(0, 800), String(form.get("previous") ?? "").slice(-600)].filter(Boolean).join("\n");
  const body = new FormData();
  body.set("file", audio, audio.name || "segment.webm");
  body.set("model", "gpt-transcribe");
  body.set("prompt", context);
  body.set("response_format", "json");
  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${key}` }, body });
    if (!res.ok) throw new HttpError(502, `Speech-to-text failed (${res.status}). Keep typing; the recording will be tried again.`);
    const out = (await res.json()) as { text?: string };
    return Response.json({ text: (out.text ?? "").trim() });
  } finally {
    // Audio is never kept: an uploaded recording goes as soon as it's transcribed (or fails).
    if (pathname) await del(pathname).catch(() => {});
  }
});
