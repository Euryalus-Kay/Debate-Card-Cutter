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
import type { CxId, Side, SpeechId, SpeechStatus } from "@/domain/format";
import { SPEECH_IDS } from "@/domain/format";

export const RD = {
  positions: "positions",
  args: "args",
  relations: "relations",
  decisions: "decisions",
  slots: "slots",
  timers: "timers",
  strategy: "strategy",
  prefs: "prefs",
} as const;

/** Team preferences for this round, shared live between partners. */
export interface RoundPrefs {
  /** after each flow update from their speech, update the draft of our next speech with answers to the new arguments */
  predraft: boolean;
}

export function readPrefs(doc: Y.Doc): RoundPrefs {
  const m = doc.getMap(RD.prefs);
  return { predraft: m.get("predraft") === true };
}

export function updatePrefs(doc: Y.Doc, fields: Partial<RoundPrefs>): void {
  const m = doc.getMap(RD.prefs);
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) m.set(k, v);
}

export interface SlotRecord {
  speech: SpeechId;
  status: SpeechStatus;
  /** the draft marked as delivered (drafts and uploads themselves are listed from the database) */
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
    .map((a) => ({ ...a, cardIds: a.cardIds ?? [] }));
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
  return { speech, status: "not_started", deliveredDraftId: null, deliveredAt: null, notes: "", readConfirmed: false };
}

/**
 * Slots and strategy records are keyed by speech ("2AC"), so both partners can
 * create the same record concurrently. Nested Y.Maps would lose one partner's
 * fields in that case, so these use flat keys: "<speech>.<field>".
 */
function flatRead<T extends object>(m: Y.Map<unknown>, prefix: string, base: T): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
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

export function deletePosition(doc: Y.Doc, id: string): void {
  setFields(entityMap(doc, RD.positions), id, { deleted: true });
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

// ---------------------------------------------------------------------------
// Cross-examination notes (SEQ-4): kept apart from the flow. A CX admission is
// not an argument until a speech uses it.
// ---------------------------------------------------------------------------

/** One top-level Y.Text per CX period (top-level types merge safely when both partners create them). */
export function cxText(doc: Y.Doc, cx: CxId): Y.Text {
  return doc.getText(`cx:${cx}`);
}

export function readCxNotes(doc: Y.Doc): Partial<Record<CxId, string>> {
  const out: Partial<Record<CxId, string>> = {};
  for (const id of ["CX1", "CX2", "CX3", "CX4"] as CxId[]) {
    const t = cxText(doc, id).toString();
    if (t.trim()) out[id] = t;
  }
  return out;
}

/**
 * Apply a textarea's new value to a Y.Text as a minimal edit (common prefix and
 * suffix untouched), so a partner's concurrent typing elsewhere is preserved.
 */
export function applyTextDiff(t: Y.Text, next: string): void {
  const cur = t.toString();
  if (cur === next) return;
  let start = 0;
  while (start < cur.length && start < next.length && cur[start] === next[start]) start++;
  let endCur = cur.length;
  let endNext = next.length;
  while (endCur > start && endNext > start && cur[endCur - 1] === next[endNext - 1]) {
    endCur--;
    endNext--;
  }
  t.doc!.transact(() => {
    if (endCur > start) t.delete(start, endCur - start);
    if (endNext > start) t.insert(start, next.slice(start, endNext));
  });
}

// ---------------------------------------------------------------------------
// "Heard" pads (A1): what the debaters typed while listening, one Y.Text per
// speech and author (partners never split each other's lines), plus an
// append-only transcript per speech (speech-to-text). Marks anchor each line
// that has been put on the flow, using Yjs relative positions, so edits above
// a line never lose track of it.
// ---------------------------------------------------------------------------

export type HeardSource = "typed" | "transcript";

export interface HeardMark {
  id: string;
  speech: SpeechId;
  textKey: string;
  /** Y.RelativePosition JSON at the line's first and last character */
  start: unknown;
  end: unknown;
  /** hash of the line's text when it was flowed; a different hash now means the line was edited */
  quoteHash: string;
  kind: "args" | "same_as" | "not_argument";
  argIds: string[];
  /** for not_argument: roadmap, header, filler, question, … */
  category: string;
  /** for a header: the position the lines under it belong to */
  positionId?: string | null;
  opId: string | null;
  by: string;
}

export interface HeardLine {
  textKey: string;
  source: HeardSource;
  /** 0-based line number within its pad */
  line: number;
  from: number;
  to: number;
  text: string;
  status: "unflowed" | "flowed" | "changed";
  markIds: string[];
}

export const HEARD_MARKS = "heard_marks";
export const heardKey = (speech: SpeechId, authorKey: string) => `heard:${speech}:${authorKey}`;
export const transcriptKey = (speech: SpeechId) => `transcript:${speech}`;

export function heardText(doc: Y.Doc, speech: SpeechId, authorKey: string): Y.Text {
  return doc.getText(heardKey(speech, authorKey));
}

export function transcriptText(doc: Y.Doc, speech: SpeechId): Y.Text {
  return doc.getText(transcriptKey(speech));
}

/** All pads for a speech that exist in the document (typed pads by author, then the transcript). */
export function heardTextKeys(doc: Y.Doc, speech: SpeechId): string[] {
  const keys = [...doc.share.keys()].filter((k) => k.startsWith(`heard:${speech}:`)).sort();
  if (doc.share.has(transcriptKey(speech))) keys.push(transcriptKey(speech));
  return keys;
}

export function heardAuthorOf(textKey: string): string | null {
  return textKey.startsWith("heard:") ? textKey.split(":").slice(2).join(":") : null;
}

/** Normalized hash of a line (case and spacing don't count as edits). */
export function lineHash(text: string): string {
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function readHeardMarks(doc: Y.Doc): HeardMark[] {
  return [...(doc.getMap(HEARD_MARKS) as Y.Map<HeardMark & { deleted?: boolean }>).values()].filter((m) => m && !m.deleted);
}

function absIndex(doc: Y.Doc, rel: unknown): number | null {
  try {
    const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(rel as never), doc);
    return abs ? abs.index : null;
  } catch {
    return null;
  }
}

/** Anchors for a line (first and last character) and the deterministic id of its mark. */
export function lineAnchors(doc: Y.Doc, speech: SpeechId, textKey: string, from: number, to: number): { id: string; start: unknown; end: unknown } {
  const t = doc.getText(textKey);
  const start = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(t, from, 0));
  const end = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(t, Math.max(from, to), -1));
  return { id: `hm_${lineHash(`${speech}|${textKey}|${JSON.stringify(start)}|${JSON.stringify(end)}`)}`, start, end };
}

export function putHeardMark(doc: Y.Doc, mark: HeardMark): void {
  doc.getMap(HEARD_MARKS).set(mark.id, mark);
}

export function deleteHeardMark(doc: Y.Doc, id: string): void {
  const m = doc.getMap(HEARD_MARKS) as Y.Map<HeardMark & { deleted?: boolean }>;
  const cur = m.get(id);
  if (cur) m.set(id, { ...cur, deleted: true });
}

/** Every non-empty line of every pad for a speech, with whether it is on the flow yet. */
export function heardLines(doc: Y.Doc, speech: SpeechId): HeardLine[] {
  const marks = readHeardMarks(doc).filter((m) => m.speech === speech);
  const out: HeardLine[] = [];
  for (const key of heardTextKeys(doc, speech)) {
    const text = doc.getText(key).toString();
    const resolved = marks
      .filter((m) => m.textKey === key)
      .map((m) => ({ m, start: absIndex(doc, m.start), end: absIndex(doc, m.end) }))
      .filter((r): r is { m: HeardMark; start: number; end: number } => r.start !== null && r.end !== null);
    let offset = 0;
    text.split("\n").forEach((raw, line) => {
      const from = offset;
      const to = offset + raw.length;
      offset = to + 1;
      const trimmed = raw.trim();
      if (!trimmed) return;
      // Mark ranges are [start, end) like line ranges; the end anchor sits at the line's last character.
      const hits = resolved.filter((r) => r.start < to && r.end > from);
      const status = !hits.length ? "unflowed" : hits.every((h) => h.m.quoteHash === lineHash(trimmed)) ? "flowed" : "changed";
      out.push({ textKey: key, source: key.startsWith("transcript:") ? "transcript" : "typed", line, from, to, text: trimmed, status, markIds: hits.map((h) => h.m.id) });
    });
  }
  return out;
}

/**
 * Speeches that have happened as far as the record shows: a slot status, notes or
 * heard lines, arguments on the flow, or (when the caller knows) an uploaded doc.
 * One definition for the client and the server.
 */
export function recordedSpeeches(doc: Y.Doc, withDocs: Iterable<SpeechId> = []): Set<SpeechId> {
  const slots = readSlots(doc);
  const out = new Set<SpeechId>(withDocs);
  for (const s of SPEECH_IDS) {
    if (slots[s].status !== "not_started" || slots[s].notes.trim()) out.add(s);
    if (heardTextKeys(doc, s).some((k) => doc.getText(k).toString().trim())) out.add(s);
  }
  for (const a of readArgs(doc)) if (a.delivery !== "planned") out.add(a.speech);
  return out;
}

// ---------------------------------------------------------------------------
// AI activity (A7): who is running which AI job, and how far along it is, shared
// live so partners see each other's work. Written by the browser that started
// the job (from its progress stream); plain values under flat keys.
// ---------------------------------------------------------------------------

export const AI_ACTIVITY = "ai_activity";

export interface AiActivity {
  /** local id of the job (the proposal id) */
  id: string;
  /** the server's AI operation id, once known (partners fetch the finished proposal by it) */
  opId?: string | null;
  by: string;
  byName: string;
  /** draft | patch | fit | revision | span | comment | flow */
  kind: string;
  /** what it works on, in words ("the 1AR", "their 2NC notes") */
  label: string;
  speech: SpeechId | null;
  draftId: string | null;
  status: "running" | "ready" | "failed" | "applied" | "dismissed";
  stage: string;
  done: number;
  total: number | null;
  etaMs: number | null;
  fraction: number;
  startedAt: number;
  /** last write (ms); a running entry not updated for a while is shown as stalled */
  at: number;
}

export function putActivity(doc: Y.Doc, a: AiActivity): void {
  doc.getMap(AI_ACTIVITY).set(a.id, a);
}

export function patchActivity(doc: Y.Doc, id: string, fields: Partial<AiActivity>): void {
  const m = doc.getMap(AI_ACTIVITY) as Y.Map<AiActivity>;
  const cur = m.get(id);
  if (cur) m.set(id, { ...cur, ...fields, at: Date.now() });
}

export function readActivity(doc: Y.Doc): AiActivity[] {
  return [...(doc.getMap(AI_ACTIVITY) as Y.Map<AiActivity>).values()].filter(Boolean).sort((a, b) => b.startedAt - a.startedAt);
}

/** Drop finished entries older than `maxAgeMs` (and running ones silent for an hour) to keep the map small. */
export function pruneActivity(doc: Y.Doc, now: number, maxAgeMs = 15 * 60_000): void {
  const m = doc.getMap(AI_ACTIVITY) as Y.Map<AiActivity>;
  for (const [id, a] of m.entries()) {
    if (!a || (a.status !== "running" && now - a.at > maxAgeMs) || now - a.at > 60 * 60_000) m.delete(id);
  }
}
