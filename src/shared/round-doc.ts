/**
 * Round state as a Yjs document, shared by browser and server.
 *
 * Each entity is a Y.Map keyed by id inside a top-level map, so concurrent
 * edits to different fields of the same argument merge per field, and edits
 * to different arguments never conflict. Arrays are stored as plain JSON
 * values (last writer wins for that field).
 */

import * as Y from "yjs";
import type { ArgUnit, Decision, Position, Relation, RoundGraph } from "@/domain/flow";
import type { Side, SpeechId, SpeechStatus } from "@/domain/format";
import { SPEECH_IDS } from "@/domain/format";

export const RD = {
  positions: "positions",
  args: "args",
  relations: "relations",
  decisions: "decisions",
  slots: "slots",
  timers: "timers",
  strategy: "strategy",
} as const;

export interface SlotDocRef {
  uploadId: string;
  fileName: string;
  /** who the document belongs to */
  owner: "opponent" | "us";
  addedBy: string;
  addedAt: number;
}

export interface SlotRecord {
  speech: SpeechId;
  status: SpeechStatus;
  documents: SlotDocRef[];
  /** drafts (speech_draft document ids) for this speech; first is primary */
  draftIds: string[];
  deliveredDraftId: string | null;
  deliveredAt: number | null;
  /** free-form notes about what was actually said */
  notes: string;
  /** user confirmed that everything in the document(s) was read, except items marked not read */
  readConfirmed: boolean;
}

export interface TimerState {
  affPrepUsedMs: number;
  negPrepUsedMs: number;
  /** which clock is running */
  running: "aff_prep" | "neg_prep" | "speech" | null;
  /** server time (ms) when the running clock started */
  runningSince: number | null;
  speechSlot: string | null;
  speechElapsedMs: number;
}

export interface StrategyRecord {
  speech: SpeechId;
  /** user's instructions and preferences for this speech */
  instructions: string;
  /** chosen strategy summary (human-written or accepted from AI) */
  plan: string;
  /** position ids to go for / kick (rebuttals) */
  goFor: string[];
  kick: string[];
}

function entityMap(doc: Y.Doc, name: string): Y.Map<Y.Map<unknown>> {
  return doc.getMap(name) as Y.Map<Y.Map<unknown>>;
}

function toPlain<T>(m: Y.Map<unknown>): T {
  return m.toJSON() as T;
}

export function setFields(parent: Y.Map<Y.Map<unknown>>, id: string, fields: Record<string, unknown>): void {
  let m = parent.get(id);
  if (!m) {
    m = new Y.Map<unknown>();
    parent.set(id, m);
  }
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const cur = m.get(k);
    if (JSON.stringify(cur) !== JSON.stringify(v)) m.set(k, v);
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function readPositions(doc: Y.Doc): Position[] {
  return [...entityMap(doc, RD.positions).values()].map((m) => toPlain<Position>(m)).sort((a, b) => a.order - b.order);
}

export function readArgs(doc: Y.Doc): ArgUnit[] {
  return [...entityMap(doc, RD.args).values()]
    .map((m) => toPlain<ArgUnit & { deleted?: boolean }>(m))
    .filter((a) => !a.deleted)
    .map((a) => ({ cardIds: [], ...a }));
}

export function readRelations(doc: Y.Doc): Relation[] {
  return [...entityMap(doc, RD.relations).values()].map((m) => toPlain<Relation & { deleted?: boolean }>(m)).filter((r) => !r.deleted);
}

export function readDecisions(doc: Y.Doc): Decision[] {
  return [...entityMap(doc, RD.decisions).values()].map((m) => toPlain<Decision & { deleted?: boolean }>(m)).filter((d) => !d.deleted);
}

export function readGraph(doc: Y.Doc, ourSide: Side): RoundGraph {
  const args = readArgs(doc);
  const argIds = new Set(args.map((a) => a.id));
  return {
    ourSide,
    positions: readPositions(doc).filter((p) => !(p as Position & { deleted?: boolean }).deleted),
    args,
    // Dangling references (e.g. partner deleted the target concurrently) are dropped.
    relations: readRelations(doc)
      .map((r) => ({ ...r, to: r.to.filter((t) => argIds.has(t)) }))
      .filter((r) => argIds.has(r.from) && r.to.length > 0),
    decisions: readDecisions(doc),
  };
}

export function emptySlot(speech: SpeechId): SlotRecord {
  return { speech, status: "not_started", documents: [], draftIds: [], deliveredDraftId: null, deliveredAt: null, notes: "", readConfirmed: false };
}

/**
 * Slots and strategy records are keyed by speech ("2AC"), so both partners can
 * create the same record concurrently. Nested Y.Maps would lose one partner's
 * fields in that case, so these use flat keys: "<speech>.<field>".
 */
function flatRead<T extends object>(m: Y.Map<unknown>, prefix: string, base: T): T {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    const v = m.get(`${prefix}.${k}`);
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function flatWrite(m: Y.Map<unknown>, prefix: string, fields: Record<string, unknown>) {
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const key = `${prefix}.${k}`;
    if (JSON.stringify(m.get(key)) !== JSON.stringify(v)) m.set(key, v);
  }
}

export function readSlots(doc: Y.Doc): Record<SpeechId, SlotRecord> {
  const m = doc.getMap(RD.slots);
  const out = {} as Record<SpeechId, SlotRecord>;
  for (const s of SPEECH_IDS) out[s] = { ...flatRead(m, s, emptySlot(s)), speech: s };
  return out;
}

export function readTimers(doc: Y.Doc): TimerState {
  const m = doc.getMap(RD.timers);
  return {
    affPrepUsedMs: (m.get("affPrepUsedMs") as number) ?? 0,
    negPrepUsedMs: (m.get("negPrepUsedMs") as number) ?? 0,
    running: (m.get("running") as TimerState["running"]) ?? null,
    runningSince: (m.get("runningSince") as number) ?? null,
    speechSlot: (m.get("speechSlot") as string) ?? null,
    speechElapsedMs: (m.get("speechElapsedMs") as number) ?? 0,
  };
}

export function readStrategy(doc: Y.Doc, speech: SpeechId): StrategyRecord {
  const base: StrategyRecord = { speech, instructions: "", plan: "", goFor: [], kick: [] };
  return { ...flatRead(doc.getMap(RD.strategy), speech, base), speech };
}

// ---------------------------------------------------------------------------
// Writes (call inside doc.transact)
// ---------------------------------------------------------------------------

export function upsertPosition(doc: Y.Doc, p: Position): void {
  setFields(entityMap(doc, RD.positions), p.id, { ...p });
}

export function upsertArg(doc: Y.Doc, a: Partial<ArgUnit> & { id: string }, opts: { byHuman?: boolean } = {}): void {
  const existing = entityMap(doc, RD.args).get(a.id);
  if (existing && existing.get("humanEdited") && !opts.byHuman) {
    // Never let an automated refresh overwrite a human correction.
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a)) if (existing.get(k) === undefined) safe[k] = v;
    setFields(entityMap(doc, RD.args), a.id, safe);
    return;
  }
  setFields(entityMap(doc, RD.args), a.id, { ...a, ...(opts.byHuman ? { humanEdited: true } : {}) });
}

export function deleteArg(doc: Y.Doc, id: string): void {
  setFields(entityMap(doc, RD.args), id, { deleted: true });
}

export function upsertRelation(doc: Y.Doc, r: Relation): void {
  setFields(entityMap(doc, RD.relations), r.id, { ...r });
}

export function setRelationStatus(doc: Y.Doc, id: string, status: Relation["status"]): void {
  setFields(entityMap(doc, RD.relations), id, { status });
}

export function upsertDecision(doc: Y.Doc, d: Decision): void {
  setFields(entityMap(doc, RD.decisions), d.id, { ...d });
}

export function deleteDecision(doc: Y.Doc, id: string): void {
  setFields(entityMap(doc, RD.decisions), id, { deleted: true });
}

export function updateSlot(doc: Y.Doc, speech: SpeechId, fields: Partial<SlotRecord>): void {
  const { speech: _s, ...rest } = fields;
  flatWrite(doc.getMap(RD.slots), speech, rest as Record<string, unknown>);
}

export function updateStrategy(doc: Y.Doc, speech: SpeechId, fields: Partial<StrategyRecord>): void {
  const { speech: _s, ...rest } = fields;
  flatWrite(doc.getMap(RD.strategy), speech, rest as Record<string, unknown>);
}

export function updateTimers(doc: Y.Doc, fields: Partial<TimerState>): void {
  const m = doc.getMap(RD.timers);
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) m.set(k, v);
}

/** Start/stop a prep clock using server-synchronized time. */
export function togglePrep(doc: Y.Doc, side: Side, nowServerMs: number): void {
  const t = readTimers(doc);
  const key = side === "aff" ? "aff_prep" : "neg_prep";
  doc.transact(() => {
    if (t.running && t.runningSince != null) {
      const elapsed = Math.max(0, nowServerMs - t.runningSince);
      if (t.running === "aff_prep") updateTimers(doc, { affPrepUsedMs: t.affPrepUsedMs + elapsed });
      if (t.running === "neg_prep") updateTimers(doc, { negPrepUsedMs: t.negPrepUsedMs + elapsed });
      if (t.running === "speech") updateTimers(doc, { speechElapsedMs: t.speechElapsedMs + elapsed });
    }
    if (t.running === key) updateTimers(doc, { running: null, runningSince: null });
    else updateTimers(doc, { running: key, runningSince: nowServerMs });
  });
}

export function prepUsedMs(t: TimerState, side: Side, nowServerMs: number): number {
  const base = side === "aff" ? t.affPrepUsedMs : t.negPrepUsedMs;
  const key = side === "aff" ? "aff_prep" : "neg_prep";
  return t.running === key && t.runningSince != null ? base + Math.max(0, nowServerMs - t.runningSince) : base;
}

export function roundDocText(doc: Y.Doc): string {
  const parts: string[] = [];
  for (const p of readPositions(doc)) parts.push(p.name);
  for (const a of readArgs(doc)) parts.push([a.label, a.text, a.warrant].filter(Boolean).join(" "));
  return parts.join("\n");
}
