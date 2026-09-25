/**
 * What a card is cut for (Phase D): the speech sets how long the excerpt and the read should be. Medians
 * measured on real camp files (docs/research/highlighting.md §2.3): later speeches read fewer words per
 * card by using shorter cards, not thinner highlighting (about 14% of the body in every speech).
 */
import type { SpeechId } from "./format";

export const CARD_USES = ["1AC", "1NC", "2AC", "block", "1AR", "rebuttal"] as const;
export type CardUse = (typeof CARD_USES)[number];

export const CARD_USE: Record<CardUse, { label: string; readWords: number; excerptWords: [number, number] }> = {
  "1AC": { label: "1AC", readWords: 88, excerptWords: [450, 750] },
  "1NC": { label: "1NC", readWords: 74, excerptWords: [350, 600] },
  "2AC": { label: "2AC", readWords: 64, excerptWords: [300, 550] },
  block: { label: "2NC / 1NR block", readWords: 67, excerptWords: [300, 500] },
  "1AR": { label: "1AR", readWords: 57, excerptWords: [250, 400] },
  rebuttal: { label: "2NR / 2AR", readWords: 57, excerptWords: [250, 400] },
};

export function cardUseFor(speech: SpeechId): CardUse {
  if (speech === "2NC" || speech === "1NR") return "block";
  if (speech === "2NR" || speech === "2AR") return "rebuttal";
  return speech;
}
