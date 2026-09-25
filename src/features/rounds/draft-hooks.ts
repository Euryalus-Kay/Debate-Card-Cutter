"use client";

import type * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { useYDocValue } from "@/client/sync/hooks";
import { DRAFT_FRAGMENT } from "@/shared/editor/schema";
import { allSections, draftFromPM, type Draft, type DraftSection, type PMNodeJSON } from "@/shared/draft-model";
import type { DraftTarget } from "@/domain/flow";

export function draftOf(doc: Y.Doc): Draft {
  const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(DRAFT_FRAGMENT)) as PMNodeJSON;
  return draftFromPM(json);
}

export function useDraft(doc: Y.Doc | null | undefined): Draft | null {
  return useYDocValue(doc, draftOf);
}

export function draftTargets(draft: Draft | null): DraftTarget[] {
  if (!draft) return [];
  return allSections(draft)
    .filter((s: DraftSection) => s.relation !== "none" || s.targets.length > 0)
    .map((s) => ({
      sectionId: s.id,
      title: s.title,
      relation: (s.relation === "none" ? "answers" : s.relation) as DraftTarget["relation"],
      targets: s.targets,
      turn: s.role === "link_turn" || s.role === "impact_turn",
    }));
}
