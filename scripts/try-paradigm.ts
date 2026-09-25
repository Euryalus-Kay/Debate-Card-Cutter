/**
 * Live check of judge-profile extraction on a SYNTHETIC paradigm (3 runs, for stability).
 * The model comparison that chose the registry entry is recorded in models.ts.
 */

// SYNTHETIC FIXTURE (not a real judge)
const PARADIGM = `Jordan Rivera (synthetic example). I debated four years of high school policy and now coach at a small school.
Speed: I can handle moderate speed, but slow down on tags and analytics. If I can't flow it, I won't evaluate it.
Please add me to the email chain; I want the speech docs.
Topicality: I default to competing interpretations and enjoy a good T debate.
Counterplans are fine, but I lean aff on process counterplans.
Conditionality: one or two conditional advocacies are fine. More than that and I'm receptive to condo bad.
Kritiks: I'm less familiar with high theory, so explain the alternative clearly.
I will not judge kick unless the 2NR tells me to.
New arguments in the 2NC are fine.
Tech over truth, but truth matters when the tech is close.
Tabula rasa, but please don't make me do the work.`;

import { extractJudgeProfile } from "@/server/ai/paradigm";
for (let i = 0; i < 3; i++) {
  const r = await extractJudgeProfile(PARADIGM, null);
  console.log(`run ${i + 1}: ${r.model} ${r.ms}ms speed=${r.profile.speed.value} judgeKick=${r.profile.judgeKick.value} condo=${r.profile.condo.value} kritiks=${r.profile.kritiks.value} dropped=${JSON.stringify(r.dropped)}`);
}
