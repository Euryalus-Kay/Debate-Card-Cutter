import type { SpeechId } from "@/domain/format";

export interface RoundRecord {
  id: string;
  teamId: string;
  title: string;
  tournament: string;
  roundLabel: string;
  division: string;
  resolution: string;
  formatId: string;
  formatOverrides: Record<string, number | string>;
  ourSide: "aff" | "neg";
  roster: Partial<Record<"1A" | "2A" | "1N" | "2N", string>>;
  opponent: { school?: string; code?: string; names?: string };
  judges: { name: string; paradigmText: string; paradigmUrl: string; notes: string; profile?: (import("@/server/ai/paradigm").JudgeProfile & { model?: string; at?: string }) | null; profileError?: string | null }[];
  status: "active" | "archived";
  aiPolicy: "allowed" | "prep_only" | "off";
  phase: "prep" | "live" | "done";
  aiOverride: { by: string; at: string; reason: string } | null;
  speakerOverrides: Partial<Record<SpeechId, string>>;
  settings: { omissionPolicy?: "nsda" | "permissive"; judgeKick?: string; prepOverage?: "warn" | "deduct"; ruleSet?: import("@/domain/rules").RuleSetId; ruleText?: string };
  stateDocId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftRecord {
  id: string;
  speech: SpeechId | null;
  title: string;
  variant: string;
  status: "draft" | "delivered" | "archived";
  updatedAt: string;
  deliveredAt: string | null;
  createdBy: string | null;
}

export interface UploadRecord {
  id: string;
  fileName: string;
  attribution: { speech?: SpeechId; owner?: "opponent" | "us"; confirmedDelivered?: boolean; uploadedBy?: string; uploadedAt?: string; flowedAt?: string };
  parseResult: { quality?: { characters: number; paragraphs: number; cards: number; analytics: number; headings: number; formatted: boolean; likelyScanned?: boolean }; warnings: string[]; kind?: string };
  createdAt: string;
  createdBy: string | null;
  status: string;
}

export interface RoundBundle {
  round: RoundRecord;
  drafts: DraftRecord[];
  uploads: UploadRecord[];
}
