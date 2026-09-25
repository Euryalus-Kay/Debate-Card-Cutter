"use client";

import { create } from "zustand";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { api } from "@/client/api";
import { cardToPM, highlightCss, sectionContentHash, type PMNodeJSON } from "@/shared/draft-model";
import { makeId, BYPASS_LOCKS } from "@/shared/editor/schema";
import { fullCite, shortCite, citationGaps, type Citation } from "@/domain/citation";
import { normalizeHighlights, normalizeSpans, type BodyBlock, type BodyText, type VerificationStatus } from "@/domain/card";
import type { SpeechDraftOutput, SectionRevisionOutput, AlternativesOutput, FitPlanOutput } from "@/server/ai/schemas";

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
      baseDraftHash: string | null;
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
      /** per-section outcome after applying */
      outcomes?: Record<string, ApplyResult>;
    };

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
}

export const useProposals = create<ProposalState>((set) => ({
  proposals: [],
  add: (p) => set((s) => ({ proposals: [p, ...s.proposals].slice(0, 30) })),
  update: (id, patch) => set((s) => ({ proposals: s.proposals.map((p) => (p.id === id ? ({ ...p, ...patch } as Proposal) : p)) })),
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

export function cardNode(c: CardRowLite): PMNodeJSON {
  return cardToPM({
    cardId: c.id,
    sourceId: c.sourceId,
    tag: c.tag,
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
  const byParent = new Map<string, SpeechDraftOutput["sections"]>();
  for (const s of out.sections) byParent.set(s.parentRef, [...(byParent.get(s.parentRef) ?? []), s]);
  const build = (s: SpeechDraftOutput["sections"][number], depth: number): PMNodeJSON => {
    const content: PMNodeJSON[] = [{ type: "heading", attrs: { level: depth === 0 ? 3 : 4 }, content: s.title ? [{ type: "text", text: s.title }] : [] }];
    content.push(...paragraphs(s.analytic));
    for (const id of s.cardIds) {
      const c = cards.get(id);
      if (c) content.push(cardNode(c));
    }
    if (s.needsEvidence.trim()) content.push({ type: "note", content: [{ type: "text", text: `Needs evidence: ${s.needsEvidence.trim()}` }] });
    for (const child of byParent.get(s.ref) ?? []) content.push(build(child, depth + 1));
    if (content.length === 1) content.push({ type: "paragraph" });
    return {
      type: "section",
      attrs: {
        id: makeId("sec"),
        kind: s.kind === "position" ? "position" : s.kind === "overview" || s.kind === "impact_calc" || s.kind === "judge_instruction" ? "overview" : s.kind === "extension" ? "extension" : "response",
        relation: s.relation,
        targets: s.targets,
        role: s.role || null,
        budgetSec: Math.round(s.budgetSeconds) || null,
        origin: "ai",
        aiOpId: opId,
      },
      content,
    };
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

/** Delete a section, with the same lock and stale checks as applyRevision. */
export function removeSection(editor: Editor, sectionId: string, baseHash: string, force = false): ApplyResult {
  const found = findSectionNode(editor, sectionId);
  if (!found) return "missing";
  if (found.node.attrs.locked) return "locked";
  if (sectionContentHash(found.node.toJSON() as PMNodeJSON) !== baseHash && !force) return "stale";
  editor.view.dispatch(editor.state.tr.delete(found.pos, found.pos + found.node.nodeSize));
  return "applied";
}

/**
 * Replace a section's content with a revision. Refuses if the section is
 * locked or missing; returns "stale" (without changing anything) if the
 * section changed since the request, unless force is set.
 */
export function applyRevision(
  editor: Editor,
  sectionId: string,
  rev: { title: string; analytic: string; cardIds: string[]; needsEvidence?: string; role?: string },
  baseHash: string,
  cards: Map<string, CardRowLite>,
  opId: string | null,
  force = false,
): ApplyResult {
  const found = findSectionNode(editor, sectionId);
  if (!found) return "missing";
  const { node, pos } = found;
  if (node.attrs.locked) return "locked";
  const currentHash = sectionContentHash(node.toJSON() as PMNodeJSON);
  if (currentHash !== baseHash && !force) return "stale";
  // Reuse the section's existing card nodes (keeps the team's highlighting); build new ones from the library.
  const existingCards = new Map<string, PMNodeJSON>();
  node.forEach((child) => {
    if (child.type.name === "card" && child.attrs.cardId) existingCards.set(String(child.attrs.cardId), child.toJSON() as PMNodeJSON);
  });
  const nested: PMNodeJSON[] = [];
  node.forEach((child) => {
    if (child.type.name === "section") nested.push(child.toJSON() as PMNodeJSON);
  });
  const level = node.attrs.kind === "position" ? 3 : 4;
  const content: PMNodeJSON[] = [{ type: "heading", attrs: { level }, content: rev.title ? [{ type: "text", text: rev.title }] : [] }, ...paragraphs(rev.analytic)];
  for (const id of rev.cardIds) {
    const existing = existingCards.get(id);
    if (existing) content.push(existing);
    else if (cards.get(id)) content.push(cardNode(cards.get(id)!));
  }
  if (rev.needsEvidence?.trim()) content.push({ type: "note", content: [{ type: "text", text: `Needs evidence: ${rev.needsEvidence.trim()}` }] });
  content.push(...nested);
  const newJson: PMNodeJSON = { type: "section", attrs: { ...node.attrs, origin: "ai", aiOpId: opId, role: rev.role ?? node.attrs.role }, content };
  // Hash the content as the editor will hold it (schema defaults filled in).
  newJson.attrs!.appliedHash = sectionContentHash(editor.schema.nodeFromJSON(newJson).toJSON() as PMNodeJSON);
  const newNode = editor.schema.nodeFromJSON(newJson);
  editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, newNode).setMeta(BYPASS_LOCKS, false));
  return "applied";
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
