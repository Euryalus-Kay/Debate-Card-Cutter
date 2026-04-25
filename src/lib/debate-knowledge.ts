/**
 * Debate knowledge base — the strategic and theoretical foundation that
 * informs every prompt the app sends to Claude. Keep this single source of
 * truth so all features speak the same language.
 *
 * Audience: a coach who has worked at Michigan 7-Week, Northwestern, Harvard,
 * Georgetown, and the DDI. Voice: technical, direct, no hedging.
 */

export const SPEECH_FUNDAMENTALS = `THE EIGHT POLICY DEBATE SPEECHES

Constructives (8 minutes each):
- 1AC — First Affirmative Constructive. Reads the case: plan, advantages, solvency.
- 1NC — First Negative Constructive. Introduces ALL off-case (DAs, CPs, Ks, T) plus case attacks. The neg's only chance to introduce new arguments — anything not here, the neg cannot run later.
- 2AC — Second Affirmative Constructive. Answers the entire 1NC. Drops = concessions. Must rebuild case + answer every off-case position. Most technical speech for the aff.
- 2NC — First half of the negative block. Goes deep on 2-3 strongest positions. Splits with 1NR.

Rebuttals (5 minutes each):
- 1NR — Second half of the negative block. Covers what the 2NC didn't — usually case + remaining off-case. The 13-minute neg block ends here.
- 1AR — The hardest speech in policy debate. 5 minutes against 13 minutes. Must group, cross-apply, extend. Cannot go line-by-line on everything.
- 2NR — Final neg. Collapse to 1-2 arguments. Impact comparison decides the round.
- 2AR — Final aff. Tells the judge how to vote. Often the closer of the round; cannot introduce new arguments.

CRITICAL ASYMMETRY: The 13-minute neg block (2NC + 1NR) against the 5-minute 1AR is the structural feature of policy debate. Every aff strategy works backward from making the 1AR survivable. Every neg strategy works forward from converting block dominance into 2NR offense.`;

export const SPEECH_TIME_BUDGETS: Record<string, { totalMin: number; cardSeconds: number; analyticSeconds: number; minSections: number; maxSections: number }> = {
  "1AC": { totalMin: 8, cardSeconds: 30, analyticSeconds: 20, minSections: 10, maxSections: 18 },
  "1NC": { totalMin: 8, cardSeconds: 25, analyticSeconds: 15, minSections: 15, maxSections: 28 },
  "2AC": { totalMin: 8, cardSeconds: 25, analyticSeconds: 12, minSections: 14, maxSections: 24 },
  "2NC": { totalMin: 8, cardSeconds: 28, analyticSeconds: 18, minSections: 10, maxSections: 18 },
  "1NR": { totalMin: 5, cardSeconds: 24, analyticSeconds: 12, minSections: 6, maxSections: 12 },
  "1AR": { totalMin: 5, cardSeconds: 18, analyticSeconds: 8, minSections: 8, maxSections: 16 },
  "2NR": { totalMin: 5, cardSeconds: 30, analyticSeconds: 22, minSections: 5, maxSections: 10 },
  "2AR": { totalMin: 5, cardSeconds: 25, analyticSeconds: 25, minSections: 5, maxSections: 9 },
};

export const ARGUMENT_ARCHETYPES = `ARGUMENT ARCHETYPES — KNOW THESE COLD

DISADVANTAGE (DA) — Claim: the plan triggers a chain of bad consequences.
Components: Uniqueness → Link → Internal Link → Impact.
- Uniqueness: status quo is heading the right direction (or stable, or on the brink).
- Link: the plan disrupts that trajectory.
- Internal Link: the disruption causes a chain reaction.
- Impact: the terminal harm (war, recession, extinction, structural violence).
Common variants: politics DAs (election/agenda), economy DAs, hegemony DAs, relations DAs (China, Russia, NATO), tradeoff DAs.
Must answer: not link, no uniqueness, link turn, impact turn, non-unique. Never link AND impact turn the same DA.

COUNTERPLAN (CP) — Claim: a different policy solves better than the plan.
Components: CP text → Solvency → Net benefit → Competition.
- Competition: must be either mutually exclusive OR net beneficial. Otherwise, perm do both wins.
Common variants: states CP, agent CPs (XO, courts), advantage CPs, PICs (plan-inclusive), consult CPs, condition CPs.
Standard aff answers: perm do both, perm do CP, solvency deficit, theory (condo bad, PICs bad, etc.), net benefit answers.
2NR collapse with CP: usually CP + DA (DA is the net benefit).

KRITIK (K) — Claim: the aff's epistemology, ontology, or political assumption is the problem.
Components: Link → Impact (implications) → Alternative → Framework / role of the ballot.
Common literature bases: Capitalism (Marx, Tucker, McNally), Security (Nayar, Cuomo), Anthropocentrism (Best, Kochi), Settler Colonialism (Wolfe, Tuck & Yang), Afro-pessimism (Wilderson, Sexton), Queer Theory (Edelman, Halberstam), Disability (Schalk, Kafer), Baudrillard (Hyperreality), Deleuze (Rhizome), Foucault (Biopower), Heidegger (Technology), Lacan (Real), Wynter (Genre of Man), Fanon, Gilmore, Spivak.
Aff answers: framework (util, fairness), perm (do both, do plan + endorse alt), no link, link turns, alt fails, case outweighs, link of omission, cede the political bad.

TOPICALITY (T) — Claim: the aff is not within the resolution.
Components: Interpretation → Violation → Standards → Voters.
Standards: limits, ground, predictability, education, bright line, precision.
Voters: fairness, education, jurisdiction.
Aff: we meet, counter-interp, reasonability, no abuse.

THEORY — Claim: the opposing team did something procedurally illegitimate.
Common: condo bad, PICs bad, multiple actor fiat bad, intl fiat bad, agent CPs bad, consult CPs bad, severance bad, intrinsic perms bad.
Standard format: interp / violation / standards / voters. Many circuits weigh as a "reject the team" voter only when explicitly extended; otherwise reject the argument.

PERMUTATION TYPES (against CPs/Ks):
- Perm do both: plan + entirety of CP/alt.
- Perm do the CP: plan and CP are functionally identical (proves not competitive).
- Perm do the plan and the alt: do plan and endorse the K's alt (most common against Ks).
- Time-shifted perms: do the plan now, alt later (rarely legit).
- Conceptual perms (against Ks): "endorse the methodology of the alt while doing the plan" — non-textual, judges split on legitimacy.`;

export const IMPACT_CALCULUS = `IMPACT CALCULUS — THE SKILL THAT WINS ROUNDS

The 2NR/2AR is decided on impact comparison, not the line-by-line. Comparison must be COMPARATIVE, not descriptive. "Our impact is extinction" loses to "Our impact outweighs theirs on probability — a 5% chance of nuclear war outweighs 100% of their economic decline because [warrant]."

THE FIVE COMPARISON AXES:

1. MAGNITUDE — How many die, how much suffering. Extinction > nuclear war > great-power war > regional war > recession > local harm. But magnitude alone doesn't win — you need probability.

2. PROBABILITY — How likely is the impact actually happens? Empirical evidence > scenario evidence > theoretical evidence. "Has happened before" is the strongest probability argument.

3. TIMEFRAME — When does the impact occur? Imminent > medium-term > long-term. Critical when one impact preempts the other ("if their DA happens in 5 years, our advantage prevents extinction in 8 years").

4. REVERSIBILITY — Can the impact be undone? Extinction, climate tipping points, mass extinction = irreversible. Recession, war = potentially reversible. Irreversible impacts have a structural advantage in probability-weighted comparison.

5. SCOPE / SYSTEMIC — Does it affect a structural condition or one event? Capitalism's daily violence > one-time crisis. Used heavily by K teams.

ADVANCED COMPARISON:

- TURNS THE CASE: "Even if they win their advantage, our DA causes the same impact through a different mechanism — so the DA both adds new harm AND prevents their advantage from solving."
- TRY-OR-DIE: "Our impact is so big that even a small probability outweighs any defense — the only way to prevent extinction is to vote aff."
- LINK MAGNIFIERS: "The plan's link to the DA is direct and causal, while their advantage requires multiple intervening actors."
- "EVEN IF" LAYERING: Pre-empt their answers. "Even if they win [X], we still win because [Y]."

NEVER write "we outweigh on magnitude, probability, and timeframe" without warrants. That's not impact calculus, that's a list.`;

export const CARD_CUTTING_FUNDAMENTALS = `EVIDENCE CARD ANATOMY

A debate card has three parts:

1. TAG — The claim the card supports. Bold, underlined when printed. 1-2 sentences max. Must be a CLAIM, not a description. Bad: "Spending DA — link." Good: "Climate spending crowds out private investment — investor surveys prove the link is causal."

2. CITATION — Author, year, credentials, title, date, URL, accessed date, cutter's initials. Standard format:
"Hansen and Brooke 23 (Christopher Hansen, Senior Fellow at Brookings, and Sarah Brooke, Professor of Economics at Stanford. 'The Cost of Climate Subsidies' Brookings.edu, 5/12/23. https://www.brookings.edu/articles/...) [accessed 4/3/24] cdh"

3. EVIDENCE — A continuous, VERBATIM block of text from the source. Standard length: 6-25 paragraphs of original text, with key portions highlighted via <mark> tags.

HIGHLIGHTING RULES:
- The highlighted portions, when read in sequence, must form coherent grammatical sentences.
- The highlight includes warrants, not just claims.
- Non-highlighted text provides context the judge can read but the debater doesn't speak.
- Lazy highlighting (single-word highlights with no warrant) signals weak evidence.

NEVER MODIFY THE EVIDENCE TEXT. Only add <mark> tags. Paraphrasing source text is "clipping cards" and is grounds for round loss in many circuits.

CARD QUALITY HIERARCHY (camp filing standard):
1. Peer-reviewed academic articles (top — IR, security, law journals)
2. Major think tank reports (Brookings, RAND, CSIS, Heritage, Cato, AEI)
3. Government testimony / Congressional research (CRS reports)
4. Quality journalism with named expert authors (NYT op-eds, FA, Lawfare, FP)
5. Industry / trade publications
6. Lower-quality blogs (avoid for high-stakes cards)`;

export const CROSS_EX_FUNDAMENTALS = `CROSS-EXAMINATION — 3 MINUTES TO SET UP THE NEXT SPEECH

CX is not a separate event — it is preparation for the speech that immediately follows. Every question should advance one of:

1. CLARIFY: Pin down vague claims so the next speech can target them. ("So the plan acts through which agency?")
2. CONCEDE: Get them to admit something on tape. ("You agree that current spending is unsustainable, right?")
3. CONTRADICT: Expose internal contradictions in their case. ("The 1AC says X is happening now, but advantage 2 says X is uniquely caused by the plan — which is it?")
4. SETUP: Plant seeds for the next speech's offense. ("If the plan only covers federal actors, would a state action solve?")

QUESTION CRAFT:
- Start broad ("How does your aff work?"), then narrow.
- Pin to specific claims, not generalities.
- Force binary answers when you have offense lined up.
- "Yes/no" questions when the answer matters; open questions when scope is the goal.
- If they're vague, repeat the question. The judge will notice.
- Don't argue in CX — set up the argument for the speech.

ANSWERING:
- Be brief. Don't give away the case.
- If asked about evidence quality, be confident: "We have authoritative sources that support each component of our argument."
- "I don't know" is a legitimate answer for highly technical specifics.
- Don't make new arguments in CX — wait for your speech.
- Push back on bad-faith framing: "That's not what the evidence says, but I'd love to walk you through what it does say."

JUDGE PERCEPTION: CX matters for speaker points. A debater who controls CX gets 28.5+; a debater who is dominated gets 27 even if they win on the flow.`;

export const JUDGE_PARADIGMS = `JUDGE PARADIGM TAXONOMY

POLICYMAKER — Default circuit paradigm. Weighs the round as if making a federal policy decision.
- Loves: clear impact calculus, link defense, evidence quality.
- Hates: tricks, theory blips, K aff-style framework rejections.
- Strategy: read DA + CP, focus on impact comparison.

TABULA RASA (TAB) — "I evaluate whatever you tell me to evaluate."
- Loves: clear weighing, technical execution, judge instruction.
- Hates: assertions without warrants, "ROTB is X" without justifying it.
- Strategy: explicitly TELL them how to vote. "If you believe X, vote Y."

GAMES PLAYER — Treats debate as a competitive activity, not policy simulation.
- Loves: theory, T, tricks, framework debate.
- Hates: heavy moralizing, K affs that reject competition.
- Strategy: theory and procedural arguments are live.

CRITICAL / K-LEANING — Often a former K debater. Believes in epistemological / structural critiques.
- Loves: K links, alt solvency, lit-deep K extensions, K affs.
- Hates: framework that excludes Ks, "policy good" tag-line evidence.
- Strategy: deep K extensions, framework debate.

LAY / TRADITIONAL — Parent judge or non-circuit judge.
- Loves: clear speaking, persuasive narrative, common-sense impacts.
- Hates: spreading, theory, K, jargon, blippy extensions.
- Strategy: SLOW DOWN. Read evidence clearly. Avoid debate jargon. Focus on 2-3 big arguments. No theory, no K.

TECH OVER TRUTH — Decides off the flow regardless of how implausible the argument is.
- Loves: technical concessions, dropped arguments, line-by-line.
- Hates: "this argument is just absurd" hand-waving without flow execution.
- Strategy: drop nothing. Extend everything technically.

TRUTH OVER TECH — Will not vote for arguments that are clearly false.
- Loves: real-world plausibility, ev quality.
- Hates: tricks, troll args, abusive theory.
- Strategy: invest in your strongest argument; don't read garbage just because it might go conceded.

ADAPTATION HEURISTICS:
- 80%+ of circuit judges are Tech leaning. Default tech unless paradigm says otherwise.
- Lay judges: drop your block of T to focus on case-vs-case substance.
- Critical judges on neg: lead K, downplay theory.
- Critical judges on aff: be ready for framework + K affs.
- ALWAYS read the paradigm. Most paradigms are 1-2 paragraphs and tell you exactly what to do.`;

export const COLLAPSING_AND_KICKING = `COLLAPSING & KICKING — STRATEGIC DEPTH OVER BREADTH

THE CORE INSIGHT: 1NC width creates strategic flexibility, but you can only WIN by going deep. The 2NR collapses to 1-2 positions; everything else is a smokescreen.

WHEN TO KICK (2NC/1NR):
- The 2AC had a devastating answer (link turn + impact turn handled well).
- The position only existed to spread the aff thin (e.g., 5 off-case in 1NC, but you can only carry 3 in the block).
- A stronger argument deserves the time investment.
- The opponent has a clear concession that wins another argument.

HOW TO KICK:
- Soft kick: don't mention it in the next speech. Aff will likely point it out, but most judges allow this.
- Hard kick: "We're going to focus on [X] and [Y]." Cleanest.
- Conditional kick: "We'll go for [X] in the 2NR but if not, the rest of the flow is irrelevant."

KICKING COSTS:
- Theory: if aff read condo bad, kicking signals you have multiple advocacies. Be ready.
- Speaker points: judges don't like sloppy kicks. Be deliberate.
- Block efficiency: kicking should free up time for depth, not just save effort.

2NR COLLAPSE COMBINATIONS:
- CP + DA: Gold standard. CP solves the aff; DA is the net benefit. Mutual exclusivity often natural.
- DA alone (status quo): Status quo solves their advantages, DA outweighs. Need strong case defense.
- K alone: 5 minutes on framework + links + impacts + alt + answer perms.
- T alone: rare but viable when you've extended standards in the block.
- DA + case: aff has bad solvency, DA outweighs.
- CP + K: unusual but viable when CP solves AND K critiques the aff's framework.

NEVER GO FOR:
- Both T and CP at the same time (T means the aff is non-topical, but CP affirms the topic).
- Both K and T (K critiques the resolution; T defends it).
- Three positions for a minute each.

BACKWARD INDUCTION: Pick your 2NR before the 2NC. Allocate block time accordingly.`;

export const FLOW_CONVENTIONS = `FLOWING CONVENTIONS — HOW TO READ A FLOW

A flow is a column-per-speech grid. Arguments flow horizontally; speeches go vertically (left = first speech).

NOTATION:
- ↓ = extension (this argument continued from previous speech)
- ← = cross-application (extending from another argument)
- xxxxx = dropped (no response when one was required)
- ↻ = turn (response that flips the argument)
- + = conceded (opponent agreed)
- ? = unclear what they said
- // = end of section / position kicked

CATEGORIES (top of flow):
- 1AC structure: Inherency → Plan → Adv 1 (UQ, IL, Impact) → Adv 2 → Solvency
- 1NC off-case: T → Theory → CP → DA → K (one column each)
- 1NC on-case: separate column, often called "case" or annotated under each adv

TRANSCRIBING:
- Write in shorthand. Top debaters write 60+ wpm.
- Citations: just author + year. ("Hansen 23 — link.")
- Numbers responses: 1, 2, 3. (Lets you cross-apply by number later.)
- Implications: write the conclusion, not the warrant. ("→ extinction" not "...so we all die.")

EXTENSIONS:
- Every argument extension MUST include: claim, warrant, impact (or implication for the round).
- "Extend our 2AC #3" with no warrant is incomplete extension. Judge can drop it.
- Cross-applications must be EXPLICIT. "Cross-apply our heg good evidence to their China DA — proves their impact is non-unique."

DROPPED ARGUMENTS:
- An argument is "dropped" only if the opponent had reason to address it AND didn't.
- The judge should mark dropped args. The next speech should call them out: "They dropped our [X] — that's a conceded [Y]."
- Always check: am I sure they dropped it? Look for cross-applications first.`;

export const COMMON_DEBATE_TOPICS = `RECENT POLICY TOPICS (knowledge base for prompts)

2024-25: HS Policy — IPR Reform. Resolved: The United States federal government should significantly strengthen its protection of domestic intellectual property rights in copyrights, industrial design rights, patents, and/or trademarks.

2023-24: HS Policy — Fiscal Redistribution / Anti-Poverty. Resolved: The United States federal government should substantially increase fiscal redistribution in the United States by adopting a federal jobs guarantee, expanding Social Security, and/or providing a basic income.

2022-23: HS Policy — Security Cooperation. Resolved: The United States federal government should substantially increase its security cooperation with the North Atlantic Treaty Organization in one or more of the following areas: artificial intelligence, biotechnology, cybersecurity.

2021-22: HS Policy — Water Resources. Resolved: The United States federal government should substantially increase its protection of water resources in the United States.

2020-21: HS Policy — Criminal Justice Reform. Resolved: The United States federal government should enact substantial criminal justice reform in the United States in one or more of the following: forensic science, policing, sentencing.

2019-20: HS Policy — Arms Sales. Resolved: The United States federal government should reduce its arms sales to Saudi Arabia, Bahrain, Egypt, Israel, Jordan, Kuwait, Oman, Qatar, and/or the United Arab Emirates.

For each topic, common archetypes are: heg/IR-focused affs, economy affs, structural impact affs, K affs (refusing the resolution's framing), states CPs, agent CPs, politics DAs (currently relevant election + agenda DAs), Cap K, Set Col K, Security K.`;

export const STRATEGIC_PRINCIPLES = `STRATEGIC FIRST PRINCIPLES — apply these to every recommendation.

1. THE FLOW IS LAW. Drops are concessions. Extensions need warrants. Judge follows the flow.

2. COLLAPSE WINS ROUNDS. Reading more arguments doesn't beat reading better. The 2NR exists to invest depth.

3. BACKWARD INDUCTION. The 1AC sets up the 2AR. The 1NC sets up the 2NR. Every speech serves the terminal speech.

4. JUDGE ADAPTATION ISN'T OPTIONAL. The same args earn 29.5 before one judge and 27 before another.

5. IMPACT CALCULUS IS COMPARATIVE. "Our impact is X" is descriptive. "Our impact outweighs because Y" is comparative. Only the second wins.

6. WARRANTS BEAT EVIDENCE QUALITY. A logically warranted analytic with a clear story beats a card with a great author and no clear claim.

7. CARDS ARE TOOLS, NOT ARGUMENTS. The argument is the analytic explanation. The card is supporting evidence. Top debaters READ THE CARD'S WARRANT.

8. SLOWING DOWN AT KEY MOMENTS. Spread the body, slow the impact calc. Slow down for tags and the 2NR/2AR.

9. EFFICIENT CROSS-APPLICATIONS. "Our 2AC #3 applies here" beats re-reading. Lifts dead time off the flow.

10. SIGNPOSTING DETERMINES FLOW QUALITY. Number every response. "On their 2AC #3, three responses: first... second... third..." beats free-form prose.

11. THEORY IS A TOOL, NOT A CRUTCH. Read condo against 4+ off-case. Read PICs bad against PICs. Don't read theory blips just to fill time.

12. CONCESSIONS HAVE PRECEDENCE. Once conceded, an argument is true even if it contradicts other arguments. "They conceded uniqueness — even if they win the link, the impact is non-unique."`;
