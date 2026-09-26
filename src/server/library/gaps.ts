/**
 * A coach's review of the team's library against the season's topic: what each position has, what is thin or
 * missing, the cards and blocks to get first, and arguments worth building that fewer teams run. Built from
 * the cards' labels and the analytics blocks (never the cards' full text). The model describes the kind of
 * source to look for; it never names a finding it hasn't seen. A review runs as a job, so partners see the
 * same one.
 */

import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { analyticsBank, cards, jobs } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { runStructured } from "@/server/ai/run";
import { CURRENT_TOPIC } from "@/domain/topics";
import type { CardMeta } from "@/domain/card-label";

const Spec = z.object({
  claim: z.string().describe("the claim the card must prove, as a tag would say it"),
  source: z.string().describe("the kind of source likely to say it (e.g. 'CBO or Urban Institute cost estimate', 'polling of swing-state voters'); never a specific finding you haven't seen"),
});

export const GapReviewSchema = z.object({
  summary: z.string().describe("two or three sentences: how ready the library is and what to do first"),
  positions: z.array(
    z.object({
      side: z.enum(["aff", "neg"]),
      name: z.string(),
      status: z.enum(["ready", "thin", "missing"]).describe("ready: every speech it's read in has what it needs; thin: holes; missing: a core argument on this topic the team has nothing for"),
      have: z.string().describe("what the library has for it, in one line"),
      missing: z.array(z.string()).describe("the specific parts missing (e.g. '2AC answer to the states CP's ERISA problem', '1AR extension of the link turn')"),
    }),
  ),
  gaps: z.array(
    z.object({
      side: z.enum(["aff", "neg"]),
      title: z.string(),
      why: z.string().describe("why it matters: who runs the argument this answers, or which speech needs it"),
      priority: z.number().int().min(1).max(3).describe("1 = needed for the next tournament; 3 = nice to have"),
      kind: z.enum(["cards", "block", "file"]),
      cards: z.array(Spec).describe("the cards to find first (at most 4)"),
    }),
  ),
  ideas: z.array(
    z.object({
      side: z.enum(["aff", "neg"]),
      kind: z.enum(["aff", "advantage", "add_on", "disad", "counterplan", "kritik", "topicality", "theory", "case_turn"]),
      title: z.string(),
      pitch: z.string().describe("the argument in two sentences: claim and why it wins"),
      whyUnique: z.string().describe("why fewer teams will be ready for it, and the literature it rests on (described, not quoted)"),
      firstCards: z.array(Spec).describe("the first cards to cut (at most 3)"),
    }),
  ),
});
export type GapReview = z.infer<typeof GapReviewSchema>;

const ROLE_SHORT: Record<string, string> = { uniqueness: "U", link: "L", internal_link: "IL", impact: "I", solvency: "solvency", answer: "answers", turn: "turns", alternative: "alt", perm: "perm", interpretation: "interp", standard: "standards", framework: "FW", other: "other" };

/** The library in a few lines per position: counts by role, speeches, analytics blocks, and sample claims. */
export async function libraryInventory(teamId: string): Promise<{ text: string; cards: number; blocks: number; positions: number }> {
  const rows = await db()
    .select({ shortCite: cards.shortCite, meta: cards.meta, verificationStatus: cards.verificationStatus })
    .from(cards)
    .where(and(eq(cards.teamId, teamId), isNull(cards.deletedAt)));
  const bank = await db().select({ side: analyticsBank.side, position: analyticsBank.position, title: analyticsBank.title, answers: analyticsBank.answers }).from(analyticsBank).where(eq(analyticsBank.teamId, teamId));
  type Group = { side: string; name: string; n: number; roles: Map<string, number>; speeches: Set<string>; verified: number; claims: { role: string; claim: string; cite: string }[]; blocks: string[] };
  const groups = new Map<string, Group>();
  const group = (side: string, name: string) => {
    const key = `${side}|${name.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { side, name, n: 0, roles: new Map(), speeches: new Set(), verified: 0, claims: [], blocks: [] }));
    return g;
  };
  for (const r of rows) {
    const m = (r.meta ?? {}) as Partial<CardMeta>;
    const g = group(m.side ?? "either", (m.position || "(unlabeled)").trim().slice(0, 60));
    g.n++;
    const role = m.role ?? "other";
    g.roles.set(role, (g.roles.get(role) ?? 0) + 1);
    for (const s of m.speeches ?? []) g.speeches.add(s);
    if (r.verificationStatus === "verified" || r.verificationStatus === "verified_quote_only") g.verified++;
    if (m.claim && g.claims.filter((c) => c.role === role).length < 2 && g.claims.length < 5) g.claims.push({ role, claim: m.claim, cite: r.shortCite });
  }
  for (const b of bank) {
    const g = group(b.side || "either", (b.position || "(no position)").trim().slice(0, 60));
    if (g.blocks.length < 10) g.blocks.push((b.answers ? `AT ${b.answers}` : b.title).slice(0, 70));
  }
  const order = { aff: 0, neg: 1, either: 2 } as Record<string, number>;
  const list = [...groups.values()].sort((a, b) => (order[a.side] ?? 3) - (order[b.side] ?? 3) || b.n + b.blocks.length - (a.n + a.blocks.length));
  const lines: string[] = [];
  for (const g of list) {
    const roles = [...g.roles.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${ROLE_SHORT[r] ?? r} ${n}`).join(", ");
    lines.push(`${g.side.toUpperCase()} · ${g.name} — ${g.n} card${g.n === 1 ? "" : "s"}${roles ? ` (${roles})` : ""}${g.speeches.size ? `; read in ${[...g.speeches].join("/")}` : ""}${g.verified ? `; ${g.verified} checked against sources` : ""}`);
    if (g.blocks.length) lines.push(`   analytics blocks: ${g.blocks.join("; ")}`);
    for (const c of g.claims.slice(0, g.n >= 6 ? 5 : 2)) lines.push(`   e.g. [${ROLE_SHORT[c.role] ?? c.role}] ${c.claim.slice(0, 160)} (${c.cite})`);
  }
  let text = lines.join("\n");
  if (text.length > 16_000) text = `${text.slice(0, 16_000)}\n… (more positions not shown)`;
  return { text: text || "(the library is empty)", cards: rows.length, blocks: bank.length, positions: groups.size };
}

const SYSTEM = `You are an experienced high school policy debate coach reviewing a team's evidence library against this season's topic. The team imported its files and speech docs; you see a summary of every position: its cards by role (U uniqueness, L link, IL internal link, I impact, answers, turns…), the speeches they're read in, the team's analytics blocks, and sample claims.
Say:
- summary: how ready the library is and what to do first.
- positions: every position the team has, plus core positions on this topic it has nothing for. For each: ready, thin or missing; what it has; the specific parts missing for each speech it is read in (1NC shell parts; 2NC/1NR extensions and answers to the likely 2AC; 2AC answers; 1AR extensions; rebuttal impact comparison).
- gaps: the most important holes, highest priority first (priority 1 = needed for the next tournament). Answers to the arguments the team will face most (the core negs against its affs, the core affs against its negs) come before extensions, and extensions before new positions. For each, the first cards to find: the claim, and the kind of source likely to say it.
- ideas: arguments worth building that are strong in the literature but that fewer teams will be ready for (a less common advantage or add-on, a case turn, a specific counterplan, a disad with fresh uniqueness, a theory or topicality angle), for both sides. Each must rest on literature that exists; describe the kind of source, never a finding you haven't seen.
Rules: be specific to this topic and to what the library shows; don't repeat what the library already covers well; never invent authors, studies, numbers or quotes; aim for about 8–14 positions, 6–12 gaps and 5–8 ideas.`;

function fakeReview(inv: { cards: number; blocks: number }): GapReview {
  return {
    summary: `[AI_FAKE] ${inv.cards} cards and ${inv.blocks} analytics blocks reviewed.`,
    positions: [{ side: "neg", name: "Midterms DA", status: "thin", have: "[AI_FAKE] links and uniqueness", missing: ["2NC answers to 'no link — the plan is unpopular'"] }],
    gaps: [{ side: "aff", title: "[AI_FAKE] Answers to the states CP", why: "Every camp wrote it.", priority: 1, kind: "cards", cards: [{ claim: "ERISA preempts state single payer", source: "a health law review article" }] }],
    ideas: [{ side: "neg", kind: "case_turn", title: "[AI_FAKE] Hospital closures turn", pitch: "Medicare rates close rural hospitals.", whyUnique: "Few teams cut it.", firstCards: [{ claim: "Medicare-rate payment closes rural hospitals", source: "a hospital finance study" }] }],
  };
}

export async function reviewLibrary(teamId: string, opts: { focus?: string; abortSignal?: AbortSignal } = {}): Promise<{ review: GapReview; inventory: { cards: number; blocks: number; positions: number } }> {
  const inv = await libraryInventory(teamId);
  const prompt = [CURRENT_TOPIC.brief, "", "THE TEAM'S LIBRARY (from its cards' labels and its analytics blocks)", inv.text, opts.focus ? `\nTHE TEAM ASKS: ${opts.focus.slice(0, 600)}` : "", "\nReview the library."].join("\n");
  const res = await runStructured({ task: "library_gaps", system: SYSTEM, prompt, schema: GapReviewSchema, teamId, abortSignal: opts.abortSignal, fake: () => fakeReview(inv) });
  return { review: res.output, inventory: { cards: inv.cards, blocks: inv.blocks, positions: inv.positions } };
}

export async function createGapJob(teamId: string, userId: string, focus?: string): Promise<string> {
  const id = newId("job");
  await db().insert(jobs).values({ id, teamId, kind: "library_gaps", status: "running", input: { focus: focus ?? "" }, checkpoint: {}, progress: [], createdBy: userId });
  return id;
}

export async function runGapJob(jobId: string): Promise<void> {
  const [job] = await db().select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.kind, "library_gaps")));
  if (!job || job.status !== "running") return;
  try {
    const result = await reviewLibrary(job.teamId, { focus: (job.input as { focus?: string }).focus || undefined });
    await db().update(jobs).set({ status: "succeeded", result, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  } catch (e) {
    await db().update(jobs).set({ status: "failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 500), updatedAt: new Date() }).where(eq(jobs.id, jobId));
  }
}

/** The team's latest review; one still "running" after ten minutes was interrupted. */
export async function latestGapJob(teamId: string) {
  const [job] = await db()
    .select({ id: jobs.id, status: jobs.status, result: jobs.result, error: jobs.error, input: jobs.input, createdAt: jobs.createdAt, updatedAt: jobs.updatedAt, createdBy: jobs.createdBy })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "library_gaps")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (job && job.status === "running" && Date.now() - job.createdAt.getTime() > 10 * 60_000) return { ...job, status: "failed" as const, error: "The review was interrupted. Start it again." };
  return job ?? null;
}
