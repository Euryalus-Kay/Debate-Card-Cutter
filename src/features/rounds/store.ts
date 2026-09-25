"use client";

import { create } from "zustand";
import type { SpeechId } from "@/domain/format";

export type CenterTab = "speech" | "flow";
export type RightTab = "details" | "evidence" | "docs" | "cx" | "ai" | "comments";

interface WorkspaceState {
  roundId: string | null;
  speech: SpeechId | null;
  draftId: string | null;
  center: CenterTab;
  right: RightTab;
  selectedArgId: string | null;
  selectedSectionId: string | null;
  /** the comment thread to show in the Comments tab */
  selectedThreadId: string | null;
  /** card ids the user has selected for the next generation request */
  basket: string[];
  shrinkUnread: boolean;
  set: (p: Partial<Omit<WorkspaceState, "set" | "toggleBasket">>) => void;
  toggleBasket: (cardId: string) => void;
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  roundId: null,
  speech: null,
  draftId: null,
  center: "speech",
  right: "details",
  selectedArgId: null,
  selectedSectionId: null,
  selectedThreadId: null,
  basket: [],
  shrinkUnread: false,
  set: (p) => set(p),
  toggleBasket: (cardId) => set((s) => ({ basket: s.basket.includes(cardId) ? s.basket.filter((x) => x !== cardId) : [...s.basket, cardId] })),
}));
