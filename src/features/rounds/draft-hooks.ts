"use client";

import type * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { useYDocValue } from "@/client/sync/hooks";
import { DRAFT_FRAGMENT } from "@/shared/editor/schema";
import { draftFromPM, type Draft, type PMNodeJSON } from "@/shared/draft-model";
import type { DraftTarget } from "@/domain/flow";
import { checkSections, draftTargetsOf } from "@/domain/speech-checks";

export function draftOf(doc: Y.Doc): Draft {
  const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(DRAFT_FRAGMENT)) as PMNodeJSON;
  return draftFromPM(json);
}

export function useDraft(doc: Y.Doc | null | undefined): Draft | null {
  return useYDocValue(doc, draftOf);
}

export function draftTargets(draft: Draft | null): DraftTarget[] {
  return draftTargetsOf(checkSections(draft));
}
