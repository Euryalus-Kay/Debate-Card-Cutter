/**
 * Library retrieval check (B2) with the real model: for a round and speech, which library cards the
 * fit check offers and why, with timing and cost. Prints to the console (local use); saves only counts.
 *
 *   npx tsx --env-file=.env.local scripts/bench/evidence-fit.ts <roundId> <speech> [out.json]
 */
import { writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cards, rounds } from "@/server/db/schema";
import { buildRoundContext } from "@/server/ai/context";
import type { SpeechId } from "@/domain/format";

const [roundId, speech, out] = process.argv.slice(2);
const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
const [{ n }] = (await db().select({ n: sql<number>`count(*)::int` }).from(cards).where(eq(cards.teamId, round.teamId))) as { n: number }[];
const t0 = Date.now();
const ctx = await buildRoundContext(roundId, { speech: speech as SpeechId, evidenceMode: "selected_plus_library" });
const ms = Date.now() - t0;
const needs = ctx.coverage?.items.filter((i) => i.status === "unanswered" || i.status === "uncertain") ?? [];
console.log(`library: ${n} cards; needs: ${needs.length}; check: ${JSON.stringify(ctx.libraryCheck)}; context built in ${ms} ms`);
const text = ctx.text.split("\n");
const start = text.findIndex((l) => l.startsWith("Library cards checked"));
if (start >= 0) for (const l of text.slice(start, start + 80)) if (/^\[|FITS|^Library/.test(l.trim())) console.log(l.slice(0, 260));
if (out) writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), note: "Counts only.", speech, libraryCards: n, needs: needs.length, check: ctx.libraryCheck, contextMs: ms }, null, 2));
