import type { RoundRecord } from "./types";

/** In-round AI follows the round's rule set (tournament rules can turn it off). */
export function aiEnabledFor(round: RoundRecord): boolean {
  if (round.aiOverride) return true;
  if (round.aiPolicy === "allowed") return true;
  if (round.aiPolicy === "prep_only") return round.phase === "prep";
  return false;
}
