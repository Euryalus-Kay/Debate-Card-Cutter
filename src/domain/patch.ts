/**
 * Patch, don't regenerate (A3). When a draft exists and new arguments arrive
 * (or the team adds an idea), only what's affected changes. Pure logic shared
 * by the server (what the update must cover; validating the model's plan) and
 * the browser (where new answers go on the live draft; how big an edit is):
 *
 * - changeSet: what changed since the draft was written — their arguments no
 *   section answers yet, answers written against an argument whose words have
 *   changed since (the section's `basis`), and links to arguments that are no
 *   longer on the flow;
 * - placeAnswer: code, not the model, decides where a new answer goes;
 * - changedShare: how much of a section an AI edit rewrites.
 */

import { diffWords } from "diff";
import { contentHash, type Draft } from "@/shared/draft-model";
import { computeCoverage, isLive, type ArgUnit, type RoundGraph } from "./flow";
import type { SpeechId } from "./format";
import { checkSections, draftTargetsOf } from "./speech-checks";

/** Hash of an argument's words, stamped on the sections that answer it (their `basis`). */
export function argBasisHash(a: Pick<ArgUnit, "text">): string {
  return contentHash(a.text.replace(/\s+/g, " ").trim());
}

/** The basis to stamp on a section answering `targets`: each argument's text hash now. */
export function basisOf(targets: string[], argHashes: Record<string, string>): Record<string, string> | null {
  const b: Record<string, string> = {};
  for (const t of targets) if (argHashes[t]) b[t] = argHashes[t];
  return Object.keys(b).length ? b : null;
}

/** Deterministic id for a section an update adds, so applying the same update twice never duplicates it. */
export function patchSectionId(opKey: string, ref: string): string {
  return `sec_${contentHash(`${opKey}:${ref}`).slice(0, 14)}`;
}

export interface PatchSection {
  id: string;
  parentId: string | null;
  title: string;
  kind: string;
  relation: string;
  targets: string[];
  positionId: string | null;
  basis: Record<string, string> | null;
  locked: boolean;
  hasChildren: boolean;
}

/** Every section of a draft in document order, with its parent. */
export function patchSections(draft: Draft | null): PatchSection[] {
  if (!draft) return [];
  const out: PatchSection[] = [];
  const walk = (items: Draft["items"], parentId: string | null) => {
    for (const it of items) {
      if (it.type !== "section") continue;
      const s = it.section;
      out.push({ id: s.id, parentId, title: s.title, kind: s.kind, relation: s.relation, targets: s.targets, positionId: s.positionId, basis: s.basis, locked: s.locked, hasChildren: s.items.some((i) => i.type === "section") });
      walk(s.items, s.id);
    }
  };
  walk(draft.items, null);
  return out;
}

export interface ChangeSet {
  /** their arguments this speech must answer that no section answers yet */
  unanswered: ArgUnit[];
  /** low-confidence readings (maybe said): answer if cheap, or confirm */
  uncertain: ArgUnit[];
  /** in a final rebuttal (or the 1NC): unanswered arguments on flows the draft doesn't engage (kick or concede deliberately) */
  otherFlows: ArgUnit[];
  /** sections written against an argument whose words changed since */
  stale: { sectionId: string; title: string; argIds: string[] }[];
  /** sections linked to arguments no longer on the flow */
  vanished: { sectionId: string; title: string; argIds: string[] }[];
}

/**
 * Speeches that answer the other team line by line (every argument is an
 * obligation). The 1NC picks what to engage, and final rebuttals collapse to
 * the flows they go for, so there only the engaged flows count.
 */
const LINE_BY_LINE = new Set<SpeechId>(["2AC", "2NC", "1NR", "1AR"]);

export function changeSet(input: { graph: RoundGraph; speech: SpeechId; draft: Draft | null; recorded: Set<SpeechId> }): ChangeSet {
  const { graph, speech, draft, recorded } = input;
  const sections = patchSections(draft);
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const cov = computeCoverage(graph, speech, draftTargetsOf(checkSections(draft)), recorded);
  const engaged = new Set(sections.flatMap((s) => [...s.targets.map((t) => argById.get(t)?.positionId), s.positionId]).filter((p): p is string => !!p));
  const open = cov.items.filter((i) => i.status === "unanswered");
  const lineByLine = LINE_BY_LINE.has(speech);
  const stale: ChangeSet["stale"] = [];
  const vanished: ChangeSet["vanished"] = [];
  for (const s of sections) {
    const dead = s.targets.filter((t) => {
      const a = argById.get(t);
      return !a || !isLive(a);
    });
    if (dead.length) vanished.push({ sectionId: s.id, title: s.title, argIds: dead });
    if (!s.basis) continue;
    const changed = Object.entries(s.basis)
      .filter(([id, h]) => {
        const a = argById.get(id);
        return !!a && isLive(a) && argBasisHash(a) !== h;
      })
      .map(([id]) => id);
    if (changed.length) stale.push({ sectionId: s.id, title: s.title, argIds: changed });
  }
  return {
    unanswered: open.filter((i) => lineByLine || engaged.has(i.arg.positionId)).map((i) => i.arg),
    uncertain: cov.items.filter((i) => i.status === "uncertain" && (lineByLine || engaged.has(i.arg.positionId))).map((i) => i.arg),
    otherFlows: lineByLine ? [] : open.filter((i) => !engaged.has(i.arg.positionId)).map((i) => i.arg),
    stale,
    vanished,
  };
}

/** Nothing for an update to do (uncertain readings and other flows alone don't call for one). */
export function isUpToDate(c: ChangeSet): boolean {
  return !c.unanswered.length && !c.stale.length && !c.vanished.length;
}

export type Placement = { under: string } | { after: string } | { end: true };

/**
 * Where a new answer to arguments on `positionId` goes. Code decides, not the
 * model: under the section that already holds that position's answers (a
 * position section, or the parent of the existing answers); after the last
 * answer when the answers sit at the top level; right after a locked section
 * (a locked section's content never changes); at the end, as a new position,
 * when the draft doesn't engage the position yet. The model's `anchor` is
 * used only when nothing in the draft says where the position is answered.
 */
export function placeAnswer(sections: PatchSection[], graph: RoundGraph, positionId: string | null, anchor?: string | null): Placement {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const argPos = new Map(graph.args.map((a) => [a.id, a.positionId]));
  const containers = new Map<string, number>();
  let lastTopLeaf: string | null = null;
  if (positionId) {
    for (const s of sections) {
      const on = s.positionId === positionId || s.targets.some((t) => argPos.get(t) === positionId);
      if (!on) continue;
      if (s.kind === "position" || s.hasChildren) containers.set(s.id, (containers.get(s.id) ?? 0) + 2);
      else if (s.parentId) containers.set(s.parentId, (containers.get(s.parentId) ?? 0) + 1);
      else lastTopLeaf = s.id;
    }
  }
  let place: Placement | null = null;
  if (containers.size) {
    // The container holding most of this position's answers; ties go to the first in the draft.
    let best: string | null = null;
    for (const s of sections) if (containers.has(s.id) && (best === null || containers.get(s.id)! > containers.get(best)!)) best = s.id;
    place = { under: best! };
  } else if (lastTopLeaf) place = { after: lastTopLeaf };
  else if (anchor && byId.has(anchor)) place = byId.get(anchor)!.kind === "position" || byId.get(anchor)!.hasChildren ? { under: anchor } : { after: anchor };
  if (!place) return { end: true };
  return avoidLocks(place, byId);
}

/** Move a placement out of locked sections: never inside one, so after the outermost locked one around it. */
function avoidLocks(place: Placement, byId: Map<string, PatchSection>): Placement {
  if ("end" in place) return place;
  const id = "under" in place ? place.under : place.after;
  let outermost: string | null = null;
  // For "under", the section itself must be unlocked; for "after", only its ancestors matter.
  let cur = byId.get(id);
  if (cur && "after" in place) cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  for (; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) if (cur.locked) outermost = cur.id;
  return outermost ? { after: outermost } : place;
}

/**
 * True when every argument in `targets` (aliases resolved) is already answered by a section of the
 * draft. An extension linked to their argument answers it too ("extend our 2AC 4 against their 2NC 7").
 */
export function alreadyAnswered(sections: PatchSection[], graph: RoundGraph, targets: string[]): boolean {
  if (!targets.length) return false;
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const canonical = (id: string) => argById.get(id)?.sameAs ?? id;
  const answered = new Set(
    sections
      .filter((s) => s.relation !== "new")
      .flatMap((s) => s.targets.map(canonical).filter((t) => s.relation !== "extend" || (argById.get(t) && argById.get(t)!.side !== graph.ourSide))),
  );
  return targets.every((t) => answered.has(canonical(t)));
}

/** Share of words an edit changes: removed plus added words over both texts (0 = same, 1 = entirely new). */
export function changedShare(before: string, after: string): number {
  const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const total = count(before) + count(after);
  if (!total) return 0;
  let changed = 0;
  for (const part of diffWords(before, after)) if (part.added || part.removed) changed += count(part.value);
  return Math.min(1, changed / total);
}
