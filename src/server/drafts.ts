/**
 * Draft lifecycle: delivered snapshots → flow, version restore, export.
 */

import { recordDelivery } from "./delivered";
import * as Y from "yjs";
import { and, desc, eq } from "drizzle-orm";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { db } from "@/server/db/client";
import { documents, docVersions, rounds } from "@/server/db/schema";
import { applyServerChange, loadDoc, saveVersion } from "@/server/docs/store";
import { DRAFT_FRAGMENT, draftSchema } from "@/shared/editor/schema";
import { allSections, draftFromPM, type Draft, type DraftItem, type PMNodeJSON } from "@/shared/draft-model";
import { deleteArg, deletePosition, readArgs, readPositions, readRelations, upsertArg, upsertPosition, upsertRelation, setRelationStatus, updateSlot } from "@/shared/round-doc";
import type { ArgRole, ArgUnit, Position, RelationType } from "@/domain/flow";
import { guessKind, matchPosition } from "@/domain/positions";
import { SPEECHES, type SpeechId } from "@/domain/format";
import { buildDocx, type ExportNode } from "@/server/export/docx-writer";
import { newId } from "@/server/ids";

export async function draftJson(docId: string): Promise<PMNodeJSON> {
  const { doc } = await loadDoc(docId);
  return yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(DRAFT_FRAGMENT)) as PMNodeJSON;
}

function firstSentence(text: string, max = 160): string {
  const t = text.trim().replace(/\s+/g, " ");
  const m = /^(.{20,}?[.!?])\s/.exec(t);
  const s = m ? m[1] : t;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Mark a draft delivered: freeze a version, and write its arguments onto the
 * flow as our confirmed units for that speech, with their links.
 */
export async function deliverDraft(docId: string, userId: string): Promise<{ versionId: string; args: number }> {
  const [d] = await db().select().from(documents).where(eq(documents.id, docId));
  if (!d || d.kind !== "speech_draft" || !d.roundId || !d.speech) throw new Error("not a speech draft");
  const [round] = await db().select().from(rounds).where(eq(rounds.id, d.roundId));
  const speech = d.speech as SpeechId;
  const versionId = await saveVersion(docId, "delivered", `${speech} as delivered`, userId);
  const draft = draftFromPM(await draftJson(docId));
  const { doc: stateDoc } = await loadDoc(round.stateDocId);
  const argsNow = readArgs(stateDoc);
  const posOf = new Map(argsNow.map((a) => [a.id, a.positionId]));
  // New positions this speech introduces (a 1NC off-case, an add-on): top-level position sections that
  // answer nothing. They go on the flow with stable ids; their child sections belong to them.
  const positionsNow = readPositions(stateDoc);
  const newPositions: Position[] = [];
  const inherited = new Map<string, string>();
  const walk = (items: DraftItem[], parentPos: string | null) => {
    for (const it of items) {
      if (it.type !== "section") continue;
      const s = it.section;
      let pos = parentPos;
      if (s.kind === "position" && !s.targets.length && s.title.trim()) {
        const existing = s.positionId ?? matchPosition(s.title, positionsNow.filter((p) => p.side === SPEECHES[speech].side))?.id;
        if (existing) pos = existing;
        else {
          const id = `dp_${docId.slice(-8)}_${s.id}`;
          newPositions.push({ id, kind: guessKind(s.title), name: s.title.trim().slice(0, 120), side: SPEECHES[speech].side, introducedIn: speech, order: positionsNow.length + newPositions.length + 1 });
          pos = id;
        }
      }
      if (pos) inherited.set(s.id, pos);
      walk(s.items, pos);
    }
  };
  walk(draft.items, null);
  const sections = allSections(draft).filter((s) => s.kind !== "position" || s.targets.length);
  const units: { unit: ArgUnit; rel?: { type: RelationType; to: string[]; grouped: boolean } }[] = [];
  // Numbering restarts on each position, the way a flow is numbered ("2AC 1, 2, 3" on each sheet).
  const perPosition = new Map<string, number>();
  for (const s of sections) {
    const positionId = s.positionId ?? (s.targets[0] ? posOf.get(s.targets[0]) : undefined) ?? inherited.get(s.id);
    if (!positionId) continue;
    const order = (perPosition.get(positionId) ?? 0) + 1;
    perPosition.set(positionId, order);
    const own = s.items.filter((i) => i.type === "paragraph").map((i) => (i as { text: string }).text).join(" ");
    const text = s.title || firstSentence(own);
    // Cards marked "skipped" weren't read: they aren't on the flow, and a section of only skipped cards wasn't said.
    const allCards = s.items.filter((i): i is Extract<DraftItem, { type: "card" }> => i.type === "card");
    const readCards = allCards.filter((c) => c.read !== "skipped");
    const cites = readCards.map((c) => c.shortCite).filter(Boolean);
    const unsaid = allCards.length > 0 && !readCards.length && !own.trim();
    const unit: ArgUnit = {
      id: `dl_${docId.slice(-8)}_${s.id}`,
      positionId,
      speech,
      side: SPEECHES[speech].side,
      order,
      label: String(order),
      text: text.slice(0, 300),
      role: (s.role as ArgRole) || "claim",
      cardIds: readCards.map((c) => c.cardId).filter((x): x is string => !!x),
      cites,
      provenance: { type: "draft", draftId: docId, sectionId: s.id },
      delivery: unsaid ? "not_read" : "confirmed",
    };
    const relType: RelationType | null = s.relation === "answers" || s.relation === "group" ? "answers" : s.relation === "cross_apply" ? "cross_applies" : s.relation === "extend" ? "extends" : null;
    units.push({ unit, rel: relType && s.targets.length ? { type: relType, to: s.targets, grouped: s.relation === "group" } : undefined });
  }
  await applyServerChange(
    round.stateDocId,
    (doc: Y.Doc) => {
      // Replace units (and new positions) from any previous delivery of this draft.
      // Arguments from sections that vanished go, unless a person corrected them on the flow.
      for (const a of readArgs(doc)) if (a.provenance.type === "draft" && a.provenance.draftId === docId && !units.some((u) => u.unit.id === a.id) && !a.humanEdited) deleteArg(doc, a.id);
      const prefix = `dp_${docId.slice(-8)}_`;
      for (const p of readPositions(doc)) if (p.id.startsWith(prefix) && !newPositions.some((n) => n.id === p.id)) deletePosition(doc, p.id);
      for (const p of newPositions) upsertPosition(doc, p);
      const rels = readRelations(doc);
      for (const { unit, rel } of units) {
        upsertArg(doc, unit);
        if (rel) {
          const relId = `rl_${unit.id}`;
          const existing = rels.find((r) => r.id === relId);
          upsertRelation(doc, { id: relId, type: rel.type, from: unit.id, to: rel.to, grouped: rel.grouped, provenance: { type: "draft", draftId: docId, sectionId: unit.provenance.type === "draft" ? unit.provenance.sectionId : "" }, status: "confirmed" });
          if (existing?.status === "rejected") setRelationStatus(doc, relId, "confirmed");
        }
      }
      updateSlot(doc, speech, { status: "delivered", deliveredDraftId: docId, deliveredAt: Date.now() });
    },
    { userId, origin: `deliver:${docId}` },
  );
  await db().update(documents).set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() }).where(eq(documents.id, docId));
  // Where library cards were read, and the team's answers for the analytics bank (never fails a delivery).
  await recordDelivery({ teamId: round.teamId, roundId: round.id, draftId: docId, speech, draft, flowArgs: argsNow, positions: positionsNow }).catch(() => undefined);
  return { versionId, args: units.length };
}

export async function listVersions(docId: string) {
  return db()
    .select({ id: docVersions.id, label: docVersions.label, reason: docVersions.reason, createdAt: docVersions.createdAt, createdBy: docVersions.createdBy, seqAt: docVersions.seqAt })
    .from(docVersions)
    .where(eq(docVersions.docId, docId))
    .orderBy(desc(docVersions.createdAt))
    .limit(100);
}

export async function versionJson(docId: string, versionId: string): Promise<PMNodeJSON | null> {
  const [v] = await db().select().from(docVersions).where(and(eq(docVersions.id, versionId), eq(docVersions.docId, docId)));
  if (!v) return null;
  const y = new Y.Doc();
  Y.applyUpdate(y, v.state);
  return yXmlFragmentToProsemirrorJSON(y.getXmlFragment(DRAFT_FRAGMENT)) as PMNodeJSON;
}

/** Restore by writing the old content as a NEW change (history is preserved; current state is versioned first). */
export async function restoreVersion(docId: string, versionId: string, userId: string): Promise<void> {
  const json = await versionJson(docId, versionId);
  if (!json) throw new Error("version not found");
  await saveVersion(docId, "before_restore", "Before restoring an earlier version", userId);
  await applyServerChange(
    docId,
    (doc) => {
      const frag = doc.getXmlFragment(DRAFT_FRAGMENT);
      frag.delete(0, frag.length);
      prosemirrorJSONToYXmlFragment(draftSchema(), json, frag);
    },
    { userId, origin: `restore:${versionId}` },
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function draftToExportNodes(draft: Draft, opts: { title?: string; includeNotes?: boolean } = {}): ExportNode[] {
  const out: ExportNode[] = [];
  if (opts.title) out.push({ kind: "heading", level: 1, text: opts.title });
  const walk = (items: DraftItem[], depth: number) => {
    for (const it of items) {
      switch (it.type) {
        case "section": {
          const s = it.section;
          const first = s.items[0];
          const rest = first?.type === "heading" ? s.items.slice(1) : s.items;
          if (first?.type === "heading" && first.text.trim()) {
            // Position-level sections become Blocks (H3); responses become Tags (H4), as in Verbatim speech docs.
            out.push(depth === 0 && s.kind !== "response" ? { kind: "heading", level: 3, text: first.text } : { kind: "analytic", text: first.text });
          }
          walk(rest, depth + 1);
          break;
        }
        case "heading":
          out.push(it.level <= 3 ? { kind: "heading", level: (Math.max(2, it.level) as 2 | 3), text: it.text } : { kind: "analytic", text: it.text });
          break;
        case "paragraph":
          if (it.text.trim()) out.push({ kind: "paragraph", text: it.text });
          break;
        case "note":
          if (opts.includeNotes && it.text.trim()) out.push({ kind: "paragraph", text: `[Note: ${it.text}]` });
          break;
        case "card":
          out.push({ kind: "card", tag: it.tag, shortCite: it.shortCite, fullCite: it.fullCite, body: it.body });
          break;
      }
    }
  };
  walk(draft.items, 0);
  return out;
}

export async function exportDraftDocx(docId: string, opts: { includeNotes?: boolean } = {}): Promise<{ bytes: Uint8Array; fileName: string }> {
  const [d] = await db().select().from(documents).where(eq(documents.id, docId));
  if (!d) throw new Error("document not found");
  let title = d.title || "Speech";
  if (d.roundId) {
    const [r] = await db().select().from(rounds).where(eq(rounds.id, d.roundId));
    if (r) title = [d.speech, r.tournament, r.roundLabel && `R${r.roundLabel}`, (r.opponent as { code?: string }).code && `vs ${(r.opponent as { code?: string }).code}`].filter(Boolean).join(" — ");
  }
  const draft = draftFromPM(await draftJson(docId));
  const bytes = buildDocx(draftToExportNodes(draft, { title, includeNotes: opts.includeNotes }), { title });
  const fileName = `${title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim() || "speech"}.docx`;
  return { bytes, fileName };
}

export { newId };
