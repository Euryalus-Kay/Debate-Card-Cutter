/**
 * Write heard lines onto the flow. Shared by the server (AI extraction) and the
 * browser (no-AI parser, offline). Every line is re-checked against the live
 * document: a line already flowed by another run, or edited since it was read,
 * is skipped. Ids are deterministic (from the line's anchor), so two runs over
 * the same line write the same keys instead of duplicating.
 */

import type * as Y from "yjs";
import type { ArgUnit, Position, PositionKind, Relation } from "@/domain/flow";
import type { Side, SpeechId } from "@/domain/format";
import type { ValidatedArg, ValidatedLine } from "@/domain/flow-extract";
import type { HeardInputLine, ParsedLine } from "@/domain/heard-parse";
import { matchPosition } from "@/domain/positions";
import { deleteArg, deleteHeardMark, deletePosition, heardLines, lineAnchors, lineHash, putHeardMark, readArgs, readPositions, readRelations, setRelationStatus, upsertArg, upsertPosition, upsertRelation, type HeardLine } from "./round-doc";

export interface HeardApplyResult {
  created: string[];
  aliased: string[];
  positions: string[];
  marks: string[];
  relations: string[];
  notArguments: number;
  skipped: number;
}

/** The no-AI parser's output in the same shape as a validated AI extraction. */
export function parsedToValidated(parsed: ParsedLine[], lines: HeardInputLine[]): ValidatedLine[] {
  const textOf = new Map(lines.map((l) => [`${l.key}|${l.line}`, l.text]));
  const pendingKind = new Map<string, PositionKind>();
  return parsed.map((p, i) => {
    const pos = p.position && "id" in p.position && p.position.id.startsWith("pending:") ? { name: p.position.id.slice(8), kind: pendingKind.get(p.position.id.slice(8)) ?? "other" } : p.position;
    if (p.position && "name" in p.position) pendingKind.set(p.position.name, p.position.kind);
    const args: ValidatedArg[] = p.args.map((a) => ({ quote: a.quote, text: a.text, role: a.role, evidence: a.evidence, label: a.label, position: pos as ValidatedArg["position"], answers: [], confidence: 0.5 }));
    return { n: i + 1, key: p.key, line: p.line, text: textOf.get(`${p.key}|${p.line}`) ?? "", action: p.action, category: p.category, position: p.category === "header" ? (pos as ValidatedArg["position"]) : undefined, args };
  });
}

function positionIdFor(speech: SpeechId, name: string): string {
  return `pos_h_${lineHash(`${speech}|${name.toLowerCase()}`)}`;
}

export function applyHeard(
  doc: Y.Doc,
  input: { speech: SpeechId; side: Side; lines: ValidatedLine[]; opId: string | null; by: string },
): HeardApplyResult {
  const result: HeardApplyResult = { created: [], aliased: [], positions: [], marks: [], relations: [], notArguments: 0, skipped: 0 };
  const fresh = new Map(heardLines(doc, input.speech).map((l) => [`${l.textKey}|${l.line}`, l]));
  const positions: Position[] = readPositions(doc).filter((p) => !(p as Position & { deleted?: boolean }).deleted);
  const args: ArgUnit[] = readArgs(doc);
  const nextLabel = new Map<string, number>();
  for (const a of args) {
    if (a.speech !== input.speech) continue;
    const n = Number(a.label);
    if (Number.isFinite(n)) nextLabel.set(a.positionId, Math.max(nextLabel.get(a.positionId) ?? 0, n));
  }
  let current: string | null = null;

  const ensurePosition = (pos: ValidatedArg["position"]): string => {
    if (pos && "id" in pos && positions.some((p) => p.id === pos.id)) return pos.id;
    if (pos && "name" in pos) {
      const hit = matchPosition(pos.name, positions);
      if (hit) return hit.id;
      const id = positionIdFor(input.speech, pos.name);
      const p: Position = { id, kind: pos.kind, name: pos.name, side: input.side, introducedIn: input.speech, order: positions.reduce((m, x) => Math.max(m, x.order), 0) + 1 };
      upsertPosition(doc, p);
      positions.push(p);
      result.positions.push(id);
      return id;
    }
    if (current) return current;
    const id = positionIdFor(input.speech, "unsorted");
    if (!positions.some((p) => p.id === id)) {
      const p: Position = { id, kind: "other", name: `${input.speech} (unsorted)`, side: input.side, introducedIn: input.speech, order: positions.reduce((m, x) => Math.max(m, x.order), 0) + 1 };
      upsertPosition(doc, p);
      positions.push(p);
      result.positions.push(id);
    }
    return id;
  };

  doc.transact(() => {
    for (const v of input.lines) {
      const hl: HeardLine | undefined = fresh.get(`${v.key}|${v.line}`);
      if (!hl || hl.status === "flowed" || (v.text && lineHash(hl.text) !== lineHash(v.text))) {
        result.skipped++;
        continue;
      }
      const anchors = lineAnchors(doc, input.speech, v.key, hl.from, hl.to);
      const mark = { id: anchors.id, speech: input.speech, textKey: v.key, start: anchors.start, end: anchors.end, quoteHash: lineHash(hl.text), opId: input.opId, by: input.by };
      if (v.action === "not_argument") {
        if (v.category === "header" && v.args.length === 0) {
          // A header sets the position for the lines under it.
          if (v.position) current = ensurePosition(v.position);
        }
        putHeardMark(doc, { ...mark, kind: "not_argument", argIds: [], category: v.category ?? "other" });
        result.notArguments++;
        result.marks.push(mark.id);
        continue;
      }
      if (v.action === "same_as" && v.sameAs) {
        putHeardMark(doc, { ...mark, kind: "same_as", argIds: [v.sameAs], category: "" });
        result.aliased.push(v.sameAs);
        result.marks.push(mark.id);
        continue;
      }
      const ids: string[] = [];
      v.args.forEach((a, i) => {
        const positionId = ensurePosition(a.position);
        current = positionId;
        const id = `ha_${mark.id}_${i}`;
        const label = a.label ?? String((nextLabel.get(positionId) ?? 0) + 1);
        if (!a.label) nextLabel.set(positionId, Number(label));
        const cite = a.evidence === "card" ? /\b[A-Z][a-zA-Z'-]+(?:\s(?:and|&)\s[A-Z][a-zA-Z'-]+)?\s?[’']?\d{2,4}\b/.exec(a.quote)?.[0] : undefined;
        const unit: Partial<ArgUnit> & { id: string } = {
          id,
          positionId,
          speech: input.speech,
          side: input.side,
          order: hl.line + i / 10,
          label,
          text: a.text,
          warrant: a.warrant,
          role: a.role,
          cardIds: [],
          cites: cite ? [cite] : undefined,
          provenance: { type: "heard", speech: input.speech, markId: mark.id, quote: a.quote, source: hl.source, opId: input.opId ?? undefined, confidence: a.confidence },
          delivery: "confirmed",
          evidence: a.evidence,
          sameAs: a.sameAs,
          aiInterpretation: a.aiReading && input.opId ? { opId: input.opId, confidence: a.confidence, claim: a.aiReading } : undefined,
        };
        upsertArg(doc, unit);
        ids.push(id);
        if (a.sameAs) result.aliased.push(id);
        else result.created.push(id);
        for (const to of a.answers) {
          const rel: Relation = {
            id: `hr_${id}_${to}`,
            type: a.role === "link_turn" || a.role === "impact_turn" ? "turns" : "answers",
            from: id,
            to: [to],
            provenance: { type: "ai_inferred", opId: input.opId ?? undefined, confidence: a.confidence },
            status: "suggested",
          };
          upsertRelation(doc, rel);
          result.relations.push(rel.id);
        }
      });
      putHeardMark(doc, { ...mark, kind: "args", argIds: ids, category: "" });
      result.marks.push(mark.id);
    }
  });
  return result;
}

/**
 * Undo one flow update: remove the arguments it created (except any a person has
 * edited since), its suggested links, its marks (so the lines show as not yet on
 * the flow), and positions it created that are now empty.
 */
export function revertHeard(doc: Y.Doc, out: Pick<HeardApplyResult, "created" | "aliased" | "positions" | "marks" | "relations">): { removed: number; kept: number } {
  let removed = 0;
  let kept = 0;
  doc.transact(() => {
    const args = new Map(readArgs(doc).map((a) => [a.id, a]));
    for (const id of [...out.created, ...out.aliased.filter((x) => x.startsWith("ha_"))]) {
      const a = args.get(id);
      if (!a) continue;
      if (a.humanEdited) {
        kept++;
        continue;
      }
      deleteArg(doc, id);
      removed++;
    }
    const rels = new Set(readRelations(doc).map((r) => r.id));
    for (const id of out.relations) if (rels.has(id)) setRelationStatus(doc, id, "rejected");
    for (const id of out.marks) deleteHeardMark(doc, id);
    const live = readArgs(doc);
    for (const id of out.positions) if (!live.some((a) => a.positionId === id)) deletePosition(doc, id);
  });
  return { removed, kept };
}
