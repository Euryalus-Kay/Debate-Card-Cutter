import type { DraftTarget } from "@/domain/flow";
import { allSections, type Draft } from "@/shared/draft-model";

export function draftTargetsFromDraft(draft: Draft | null): DraftTarget[] {
  if (!draft) return [];
  return allSections(draft)
    .filter((s) => s.relation !== "none" || s.targets.length > 0)
    .map((s) => ({
      sectionId: s.id,
      title: s.title,
      relation: (s.relation === "none" ? "answers" : s.relation) as DraftTarget["relation"],
      targets: s.targets,
      turn: s.role === "link_turn" || s.role === "impact_turn",
    }));
}
