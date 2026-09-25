"use client";

import { create } from "zustand";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { api } from "@/client/api";
import { cardToPM, draftFromPM, highlightCss, sectionContentHash, sectionOwnHash, type PMNodeJSON } from "@/shared/draft-model";
import { makeId, BYPASS_LOCKS } from "@/shared/editor/schema";
import { fullCite, shortCite, citationGaps, type Citation } from "@/domain/citation";
import { normalizeHighlights, normalizeSpans, type BodyBlock, type BodyText, type VerificationStatus } from "@/domain/card";
import type { SpeechDraftOutput, SectionRevisionOutput, AlternativesOutput, FitPlanOutput } from "@/server/ai/schemas";
import type { PatchEditInfo, PatchOutput } from "@/server/ai/ops";
import type { RoundGraph } from "@/domain/flow";
import type { SpeechCheck } from "@/domain/speech-checks";
import type { Progress } from "@/domain/progress";
import { alreadyAnswered, basisOf, patchSections, patchSectionId, placeAnswer, type PatchSection, type Placement } from "@/domain/patch";

export interface Validation {
  unsupportedDropClaims?: string[];
  droppedTargets: string[];
  droppedCards: string[];
  unaddressed: { id: string; text: string }[];
  newInRebuttal: string[];
  positionsNotInBlock: string[];
  estimatedSeconds: number;
  limitSeconds: number;
  sectionSeconds: Record<string, number>;
  lengthAdjust?: { mode: "trim" | "grow"; fromSeconds: number; toSeconds: number; sections: number };
  retags?: RetagNote[];
  retagsRefused?: RetagRefusedNote[];
  library?: { offered: number; used: number };
}

export interface RetagNote {
  cardId: string;
  cite: string;
  was: string;
  tag: string;
}

export interface RetagRefusedNote {
  cardId: string;
  cite: string;
  tag: string;
  problems: string[];
}

export type Proposal =
  | {
      id: string;
      opId: string | null;
      kind: "draft";
      draftId: string;
      speech: string;
      status: "running" | "ready" | "failed" | "applied" | "dismissed";
      partial: Partial<SpeechDraftOutput> | null;
      result: { output: SpeechDraftOutput; validation: Validation; run: RunMeta; contextRefs: { draftHash: string | null } } | null;
      error: string | null;
      startedAt: number;
      /** stage, parts done, and time left while it runs */
      progress?: Progress | null;
      baseDraftHash: string | null;
      /** progress after the plan streams in (e.g. trimming to time) */
      note?: string | null;
    }
  | {
      id: string;
      opId: string | null;
      kind: "revision" | "alternatives";
      draftId: string;
      speech: string;
      sectionId: string;
      action: string;
      status: "running" | "ready" | "failed" | "applied" | "dismissed";
      partial: unknown;
      result: { output: SectionRevisionOutput | AlternativesOutput; baseHash: string; estimatedSeconds?: number; previousSeconds?: number; run: RunMeta } | null;
      error: string | null;
      startedAt: number;
      /** stage, parts done, and time left while it runs */
      progress?: Progress | null;
    }
  | {
      id: string;
      opId: string | null;
      kind: "fit";
      draftId: string;
      speech: string;
      status: "running" | "ready" | "failed" | "applied" | "dismissed";
      partial: unknown;
      result: FitResult | null;
      error: string | null;
      startedAt: number;
      /** stage, parts done, and time left while it runs */
      progress?: Progress | null;
      /** per-section outcome after applying */
      outcomes?: Record<string, ApplyResult>;
    }
  | {
      id: string;
      opId: string | null;
      kind: "patch";
      draftId: string;
      speech: string;
      status: "running" | "ready" | "failed" | "applied" | "dismissed";
      partial: unknown;
      result: PatchResult | null;
      error: string | null;
      startedAt: number;
      /** stage, parts done, and time left while it runs */
      progress?: Progress | null;
      /** progress while the update is planned */
      note?: string | null;
      /** started automatically by live pre-drafting */
      auto?: boolean;
      /** per-change outcome after applying, keyed add:<ref> / link:<sectionId> / edit:<sectionId> */
      outcomes?: Record<string, PatchOutcome>;
    };

export interface ArgLite {
  id: string;
  text: string;
  position: string;
  speech: string;
}

export interface PatchResult {
  kind: "patch";
  upToDate: boolean;
  output: PatchOutput;
  changes: { unanswered: ArgLite[]; uncertain: ArgLite[]; otherFlows: ArgLite[]; stale: { sectionId: string; title: string; argIds: string[] }[]; vanished: { sectionId: string; title: string; argIds: string[] }[] };
  titles: Record<string, string>;
  addInfo: Record<string, { positionId: string | null; where: string; seconds: number }>;
  editInfo: Record<string, PatchEditInfo>;
  argHashes: Record<string, string>;
  positionNames: Record<string, string>;
  previousSeconds: number;
  estimatedSeconds: number;
  limitSeconds: number;
  checks: SpeechCheck[];
  remaining: { id: string; text: string }[];
  dropped: { targets: number; cards: number; duplicates: string[]; linksInPlace?: number };
  retags?: RetagNote[];
  retagsRefused?: RetagRefusedNote[];
  run: RunMeta | null;
}

/** applied / stale / locked / missing, or: already answered, partner editing it now. */
export type PatchOutcome = ApplyResult | "answered" | "partner";

export interface FitResult {
  /** "fill" expands a short speech; "cut" trims a long one */
  mode?: "fill" | "cut";
  output: FitPlanOutput;
  baseHashes: Record<string, string>;
  titles: Record<string, string>;
  perSection: Record<string, { before: number; after: number }>;
  previousSeconds: number;
  estimatedSeconds: number;
  limitSeconds: number;
  targetSeconds: number;
  newlyUnanswered: { id: string; text: string }[];
  run: RunMeta;
}

export interface RunMeta {
  model: string;
  ttftMs: number | null;
  totalMs: number;
  attempts: { model: string; ok: boolean; error?: string }[];
}

interface ProposalState {
  proposals: Proposal[];
  add: (p: Proposal) => void;
  update: (id: string, patch: Partial<Proposal>) => void;
  /** A newer update of a draft replaces older automatic ones nobody has touched (their changes are in the newer one). */
  supersede: (draftId: string, keepId: string) => void;
}

export const useProposals = create<ProposalState>((set) => ({
  proposals: [],
  add: (p) => set((s) => ({ proposals: [p, ...s.proposals].slice(0, 30) })),
  update: (id, patch) => set((s) => ({ proposals: s.proposals.map((p) => (p.id === id ? ({ ...p, ...patch } as Proposal) : p)) })),
  supersede: (draftId, keepId) =>
    set((s) => {
      const keep = s.proposals.find((p) => p.id === keepId);
      if (!keep) return s;
      return {
        proposals: s.proposals.map((p) =>
          p.kind === "patch" && p.auto && p.draftId === draftId && p.id !== keepId && p.startedAt < keep.startedAt && p.status === "ready" && !Object.keys(p.outcomes ?? {}).length ? { ...p, status: "dismissed" as const } : p,
        ),
      };
    }),
}));

// ---------------------------------------------------------------------------
// Building editor content from AI output
// ---------------------------------------------------------------------------

interface CardRowLite {
  id: string;
  tag: string;
  citation: Citation;
  body: BodyBlock[];
  verificationStatus: VerificationStatus;
  sourceId: string | null;
  bodyHash: string;
}

export async function fetchCards(teamId: string, ids: string[]): Promise<Map<string, CardRowLite>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return new Map();
  const { cards } = await api<{ cards: CardRowLite[] }>(`/api/cards/batch?teamId=${teamId}&ids=${uniq.join(",")}`);
  return new Map(cards.map((c) => [c.id, c]));
}

/** A library card as an editor node; `tag` is a checked new tag for this speech (B3), the card itself unchanged. */
export function cardNode(c: CardRowLite, tag?: string): PMNodeJSON {
  return cardToPM({
    cardId: c.id,
    sourceId: c.sourceId,
    tag: tag?.trim() || c.tag,
    shortCite: shortCite(c.citation),
    fullCite: fullCite(c.citation),
    citeGaps: citationGaps(c.citation),
    body: c.body,
    verification: c.verificationStatus,
    textHash: c.bodyHash,
  });
}

function paragraphs(text: string): PMNodeJSON[] {
  return text
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] }));
}

export function sectionNodes(out: SpeechDraftOutput, cards: Map<string, CardRowLite>, opId: string | null, only?: Set<string>): PMNodeJSON[] {
  const refs = new Set(out.sections.map((s) => s.ref));
  const byParent = new Map<string, SpeechDraftOutput["sections"]>();
  // A section whose parent ref doesn't exist is kept at the top level rather than silently lost.
  for (const s of out.sections) {
    const parent = s.parentRef && refs.has(s.parentRef) && s.parentRef !== s.ref ? s.parentRef : "";
    byParent.set(parent, [...(byParent.get(parent) ?? []), s]);
  }
  const build = (s: SpeechDraftOutput["sections"][number], depth: number): PMNodeJSON => {
    const content: PMNodeJSON[] = [{ type: "heading", attrs: { level: depth === 0 ? 3 : 4 }, content: s.title ? [{ type: "text", text: s.title }] : [] }];
    content.push(...paragraphs(s.analytic));
    for (const id of s.cardIds) {
      const c = cards.get(id);
      if (c) content.push(cardNode(c, out.cardTags?.find((t) => t.cardId === id)?.tag));
    }
    if (s.needsEvidence.trim()) content.push({ type: "note", content: [{ type: "text", text: `Needs evidence: ${s.needsEvidence.trim()}` }] });
    for (const child of byParent.get(s.ref) ?? []) content.push(build(child, depth + 1));
    if (content.length === 1) content.push({ type: "paragraph" });
    const node: PMNodeJSON = {
      type: "section",
      attrs: {
        id: makeId("sec"),
        kind: s.kind === "position" ? "position" : s.kind === "overview" || s.kind === "impact_calc" || s.kind === "judge_instruction" ? "overview" : s.kind === "extension" ? "extension" : "response",
        relation: s.relation,
        targets: s.targets,
        role: s.role || null,
        budgetSec: Math.round(s.budgetSeconds) || null,
        priority: s.priority || null,
        crossApplyFrom: s.crossApplyFrom || null,
        origin: "ai",
        aiOpId: opId,
      },
      content,
    };
    node.attrs!.appliedHash = sectionOwnHash(node);
    return node;
  };
  return (byParent.get("") ?? []).filter((s) => !only || only.has(s.ref)).map((s) => build(s, 0));
}

export function isDraftEmpty(editor: Editor): boolean {
  const doc = editor.state.doc;
  return doc.childCount === 0 || (doc.childCount === 1 && doc.firstChild!.type.name === "paragraph" && doc.firstChild!.textContent.trim() === "");
}

/** Insert generated sections. Empty draft: fill it. Otherwise append (never overwrite). */
export function applyDraft(editor: Editor, nodes: PMNodeJSON[]): void {
  if (!nodes.length) return;
  if (isDraftEmpty(editor)) {
    editor.chain().setContent({ type: "doc", content: nodes }, { emitUpdate: true }).run();
  } else {
    editor.chain().insertContentAt(editor.state.doc.content.size, nodes).run();
  }
}

export function findSectionNode(editor: Editor, sectionId: string): { node: PMNode; pos: number } | null {
  let hit: { node: PMNode; pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (hit) return false;
    if (node.type.name === "section" && node.attrs.id === sectionId) {
      hit = { node, pos };
      return false;
    }
    return true;
  });
  return hit;
}

export type ApplyResult = "applied" | "stale" | "locked" | "missing";

/** True if the section or anything nested in it is locked (replacing it would touch a locked range). */
function lockedWithin(node: PMNode): boolean {
  if (node.attrs.locked) return true;
  let found = false;
  node.descendants((child) => {
    if (found) return false;
    if (child.type.name === "section" && child.attrs.locked) found = true;
    return !found;
  });
  return found;
}

/** Dispatch and report whether the document actually changed (the integrity guards can silently drop a transaction). */
function dispatchChanged(editor: Editor, tr: Transaction): boolean {
  const before = editor.state.doc;
  editor.view.dispatch(tr);
  return editor.state.doc !== before;
}

/** True if the position is inside a locked section's content. */
function insideLocked(editor: Editor, pos: number): boolean {
  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.name === "section" && $pos.node(d).attrs.locked) return true;
  return false;
}

/** Delete a section, with the same lock and stale checks as applyRevision. */
export function removeSection(editor: Editor, sectionId: string, baseHash: string, force = false): ApplyResult {
  const found = findSectionNode(editor, sectionId);
  if (!found) return "missing";
  if (lockedWithin(found.node)) return "locked";
  if (sectionContentHash(found.node.toJSON() as PMNodeJSON) !== baseHash && !force) return "stale";
  return dispatchChanged(editor, editor.state.tr.delete(found.pos, found.pos + found.node.nodeSize)) ? "applied" : "locked";
}

/**
 * Insert a section under another section (as its last child), right after it, or at the end.
 * Refuses (returns "locked") when the destination is inside a locked section.
 */
export function insertSectionAt(editor: Editor, node: PMNodeJSON, where: { under: string } | { after: string } | { end: true }): ApplyResult {
  let at = editor.state.doc.content.size;
  if ("under" in where || "after" in where) {
    const found = findSectionNode(editor, "under" in where ? where.under : where.after);
    if (!found) return "missing";
    at = "under" in where ? found.pos + found.node.nodeSize - 1 : found.pos + found.node.nodeSize;
  }
  if (insideLocked(editor, at)) return "locked";
  const pm = editor.schema.nodeFromJSON(node);
  if (isDraftEmpty(editor)) {
    editor.chain().setContent({ type: "doc", content: [node] }, { emitUpdate: true }).run();
    return "applied";
  }
  return dispatchChanged(editor, editor.state.tr.insert(at, pm)) ? "applied" : "locked";
}

/**
 * Replace a section's content with a revision. Refuses if the section is
 * locked or missing; returns "stale" (without changing anything) if the
 * section changed since the request, unless force is set.
 */
export function applyRevision(
  editor: Editor,
  sectionId: string,
  rev: { title: string; analytic: string; cardIds: string[]; needsEvidence?: string; role?: string; attrs?: Record<string, unknown> },
  baseHash: string,
  cards: Map<string, CardRowLite>,
  opId: string | null,
  force = false,
): ApplyResult {
  const found = findSectionNode(editor, sectionId);
  if (!found) return "missing";
  const { node, pos } = found;
  if (lockedWithin(node)) return "locked";
  const currentHash = sectionContentHash(node.toJSON() as PMNodeJSON);
  if (currentHash !== baseHash && !force) return "stale";
  // Reuse the section's existing card nodes (keeps the team's highlighting); build new ones from the library.
  const existingCards = new Map<string, PMNodeJSON>();
  node.forEach((child) => {
    if (child.type.name === "card" && child.attrs.cardId) existingCards.set(String(child.attrs.cardId), child.toJSON() as PMNodeJSON);
  });
  const nested: PMNodeJSON[] = [];
  // Team notes stay; an old "Needs evidence" note is replaced when the revision says what it needs now.
  const notes: PMNodeJSON[] = [];
  node.forEach((child) => {
    if (child.type.name === "section") nested.push(child.toJSON() as PMNodeJSON);
    if (child.type.name === "note" && !(rev.needsEvidence !== undefined && child.textContent.startsWith("Needs evidence:"))) notes.push(child.toJSON() as PMNodeJSON);
  });
  const level = node.attrs.kind === "position" ? 3 : 4;
  const content: PMNodeJSON[] = [{ type: "heading", attrs: { level }, content: rev.title ? [{ type: "text", text: rev.title }] : [] }, ...paragraphs(rev.analytic)];
  for (const id of rev.cardIds) {
    const existing = existingCards.get(id);
    if (existing) content.push(existing);
    else if (cards.get(id)) content.push(cardNode(cards.get(id)!));
  }
  if (rev.needsEvidence?.trim()) content.push({ type: "note", content: [{ type: "text", text: `Needs evidence: ${rev.needsEvidence.trim()}` }] });
  content.push(...notes, ...nested);
  const newJson: PMNodeJSON = { type: "section", attrs: { ...node.attrs, ...(rev.attrs ?? {}), origin: "ai", aiOpId: opId, role: rev.role ?? node.attrs.role }, content };
  // Hash the content as the editor will hold it (schema defaults filled in).
  newJson.attrs!.appliedHash = sectionOwnHash(editor.schema.nodeFromJSON(newJson).toJSON() as PMNodeJSON);
  const newNode = editor.schema.nodeFromJSON(newJson);
  return dispatchChanged(editor, editor.state.tr.replaceWith(pos, pos + node.nodeSize, newNode).setMeta(BYPASS_LOCKS, false)) ? "applied" : "locked";
}

// ---------------------------------------------------------------------------
// Applying an update (A3): only what changed, placed by code on the live draft
// ---------------------------------------------------------------------------

/** The sections of the draft as it is right now. */
export function liveSections(editor: Editor): PatchSection[] {
  return patchSections(draftFromPM(editor.getJSON() as PMNodeJSON));
}

const EDITOR_KIND: Record<string, string> = { position: "position", overview: "overview", impact_calc: "overview", judge_instruction: "overview", extension: "extension", response: "response" };

function relationFor(current: string, count: number): string {
  if (!count) return "none";
  if (current === "none" || current === "answers" || current === "group") return count > 1 ? "group" : "answers";
  return current;
}

/**
 * Apply the selected changes of an update: links first (attribute-only), then
 * edits (refused when stale, locked, or where the partner is typing), then new
 * sections, each placed by code on the live draft and given a deterministic
 * id so applying twice never duplicates. New answers to arguments the draft
 * already answers (a partner got there first) are skipped.
 */
export function applyPatch(
  editor: Editor,
  r: PatchResult,
  opts: { opKey: string; opId: string | null; selected: Set<string>; prior: Record<string, PatchOutcome>; cards: Map<string, CardRowLite>; graph: RoundGraph; partnerSections: Set<string>; force?: boolean },
): Record<string, PatchOutcome> {
  const out: Record<string, PatchOutcome> = { ...opts.prior };
  const todo = (key: string) => opts.selected.has(key) && out[key] !== "applied" && out[key] !== "answered";

  for (const link of r.output.retargets) {
    const key = `link:${link.sectionId}`;
    if (!todo(key)) continue;
    const found = findSectionNode(editor, link.sectionId);
    if (!found) {
      out[key] = "missing";
      continue;
    }
    const current = (found.node.attrs.targets as string[]) ?? [];
    const next = [...new Set([...current.filter((t) => !link.removeTargets.includes(t)), ...link.addTargets])];
    const basis: Record<string, string> = { ...((found.node.attrs.basis as Record<string, string> | null) ?? {}), ...(basisOf(link.addTargets, r.argHashes) ?? {}) };
    for (const t of link.removeTargets) delete basis[t];
    const tr = editor.state.tr
      .setNodeAttribute(found.pos, "targets", next)
      .setNodeAttribute(found.pos, "relation", relationFor(String(found.node.attrs.relation ?? "none"), next.length))
      .setNodeAttribute(found.pos, "basis", Object.keys(basis).length ? basis : null);
    out[key] = dispatchChanged(editor, tr) ? "applied" : "locked";
  }

  for (const e of r.output.edits) {
    const key = `edit:${e.sectionId}`;
    if (!todo(key)) continue;
    if (opts.partnerSections.has(e.sectionId) && !opts.force) {
      out[key] = "partner";
      continue;
    }
    const info = r.editInfo[e.sectionId];
    const found = findSectionNode(editor, e.sectionId);
    const targets = (found?.node.attrs.targets as string[] | undefined) ?? [];
    out[key] = applyRevision(editor, e.sectionId, { title: e.title, analytic: e.analytic, cardIds: e.cardIds, attrs: { basis: basisOf(targets, r.argHashes) } }, info?.baseHash ?? "", opts.cards, opts.opId, opts.force);
  }

  const adds = r.output.adds;
  const chosen = new Set(adds.filter((a) => opts.selected.has(`add:${a.ref}`)).map((a) => a.ref));
  const parentOf = (a: (typeof adds)[number]) => (a.parentRef && chosen.has(a.parentRef) ? a.parentRef : "");
  const build = (a: (typeof adds)[number], depth: number, done: string[]): PMNodeJSON => {
    done.push(a.ref);
    const content: PMNodeJSON[] = [{ type: "heading", attrs: { level: depth === 0 ? 3 : 4 }, content: a.title ? [{ type: "text", text: a.title }] : [] }, ...paragraphs(a.analytic)];
    for (const id of a.cardIds) {
      const c = opts.cards.get(id);
      if (c) content.push(cardNode(c, r.output.cardTags?.find((t) => t.cardId === id)?.tag));
    }
    if (a.needsEvidence.trim()) content.push({ type: "note", content: [{ type: "text", text: `Needs evidence: ${a.needsEvidence.trim()}` }] });
    for (const child of adds) if (chosen.has(child.ref) && parentOf(child) === a.ref && out[`add:${child.ref}`] !== "applied") content.push(build(child, depth + 1, done));
    if (content.length === 1) content.push({ type: "paragraph" });
    return stamp(editor, {
      type: "section",
      attrs: { id: patchSectionId(opts.opKey, a.ref), kind: EDITOR_KIND[a.kind] ?? "response", relation: a.relation, targets: a.targets, role: a.role || null, budgetSec: Math.round(a.budgetSeconds) || null, priority: a.priority || null, crossApplyFrom: a.crossApplyFrom || null, positionId: r.addInfo[a.ref]?.positionId ?? null, basis: basisOf(a.targets, r.argHashes), origin: "ai", aiOpId: opts.opId },
      content,
    });
  };
  const depthOf = (sections: PatchSection[], id: string) => {
    const byId = new Map(sections.map((s) => [s.id, s]));
    let d = 0;
    for (let cur = byId.get(id); cur?.parentId; cur = byId.get(cur.parentId)) d++;
    return d;
  };
  for (const a of adds) {
    const key = `add:${a.ref}`;
    const parent = parentOf(a);
    // Children go in with their parent, unless the parent went in on an earlier apply.
    if (!chosen.has(a.ref) || !todo(key) || (parent && out[`add:${parent}`] !== "applied")) continue;
    const id = patchSectionId(opts.opKey, a.ref);
    if (findSectionNode(editor, id)) {
      out[key] = "applied";
      continue;
    }
    const sections = liveSections(editor);
    if (a.relation !== "extend" && a.relation !== "new" && alreadyAnswered(sections, opts.graph, a.targets)) {
      out[key] = "answered";
      continue;
    }
    const positionId = r.addInfo[a.ref]?.positionId ?? null;
    let place: Placement = parent ? { under: patchSectionId(opts.opKey, parent) } : placeAnswer(sections, opts.graph, positionId, a.anchor);
    const done: string[] = [];
    let node: PMNodeJSON;
    if ("end" in place && a.kind !== "position" && positionId) {
      // A flow this speech doesn't engage yet: its answers go in one new position section.
      const wrapperId = patchSectionId(opts.opKey, `pos:${positionId}`);
      if (findSectionNode(editor, wrapperId)) {
        place = { under: wrapperId };
        node = build(a, 1, done);
      } else {
        node = stamp(editor, {
          type: "section",
          attrs: { id: wrapperId, kind: "position", relation: "none", targets: [], positionId, origin: "ai", aiOpId: opts.opId },
          content: [{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: r.positionNames[positionId] ?? "New position" }] }, build(a, 1, done)],
        });
      }
    } else {
      const depth = "under" in place ? depthOf(sections, place.under) + 1 : "after" in place ? depthOf(sections, place.after) : 0;
      node = build(a, depth, done);
    }
    let result = insertSectionAt(editor, node, place);
    // The spot vanished or got locked since the plan: add it at the end rather than lose the answer.
    if ((result === "missing" || result === "locked") && !("end" in place)) result = insertSectionAt(editor, node, { end: true });
    for (const ref of done) out[`add:${ref}`] = result;
  }
  return out;
}

/** Stamp an AI-written section with the hash of its own content, as the editor will hold it. */
function stamp(editor: Editor, node: PMNodeJSON): PMNodeJSON {
  node.attrs!.appliedHash = sectionOwnHash(editor.schema.nodeFromJSON(node).toJSON() as PMNodeJSON);
  return node;
}

/** Insert a node after the section the cursor is in (or at the end), never splitting text. */
export function insertSectionAfterCurrent(editor: Editor, node: PMNodeJSON): void {
  editor.view.focus();
  const { $from } = editor.state.selection;
  let at = editor.state.doc.content.size;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "section") {
      at = $from.after(d);
      break;
    }
    if (d === 1) at = $from.after(1);
  }
  if (editor.isEmpty) editor.chain().setContent({ type: "doc", content: [node] }, { emitUpdate: true }).run();
  else editor.chain().insertContentAt(at, node).run();
}

/**
 * Replace a card instance's underline/emphasis/highlight marks with those of
 * `body` (same verbatim text). Mark-only steps, so the card-text guard allows
 * them. Returns "missing" if the card is gone and "changed" if its text no
 * longer matches the proposal.
 */
export function applyCardMarks(editor: Editor, instanceId: string, body: BodyBlock[]): "applied" | "missing" | "changed" {
  let cardPos = -1;
  let cardNode: PMNode | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (cardNode) return false;
    if (node.type.name === "card" && node.attrs.id === instanceId) {
      cardNode = node;
      cardPos = pos;
      return false;
    }
    return true;
  });
  if (!cardNode || cardPos < 0) return "missing";
  const card = cardNode as PMNode;
  // Locate text blocks the way pmCardBody splits them: a new block at each paragraph and after each omission/insertion.
  const blocks: { from: number; text: string }[] = [];
  let bodyPos = -1;
  card.forEach((child, offset) => {
    if (child.type.name === "cardBody") bodyPos = cardPos + 1 + offset;
  });
  if (bodyPos < 0) return "missing";
  const bodyNode = card.child([...Array(card.childCount).keys()].find((i) => card.child(i).type.name === "cardBody")!);
  bodyNode.forEach((para, paraOffset) => {
    const paraStart = bodyPos + 1 + paraOffset + 1;
    let current: { from: number; text: string } | null = null;
    para.forEach((inl, inlOffset) => {
      if (inl.isText) {
        if (!current) {
          current = { from: paraStart + inlOffset, text: "" };
          blocks.push(current);
        }
        current.text += inl.text ?? "";
      } else current = null;
    });
  });
  const texts = body.filter((b): b is BodyText => b.kind === "text" && b.text.length > 0);
  const live = blocks.filter((b) => b.text.length > 0);
  if (texts.length !== live.length || texts.some((t, i) => t.text !== live[i].text)) return "changed";
  const { schema } = editor.state;
  const tr = editor.state.tr;
  const from = bodyPos + 1;
  const to = bodyPos + bodyNode.nodeSize - 1;
  for (const m of ["highlight", "underline", "emphasis"]) if (schema.marks[m]) tr.removeMark(from, to, schema.marks[m]);
  texts.forEach((t, i) => {
    const base = live[i].from;
    const em = normalizeSpans(t.emphasis, t.text.length);
    const inEm = (p: number) => em.some((s) => p >= s.start && p < s.end);
    for (const s of normalizeSpans(t.underline, t.text.length)) {
      // Underlined text outside emphasis gets the underline mark (emphasis already implies underline).
      let a = s.start;
      while (a < s.end) {
        while (a < s.end && inEm(a)) a++;
        let b = a;
        while (b < s.end && !inEm(b)) b++;
        if (b > a) tr.addMark(base + a, base + b, schema.marks.underline.create());
        a = b;
      }
    }
    for (const s of em) tr.addMark(base + s.start, base + s.end, schema.marks.emphasis.create());
    for (const s of normalizeHighlights(t.highlight, t.text.length)) tr.addMark(base + s.start, base + s.end, schema.marks.highlight.create({ color: highlightCss(s.color) }));
  });
  editor.view.dispatch(tr);
  return "applied";
}
