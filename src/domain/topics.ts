/**
 * What the AI knows about the season's topic: the resolution, its key terms and topicality readings, the
 * likely affirmatives and negative positions, the literature and its authors, and the theory debates this
 * topic produces. Condensed from docs/research/topic-nhi.md (sources there). It is background for
 * understanding arguments and planning research; it is never evidence. A speech may state a fact only when a
 * card in the speech says it, so the brief names who argues what without figures a model could repeat.
 */

export interface TopicPack {
  id: string;
  season: string;
  resolution: string;
  /** matches a round's resolution text */
  match: RegExp;
  /** the full brief for drafting, updates, cross-ex, file plans and gap reviews */
  brief: string;
  /** a short glossary for reading flow notes */
  glossary: string;
  /** names of this topic's common positions, to list them first among the library's arguments */
  positions: RegExp;
}

const NHI_BRIEF = `TOPIC BRIEF — 2026–27 NSDA/NFHS policy topic (background for understanding and planning; NOT evidence: never quote it, cite it, or state its facts in a speech unless a provided card says them)
Resolution: "Resolved: The United States federal government should establish national health insurance in the United States." Novice case list (NFHS, March 2026): Medicare for All; revise or expand the ACA; a single-payer system that replaces private insurance. Last high school health topic: 1993–94.

KEY TERMS AND TOPICALITY
- "National health insurance": neg reads it as single payer only (one public pool and payer separate from providers; Cuadrado et al., Health Policy 2019; T.R. Reid's four models; PNHP; CBO contrasts single payer with regulated multi-payer systems). Aff reads it as any government-guaranteed universal system, including statutory multi-payer designs (House Energy & Commerce staff memo 2019 called Medicare for America NHI; Nixon's and Clinton's multi-payer plans; the topic synopsis lists a public option, mandate and catastrophic coverage as aff ground).
- "Establish": neg — create something new (excludes ACA tweaks); aff — also "make firm or stable" (Black's), and the M4A bills are titled "to establish" a program built on Medicare.
- "In the United States": statute-specific (Social Security Act: the States, DC, Puerto Rico); aff — covering every resident counts.
- "USFG": the three branches; T-USFG/framework against planless affs; agent CPs; NFIB v. Sebelius (Medicaid coercion; mandate as a tax).
- Common T shells: NHI = single payer (the marquee violation; hits public option, ACA, mandate, catastrophic, multi-payer affs); T-universal (must cover the national population; hits subset affs like children or long-term care); insurance ≠ a national health service (hits NHS-style affs); establish = create. Standards: limits, ground, predictability, precision; competing interpretations vs reasonability; framers' intent from the synopsis and novice list.

AFFIRMATIVES
- Single payer / Medicare for All (H.R. 3069 / S. 1506, 2025: bans duplicative private coverage, two-year phase-in, covers abortion). Advantages: coverage and lives, costs and administrative waste, pandemic preparedness, medical debt, disparities, rural hospitals, the economy and the fiscal room it frees (e.g. defense-spending and nuclear-reliance scenarios), inequality.
- Opt-out multi-payer ("Medicare for America"), universal catastrophic coverage, a public option (weakest on T), children's NHI (MediKids, 2026), long-term care insurance (WISH Act), Indigenous or territorial NHI, K affs (health communism, disability, racialized medicine).
- Aff literature: Galvani et al. (Yale; Lancet 2020, PNAS 2022: savings and lives, pandemics), Cai et al. (PLOS Medicine 2020: most studies predict savings), Himmelstein, Campbell & Woolhandler (administrative costs), Pollin et al. (PERI 2018), Kahn, Gaffney, Berkowitz (monopsony pricing, global budgets), Miller/Johnson/Wherry and Goldin/Lurie/McCubbin (coverage cuts mortality), Commonwealth Fund (US last among peers).

NEGATIVE POSITIONS
- DAs: deficits/debt and taxes (Blahous/Mercatus; CBO's single-payer reports; CEA 2018), capital flight and the economy, stock market and transition shocks, pharma innovation (revenue-to-R&D elasticity; answers: Medicare Part D grew R&D; most-favored-nation drug deals and TrumpRx as uniqueness wildcards), politics — the 2026 midterms (November 3, 2026; Republicans hold both chambers; the plan's popularity or unpopularity shifts the Senate; Michigan and other swing races; impacts like Golden Dome or checks on the administration) — the DA expires on election day, hospitals/doctors/wait times (Medicare-rate cuts to hospital revenue; physician shortage; Canadian waits, Fraser Institute), federalism (NFIB), opioids and drug prices, military recruiting, reproductive rights (the abortion clause).
- CPs: states (answers: ERISA preemption, Vermont 2014, Oregon and California stalls, uniformity), universal coverage without single payer (ACA subsidies, auto-enrollment, public option; Urban Institute/Commonwealth Fund 2019 compares costs; CBO near-universal options), NHS CP (government-run providers are not "insurance"), advantage CPs, process CPs (reconciliation, consult states, amendment), PICs from the bill text (drop abortion coverage, allow duplicative private insurance, narrow eligibility), agent CPs.
- Ks: capitalism (Adler-Bolton & Vierkant, Health Communism), biopolitics and surveillance, racial capitalism, settler colonialism (IHS underfunding; M4A leaves IHS and VA intact), disability (QALY-based rationing), medicalization (Illich), afropessimism, security; framework against K affs.
- Case turns and defense: coverage ≠ health (Oregon Medicaid experiment, Baicker et al.), wait times and unmet demand, hospital closures, innovation, transition costs, lobbying blocks passage (durable fiat answers).

CURRENCY (dated; uniqueness moves)
The 2025 reconciliation act (P.L. 119-21) cut Medicaid and raised projected uninsured; enhanced ACA subsidies expired Dec. 31, 2025 and marketplace enrollment fell in 2026; the Senate stalled on an extension over Hyde language; the administration's health framework (Jan. 2026) proposes paying subsidy money to individuals and codifying most-favored-nation drug pricing; CBO projects large deficits and an earlier Medicare trust fund date; Rural Health Transformation awards (Dec. 2025) are non-uniqueness for rural advantages; state single-payer efforts stalled in 2026; Medicaid work requirements begin Jan. 1, 2027; the midterms are Nov. 3, 2026.`;

const THEORY = `THEORY ON THIS TOPIC (how these debates usually go; tune to the judge)
- Conditionality: neg — argument testing, neg flexibility against a prepared aff, the 2AC can perm, reciprocity; aff — strategy and time skew, contradictory positions, the 2AC can't answer every world. A common middle ground is one conditional CP and one conditional K. The 2NR may kick conditional positions; ask the judge to kick the CP if it loses (judge kick) when going for it.
- Perms: perm do both (show the plan and CP coexist and the net benefit is avoided or outweighed), perm do the CP (when the CP is a version of the plan, e.g. a public option read as NHI), perm do the plan and the non-competitive parts. Neg answers: links to the net benefit, mutually exclusive, severance (cuts part of the plan) and intrinsic (adds something) are voting issues or rejected.
- States CP: aff — 50-state uniform fiat is utopian (no single actor could do it), ERISA and uniformity solvency deficits, federalism links to the CP; neg — "federal government" is the topic's core ground, states test federal action, the literature debates state single payer.
- NHS CP: competes on "insurance" (a national health service isn't insurance) and on "national"; aff — perm do both, NHS-style systems are NHI under broad definitions, word PICs are bad.
- PICs (drop abortion coverage, allow duplicative private insurance, narrow eligibility): aff — PICs bad (steal aff ground, infinite regress), perm do the CP, the plank is key to solvency; neg — PICs test every part of the plan and come from the bill text and literature.
- Advantage and multi-plank CPs: aff — multi-plank fiat is abusive, solvency deficits, perm; neg — advantage CPs test whether the plan is needed.
- Process CPs (consult states, reconciliation, courts, amendment): aff — competition only through "should" meaning immediate and certain is illegitimate, perm do the CP, process CPs bad; neg — the process is in the literature and changes the outcome.
- Topicality: competing interpretations vs reasonability; limits, ground, predictability and precision; T is a voter for fairness and education; the aff answers with we meet, a counter-interpretation, offense against the neg's reading, and reasonability.
- Specification (ASPEC, financing or payment-mechanism spec): aff — cross-ex checks, normal means, no abuse, infinite regress of spec arguments; neg — financing is the core link ground on this topic.
- Framework against planless affs (T-USFG): neg — fairness, limits, clash and topic education; aff — counter-interpretations and impact turns.`;

const NHI_GLOSSARY = `TOPIC GLOSSARY (2026–27 national health insurance topic): NHI = national health insurance; M4A = Medicare for All (H.R. 3069 / S. 1506); SP = single payer; PO = public option; NHS = a national health service (NHS CP); ACA = Affordable Care Act; ERISA = the law that preempts state health plans for employers; MFN = most-favored-nation drug pricing; IHS = Indian Health Service; CBO = Congressional Budget Office; PDB = perm do both; PDCP = perm do the counterplan; ASPEC = agent specification; condo = conditionality; UQ/U = uniqueness; L = link; IL = internal link; I = impact; OV = overview; FW = framework; T = topicality; K = kritik; DA = disadvantage; CP = counterplan; midterms DA = the November 3, 2026 election.`;

export const TOPICS: TopicPack[] = [
  {
    id: "nhi-2026",
    season: "2026–27",
    resolution: "Resolved: The United States federal government should establish national health insurance in the United States.",
    match: /national\s+health\s+insurance|health\s+insurance/i,
    brief: `${NHI_BRIEF}\n\n${THEORY}`,
    glossary: NHI_GLOSSARY,
    positions: /midterm|politics|capital flight|deficit|tax|pharma|innovation|states? cp|nhs|public option|\baca\b|universal|single.?payer|\bnhi\b|multi.?payer|national health|medicare|coverage|costs|inequality|hospital|wait|federalism|commodif|health/i,
  },
];

/** The season's topic, used when a round doesn't name its resolution. */
export const CURRENT_TOPIC = TOPICS[0];

/** The topic a resolution is about; an empty resolution means this season's topic. */
export function topicFor(resolution: string | null | undefined): TopicPack | null {
  const r = (resolution ?? "").trim();
  if (!r) return CURRENT_TOPIC;
  return TOPICS.find((t) => t.match.test(r)) ?? null;
}
