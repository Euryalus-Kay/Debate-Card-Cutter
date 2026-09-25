import { ruleSetOf } from "@/domain/rules";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { atomic, db } from "@/server/db/client";
import { documents, rounds, uploads } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { FORMATS } from "@/domain/format";

export const RoundInput = z.object({
  title: z.string().trim().max(160).default(""),
  tournament: z.string().trim().max(160).default(""),
  roundLabel: z.string().trim().max(60).default(""),
  division: z.string().trim().max(60).default(""),
  resolution: z.string().trim().max(600).default(""),
  formatId: z.string().refine((v) => v in FORMATS, "unknown format").default("hs-standard"),
  ourSide: z.enum(["aff", "neg"]),
  roster: z.partialRecord(z.enum(["1A", "2A", "1N", "2N"]), z.string().max(80)).default({}),
  opponent: z
    .object({ school: z.string().max(160).default(""), code: z.string().max(80).default(""), names: z.string().max(200).default("") })
    .default({ school: "", code: "", names: "" }),
  judges: z
    .array(z.object({ name: z.string().max(120).default(""), paradigmText: z.string().max(40_000).default(""), paradigmUrl: z.string().max(500).default(""), notes: z.string().max(4000).default("") }))
    .max(5)
    .default([]),
  formatOverrides: z
    .object({
      constructiveSeconds: z.number().int().min(60).max(900).optional(),
      rebuttalSeconds: z.number().int().min(60).max(900).optional(),
      cxSeconds: z.number().int().min(0).max(600).optional(),
      prepSecondsPerTeam: z.number().int().min(0).max(1800).optional(),
      newArgumentPolicy: z.enum(["conventional", "strict", "permissive"]).optional(),
    })
    .default({}),
  /** derived from settings.ruleSet when that is given (see src/domain/rules.ts); the team default is "allowed" */
  aiPolicy: z.enum(["allowed", "prep_only", "off"]).default("allowed"),
  phase: z.enum(["prep", "live", "done"]).default("prep"),
  speakerOverrides: z.partialRecord(z.enum(["1AC", "1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"]), z.string().max(80)).default({}),
  settings: z
    .object({
      omissionPolicy: z.enum(["nsda", "permissive"]).optional(),
      judgeKick: z.enum(["yes", "no", "if_asked", "unknown"]).optional(),
      /** tournament rule for prep overage: warn only, or deduct it from the team's next speech (e.g. KSHSAA, NDT) */
      prepOverage: z.enum(["warn", "deduct"]).optional(),
      /** tournament rule set (COMP-1): decides in-round AI and recording */
      ruleSet: z.enum(["ai_allowed", "nsda", "uil", "ohio", "tournament_allows", "practice"]).optional(),
      /** the tournament's own AI rule, pasted by the team */
      ruleText: z.string().max(4000).optional(),
    })
    .default({}),
});

export type RoundInputT = z.infer<typeof RoundInput>;

export async function createRound(teamId: string, userId: string, input: RoundInputT): Promise<{ id: string; stateDocId: string }> {
  const id = newId("rnd");
  const stateDocId = newId("doc");
  const title = input.title || [input.tournament, input.roundLabel && `R${input.roundLabel}`, input.opponent.code && `vs ${input.opponent.code}`].filter(Boolean).join(" · ") || "New round";
  await atomic((d) => [
    d.insert(rounds).values({
      id,
      teamId,
      title,
      tournament: input.tournament,
      roundLabel: input.roundLabel,
      division: input.division,
      resolution: input.resolution,
      formatId: input.formatId,
      formatOverrides: input.formatOverrides,
      ourSide: input.ourSide,
      roster: input.roster,
      opponent: input.opponent,
      judges: input.judges,
      aiPolicy: input.settings.ruleSet ? ruleSetOf(input.settings).aiPolicy : input.aiPolicy,
      phase: input.phase,
      speakerOverrides: input.speakerOverrides,
      settings: input.settings,
      stateDocId,
      createdBy: userId,
    }),
    d.insert(documents).values({ id: stateDocId, teamId, kind: "round_state", roundId: id, title: `${title} — flow`, createdBy: userId }),
  ]);
  return { id, stateDocId };
}

export async function listRounds(teamId: string) {
  return db()
    .select({
      id: rounds.id,
      title: rounds.title,
      tournament: rounds.tournament,
      roundLabel: rounds.roundLabel,
      ourSide: rounds.ourSide,
      opponent: rounds.opponent,
      status: rounds.status,
      phase: rounds.phase,
      updatedAt: rounds.updatedAt,
      createdAt: rounds.createdAt,
    })
    .from(rounds)
    .where(eq(rounds.teamId, teamId))
    .orderBy(desc(rounds.updatedAt))
    .limit(200);
}

export async function getRoundBundle(roundId: string) {
  const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
  if (!round) return null;
  const drafts = await db()
    .select({ id: documents.id, speech: documents.speech, title: documents.title, variant: documents.variant, status: documents.status, updatedAt: documents.updatedAt, deliveredAt: documents.deliveredAt, createdBy: documents.createdBy })
    .from(documents)
    .where(and(eq(documents.roundId, roundId), eq(documents.kind, "speech_draft")))
    .orderBy(documents.createdAt);
  const ups = await db()
    .select({ id: uploads.id, fileName: uploads.fileName, attribution: uploads.attribution, parseResult: uploads.parseResult, createdAt: uploads.createdAt, createdBy: uploads.createdBy, status: uploads.status })
    .from(uploads)
    .where(eq(uploads.roundId, roundId))
    .orderBy(uploads.createdAt);
  return {
    round,
    drafts,
    uploads: ups.map((u) => {
      const pr = (u.parseResult ?? {}) as { quality?: unknown; warnings?: string[]; kind?: string };
      return { ...u, parseResult: { quality: pr.quality, warnings: pr.warnings ?? [], kind: pr.kind } };
    }),
  };
}

export async function createDraft(args: { teamId: string; roundId: string; speech: string; userId: string; variant?: string; title?: string }): Promise<string> {
  const id = newId("doc");
  await db()
    .insert(documents)
    .values({
      id,
      teamId: args.teamId,
      kind: "speech_draft",
      roundId: args.roundId,
      speech: args.speech,
      title: args.title ?? `${args.speech} draft`,
      variant: args.variant ?? "",
      createdBy: args.userId,
    });
  await db().update(rounds).set({ updatedAt: new Date() }).where(eq(rounds.id, args.roundId));
  return id;
}
