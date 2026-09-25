import type { DraftTarget } from "@/domain/flow";
import { checkSections, draftTargetsOf } from "@/domain/speech-checks";
import type { Draft } from "@/shared/draft-model";

/** Which flow arguments each section answers, groups, cross-applies, or extends (one definition, client and server). */
export function draftTargetsFromDraft(draft: Draft | null): DraftTarget[] {
  return draftTargetsOf(checkSections(draft));
}
