"use client";

import { createContext, useContext } from "react";
import type { RoundGraph } from "@/domain/flow";
import type { RateProfile } from "@/domain/timing";

/** Round data that editor node views need (rendered through portals, so context works). */
export interface EditorRoundContext {
  graph: RoundGraph | null;
  rates: RateProfile;
  userId: string;
  userName: string;
  partnerSections: Map<string, string>;
  aiEnabled: boolean;
  onSectionAi: (sectionId: string, action: string) => void;
  onCardOpen: (cardId: string | null, instanceId: string) => void;
}

export const EditorRoundCtx = createContext<EditorRoundContext | null>(null);

export function useEditorRound(): EditorRoundContext {
  const v = useContext(EditorRoundCtx);
  if (!v) throw new Error("EditorRoundCtx missing");
  return v;
}
