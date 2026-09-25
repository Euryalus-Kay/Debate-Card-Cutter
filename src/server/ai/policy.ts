/** Per-round AI policy (tournament rules): allowed, prep only, or off. A human override wins. */
export function aiAllowed(round: { aiPolicy: string; phase: string; aiOverride: unknown }): boolean {
  if (round.aiOverride) return true;
  if (round.aiPolicy === "allowed") return true;
  if (round.aiPolicy === "prep_only") return round.phase === "prep";
  return false;
}
