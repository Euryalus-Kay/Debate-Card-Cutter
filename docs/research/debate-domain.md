# Debate Domain Research: High School Policy (CX) Debate

Prepared 2026-09-25 by the debate-domain researcher for the platform rebuild. Every source was accessed on 2026-09-25 unless a row in [Sources](#sources) says otherwise. This document feeds three things: speech-specific AI generation rules, the round data model, and the evaluation suite.

**Evidence tags used below**

| Tag | Meaning |
|---|---|
| **[Rule]** | Official rule text from a governing body or tournament (NSDA manual, NDT standing rules, state associations, 2025–27 invitations) |
| **[Instr]** | Instructional material from an established source (NSDA *Rostrum*, IDEA/Snider, the Bellon manual, NAUDL/UDL curricula, camp-affiliated coaches) |
| **[Pract]** | Practitioner evidence (published judge paradigms, coach blogs such as The 3NR, DebateDrills) |
| **[Tert]** | Tertiary source (Wikipedia, glossaries). Lower confidence, and used only where corroborated or flagged |
| **[Unverified]** | I could not verify it in a source I read. Treat it as an assumption |
| **[Heuristic]** | My own synthesis for product defaults. It must be user-configurable |

---

**Contents:** [Executive summary](#executive-summary-for-engineers) · [0. Season facts](#0-season-facts-202526-and-202627) · [1. Round structure](#1-round-structure-speech-times-and-prep) · [2. Speech duties](#2-what-each-speech-does) · [3. New arguments](#3-new-arguments-in-rebuttals) · [4. Organization and flow](#4-organization-and-flow-mechanics) · [5. Argument types](#5-argument-types-components-and-answers) · [6. Impact calculus](#6-impact-calculus-risk-and-presumption) · [7. Contradictions and kicking](#7-contradictions-kicking-and-the-deterministic-rule-tables) · [8. Judge adaptation](#8-judge-adaptation) · [9. Docs, ethics, in-round rules](#9-speech-documents-evidence-ethics-disclosure-and-in-round-rules) · [10. Speaking rates](#10-speaking-rates-and-a-time-estimation-model) · [11. Glossary](#11-glossary-short-product-oriented) · [A. Requirements](#a-product-requirements-numbered-testable) · [B. Generation rules](#b-speech-specific-generation-rules) · [C. Evaluation cases](#c-evaluation-cases-all-synthetic-argument-names-mirror-202627-camp-topics) · [D. Code cross-check](#d-cross-check-against-the-current-srcdomain-commit-75f52ef) · [Sources](#sources)

## Executive summary (for engineers)

1. **Topic.** The 2026–27 resolution is *"Resolved: The United States federal government should establish national health insurance in the United States."* The 2025–26 resolution was Arctic exploration/development ([NSDA Topics](https://www.speechanddebate.org/topics/)) [Rule]. Novice case limits for 2026–27 allow three affirmatives ([NFHS novice list](https://nfhs.org/stories/2026-2027-policy-debate-novice-case-list-for-health-insurance-)) [Rule].
2. **Speech times are stable, but prep and speaker assignment vary.** 8-3-5 is near-universal in high school, and NDT/CEDA college is 9-3-6 with 10 minutes of prep. **Prep time varies by tournament in the current seasons:** 10 min (Glenbrooks 2026), 8 min (NSDA rules, Michigan 2025, Barkley Forum 2026, Kansas, Missouri, UIL, Utah), and 5 min (Lewis & Clark JWI 2026, NCFCA). NSDA itself moved from 5 to 8 minutes between the 2019–20 and 2022–23 manuals. **Speaker-per-speech is not fixed everywhere:** UIL and Kansas allow reversing the rebuttal order, some teams run "insides" (1A gives the 1AC and 2AR), and Kansas 4-speaker debate lets different students debate each side. The model must treat all of these as data.
3. **Rebuttal rules are conventions, not statutes.** They reduce to one testable principle: *a rebuttal argument must be traceable to that side's prior speech on that flow* ([Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline)). The exceptions are new evidence extending an existing argument, new answers to new arguments, and 2AR extrapolation or impact calculus. Judges vary, especially on "new in the 2NC."
4. **The contradiction and kicking logic has a published, deterministic answer table.** Snider's *Code of the Debater* ch. 22 says which conceded answers neutralize a link turn versus an impact turn. **Non-uniqueness plus a link turn is complementary, not contradictory**; that pairing is the classic "straight turn." The current `detectConflicts` rule `nonunique_undercuts_link_turn` in `src/domain/flow.ts` is inverted relative to these sources (see [§D](#d-cross-check-against-the-current-srcdomain-commit-75f52ef)).
5. **Measured speaking rates are lower than folklore.** Elimination-round 1AC documents at the 2019 and 2021 NDT imply a median of **276 wpm** (10th–90th percentile: **237–318**), counting tags plus highlighted words ([Batterman 2021](https://the3nr.com/2021/05/04/how-fast-do-fast-debaters-speak-a-study/)). Claims of 350–500 wpm are anecdotal. Per the same study, Verbatim's built-in WPM chart (up to 450) "conflates 'reading speed' with 'speaking (out loud) speed.'" The current `very-fast` preset implies roughly 335–340 wpm blended, above the 90th percentile of elite college teams.
6. **Compliance risk for in-round AI assistance (surprising, important).** The NSDA device rule bars receiving "information for competitive advantage from non-competitors," including "other information not generated by the participating competitors in your round." Glenbrooks 2026 disqualifies for "outside assistance." UIL bars coaching during a debate and prohibits partner prompting while a debater has the floor. NCFCA and the Oregon JWI limit in-round internet use to evidence exchange. **No rule I read explicitly addresses AI tools generating arguments mid-round.** NSDA's AI rule covers citation: AI "should not be cited as a source." This needs a product decision and legal/tournament review before the tool is marketed for live rounds.
7. **Doc sharing is moving off email.** Glenbrooks 2026 requires share.tabroom.com and says "there should be no email chains." Barkley encourages it. share.tabroom keeps documents 24 hours and hides emails. Speech docs routinely contain cards that are never read. The norm is "marked at [last word]" plus a marked copy, and clipping means a loss plus zero speaker points under NSDA rules.
8. **Judge information is harder to get programmatically.** Tabroom paradigm and tournament pages now redirect to login (observed 2026-09-25). The TOC site sits behind an anti-bot proof-of-work wall, which I did not bypass. The product must support pasted or imported paradigms. The UIL publishes structured paradigms: 296 Texas state-tournament judges with 1–5 scales. Their kritik acceptability averages **2.96/5** and 25 explicitly reject spreading, a useful "lay-leaning circuit" reference.
9. **Tertiary sources are stale in places.** Wikipedia says Missouri uses 8–4 (4-minute rebuttals). The MSHSAA 2026–27 manual says 8-3-5 with 8 minutes of prep. Always prefer tournament or league rule text.

---

## 0. Season facts (2025–26 and 2026–27)

- **2026–27 policy resolution:** "Resolved: The United States federal government should establish national health insurance in the United States." [Rule] ([NSDA Topics](https://www.speechanddebate.org/topics/))
  - NFHS reported the final two choices on 2025-10-23: Health Insurance, and Nuclear Weapons ("substantially reduce the size and/or restrict the roles of its nuclear weapons arsenal"). The final announcement was scheduled for 2026-01-10 ([NFHS](https://nfhs.org/stories/health-insurance-nuclear-weapons-selected-as-final-choices-for-2026-27-national-policy-debate-topic)) [Rule]. *NFHS's January announcement page returned HTTP 502 when I fetched it. The selection is confirmed through the NSDA topics page.*
- **2025–26 policy resolution:** "Resolved: The United States federal government should significantly increase its exploration and/or development of the Arctic." ([NSDA Topics](https://www.speechanddebate.org/topics/); also printed in the [Michigan 2025 invitation](https://s3.amazonaws.com/tabroom-files/tourns/36458/postings/63319/2025UMHSTournamentInvite.pdf)) [Rule]
- **2026–27 novice case limits** (NFHS, 2026-03-18): (1) Medicare for All; (2) Revise/Expand the Affordable Care Act; (3) a single-payer option replacing private insurance ([NFHS](https://nfhs.org/stories/2026-2027-policy-debate-novice-case-list-for-health-insurance-)) [Rule]. The NDCA Novice Packet "tr[ies] to align" with these limits "while not always guaranteed" ([NDCA](https://www.debatecoaches.org/resources/novice)) [Rule].
- **Argument landscape for synthetic test data:** a camp-file index for this topic lists single-payer, M4A, public option, and ACA affs. It lists Pharma Innovation, Federalism, Midterms, political-capital politics, Interest Rates, and Doctors DAs; States, Consult States, Reconciliation, Public Option, and advantage CPs; and Capitalism, Biopower, Security, and other kritiks ([DebateUS index](https://debateus.org/policy-debate-arguments-national-health-insurance-topic/)) [Pract]. *I read only the index; the content is paywalled.*
- **Contrast (non-NSDA leagues):** Stoa's current Team Policy resolution is "The U.S. Federal Government should substantially reform its agriculture policy" ([Stoa](https://www.stoausa.org/event-descriptions)) [Rule].

---

## 1. Round structure, speech times, and prep

### 1.1 Canonical order (NSDA high school), with the college comparison

| # | Slot | Speaker (default) | HS time (NSDA) | College (NDT) | Notes |
|---|---|---|---|---|---|
| 1 | **1AC** | 1A | 8:00 | 9:00 | Pre-scripted case with plan |
| – | CX of 1A | 2N asks, 1A answers | 3:00 | 3:00 | NDT: "either negative speaker" may ask |
| 2 | **1NC** | 1N | 8:00 | 9:00 | Off-case plus case |
| – | CX of 1N | 1A asks, 1N answers | 3:00 | 3:00 | NDT: "either affirmative speaker" |
| 3 | **2AC** | 2A | 8:00 | 9:00 | Last affirmative constructive |
| – | CX of 2A | 1N asks, 2A answers | 3:00 | 3:00 | NDT: "other negative speaker" |
| 4 | **2NC** | 2N | 8:00 | 9:00 | Starts the negative block |
| – | CX of 2N | 2A asks, 2N answers | 3:00 | 3:00 | NDT: "other affirmative speaker" |
| 5 | **1NR** | 1N | 5:00 | 6:00 | Ends the block |
| 6 | **1AR** | 1A | 5:00 | 6:00 | Answers the 13-minute block (15 in college) |
| 7 | **2NR** | 2N | 5:00 | 6:00 | Last negative speech |
| 8 | **2AR** | 2A | 5:00 | 6:00 | Last speech of the round |
| | Prep (per team) | | **8:00** | **10:00** | Cumulative, used before any speech |

- NSDA: "Each debater must give one and only one constructive speech, one period of questioning, one period of answering, and one rebuttal speech." Prep time for each team is eight minutes. "Judges will determine how time will be kept in the round." Oral prompting by a partner while the speaker has the floor "is discouraged though not prohibited and may be penalized by some judges" ([NSDA HS Unified Manual 2026–27, v2027.1.2](https://docs.google.com/document/d/1hq7-DE6ls2ryVtOttxR4BNpRdP7xUbBr0M3SMYefek8/edit)) [Rule]. *The [NSDA landing page](https://www.speechanddebate.org/high-school-unified-manual/) lists v2027.1.0 (updated 2026-08-01). The linked document I read says v2027.1.2.*
- NDT: speeches are "up to" 9, 3, and 6 minutes. "Each team shall have a cumulative total of ten minutes of preparation time," and overage "shall be deducted from subsequent speeches." Online debates get up to 15 minutes of "Tech Time" ([NDT Standing Rules IV.A](https://nationaldebatetournament.org/about/standing-rules/)) [Rule].
- CX assignment convention: "The debater who isn't speaking next asks the cross-examination questions. This allows the next speaker to prepare" ([NAUDL novice guide](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf)) [Instr]. The same 2N→1A, 1A→1N, 1N→2A, 2A→2N order appears in [Snider](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf) (IDEA, 2008), [NCFCA](https://ncfca.org/rules/team-policy-speaking-order-and-times/), and a 2023–24 [judge cheat sheet](https://s3.amazonaws.com/tabroom-files/tourns/27443/postings/49417/cheat_sheetpolicy2324.pdf) hosted on Tabroom.
- Round length: HS is 64 minutes of speech and CX plus up to 16 of prep, about 80 minutes. College is 72 plus 20, about 92 minutes.

### 1.2 Prep time by tournament and league (verified examples)

| Event | Season | Format | Prep/team | Other rules worth modeling | Source |
|---|---|---|---|---|---|
| NSDA (districts and Nationals default) | 2026–27 | 8-3-5 | **8** | Prompting discouraged, not prohibited; AI must not be cited | [NSDA manual](https://docs.google.com/document/d/1hq7-DE6ls2ryVtOttxR4BNpRdP7xUbBr0M3SMYefek8/edit) [Rule] |
| NSDA (historical) | 2019–20 | 8-3-5 | **5** | Changed to 8 by the 2022–23 manual | [2019–20](https://www.speechanddebate.org/wp-content/uploads/HS-Unified-Manual-2019-2020.pdf), [2022–23](https://s3.amazonaws.com/tabroom-files/tourns/24193/postings/32507/NSDAUnifiedManual.pdf) [Rule] |
| Glenbrooks (IL), Nov 21–23, 2026 | 2026–27 | 8-3-5 | **10** | share.tabroom only ("no email chains"); pre-round disclosure required; outside assistance means disqualification | [Glenbrooks 2026 invite](https://docs.google.com/document/d/1uHSnEMEPZoZfeQ7xt4c6JbV1lD3imaAMJuCK0V5bKI8/edit) [Rule] |
| U. Michigan HS, Nov 7–9, 2025 (TOC octos bid) | 2025–26 | (policy) | **8** | Novices must use the NDCA Novice Packet | [Michigan 2025](https://s3.amazonaws.com/tabroom-files/tourns/36458/postings/63319/2025UMHSTournamentInvite.pdf) [Rule] |
| Barkley Forum (Emory), Jan 23–25, 2026 | 2025–26 | 8-3-5 | **8** | share.tabroom encouraged; students may record opponents' speeches to verify what was read | [Barkley 2026](https://s3.amazonaws.com/tabroom-files/tourns/35556/postings/64996/BarkleyForumforHighSchools2026Invitation.pdf) [Rule] |
| Lewis & Clark JWI (OR), Jan 17–18, 2026 | 2025–26 | 8-3-5 | **5** | OHSSL rules; "internet only for the purpose of sending/receiving evidence documents" | [JWI 2026](https://s3.amazonaws.com/tabroom-files/tourns/38525/postings/66498/2026JWIInvitation.pdf) [Rule] |
| Kansas (KSHSAA) regional/state | 2026–27 | 8-3-5 | **8** | Prep overage "subtracted from that team's next speech"; rebuttal order may be switched; 4-speaker division | [KSHSAA manual](https://www.kshsaa.org/Publications/debatespeechdrama.pdf) [Rule] |
| Missouri (MSHSAA) | 2026–27 | 8-3-5 | **8** | "Prep time will effectively end when the files are shared with an opponent"; no evidence to judges unless requested | [MSHSAA manual](https://www.mshsaa.org/resources/Activities/SpeechAndDebate/Manual.pdf) [Rule] |
| Texas UIL (Section 1001) | undated district-hosted copy | 8-3-5 | **8** | Rebuttal order may be reversed; closed CX; no coaching during a debate; prompting prohibited (loss); rapid delivery "severely penalized" | [UIL CX rules (district-hosted copy)](https://resources.finalsite.net/images/v1749319505/houstonisdorg/ouzyq04eqosj8h6yuv2l/cxrulesandprocedures.pdf) [Rule] |
| Utah (UHSAA) | 2026–27 | 8-3-5 | **8** | Novices limited to a closed evidence deck; no theory or kritiks until January | [UHSAA handbook](https://www.uhsaa.org/Publications/Handbook/ActivitiesSections/SpeechDebate.pdf) [Rule] |
| NCFCA (homeschool, contrast) | current | 8-3-5 | **5** | Assigned CX roles; no "in-and-out speaking"; devices may not be used to research or send/receive information except evidence exchange; evidence prepared before the round; no prep right before CX | [NCFCA times](https://ncfca.org/rules/team-policy-speaking-order-and-times/), [rules](https://ncfca.org/rules/team-policy-debate-event-rules/) [Rule] |
| Stoa (homeschool, contrast) | current | — | — | "Rounds last 75 minutes" | [Stoa](https://www.stoausa.org/event-descriptions) [Rule] |
| Tournament of Champions (UK) | 2026–27 | ? | **[Unverified]** | Site is behind an anti-bot wall; Tabroom pages require login. Wikipedia says the TOC uses NSDA rules, which I did not verify. | — |

Other variants:
- **Alternative-use time** (college): some college tournaments merge prep and CX into 16 minutes of "alternative use time" ([Wikipedia: Structure](https://en.wikipedia.org/wiki/Structure_of_policy_debate)) [Tert].
- **Novice or intro formats:** the Atlanta UDL coach curriculum's introductory format is 4-minute constructives, 2-minute CX, 2-minute rebuttals, and 5 minutes of prep ([AUDL Debate Structure](https://www.atlantadebate.org/coach-curric-debate-structure)) [Instr].
- **Four-minute rebuttals:** Snider's 2008 table lists 4-minute rebuttals ([Snider](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf)). Wikipedia says some states (Missouri, Massachusetts, Colorado) "still use" 8–4 ([Wikipedia](https://en.wikipedia.org/wiki/Structure_of_policy_debate)) [Tert]. That is **contradicted for Missouri** by the 2026–27 MSHSAA manual (5-minute rebuttals). Massachusetts and Colorado are **[Unverified]**.

### 1.3 Speaker-assignment variants (data model must support)

- **Reversed rebuttal order:** UIL: "In rebuttal, either team may present its speakers in reverse order without penalty." Kansas: "A speaker may switch from first to second speaker (or from second to first) for the rebuttal speech" [Rule].
- **"Insides" (ins and outs):** one debater gives the 1AC and 2AR, the other the 2AC and 1AR. "Some judges regard this strategy as illegitimate" ([Bellon glossary](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline)) [Instr]. NCFCA forbids "in-and-out speaking" [Rule].
- **Four-speaker debate (Kansas):** "the coach may designate any two students to represent the affirmative and any two to represent the negative" each round [Rule].
- **Typical partnerships:** debaters pair as 2A/1N and 1A/2N, and "if their job is to speak second... they should be the 'captain'" for that side ([AUDL](https://www.atlantadebate.org/coach-curric-debate-structure)) [Instr].

### 1.4 Cross-examination conventions

- **Closed CX is the formal default.** NSDA requires one questioning period and one answering period per debater [Rule]. UIL: "Each debater shall question one opponent and only that one opponent may respond," and the questioner "may only ask questions and may not comment" [Rule].
- **Open or tag-team CX is judge-dependent.** "Ask the judge if they're okay with this before you do it... can lower your speaker points" ([NAUDL](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf)) [Instr]. "Some judges consider this practice unacceptable" ([Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline)) [Instr]. NDT lets either speaker ask in the first two CX periods [Rule].
- **CX is not a speech.** "Any points made in Cross-Examination must be restated in a speech to be considered" ([judge cheat sheet](https://s3.amazonaws.com/tabroom-files/tourns/27443/postings/49417/cheat_sheetpolicy2324.pdf)) [Instr].
- **Uses of CX:** clarify, set up later arguments, expose contradictions, and ask about "the status of the counterplan" ([Snider](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf); [Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline)) [Instr]. CX time doubles as prep for the next speaker's partner.
- **Questions during prep ("flex prep"):** "Some judges will allow the team taking preparation time to continue asking questions of their opponent" ([Wikipedia glossary](https://en.wikipedia.org/wiki/Glossary_of_policy_debate_terms)) [Tert].

---

## 2. What each speech does

These are the sources for every speech in this section: [Snider](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf) chs. 1, 8, and 17; [Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline) §3; [NAUDL](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf); AUDL on the [2AC](https://www.atlantadebate.org/giving-the-2ac) and [1AR](https://www.atlantadebate.org/giving-the-1ar); [Cheshier on the 1AR](https://www.uvm.edu/~debate/NFL/rostrumlib/CheshierJan'00.pdf) (*Rostrum*, 2000); and [Wikipedia: Structure](https://en.wikipedia.org/wiki/Structure_of_policy_debate) [Tert].

### 1AC (1A, constructive)
- It presents harms or advantages (significance), inherency, the plan text, and solvency. It is "the only one that is written before the debate" (Snider). "Only the first affirmative constructive is comprised solely of cards" ([Batterman 2014](https://the3nr.com/2014/08/20/how-to-never-clip-cards-a-guide-for-debaters/)) [Pract].
- It is strategic: "Write your plan so that it avoids or answers popular arguments" and include preemptive evidence (Snider) [Instr].

### 1NC (1N, constructive)
- It presents the negative's off-case positions (T, DAs, CPs, Ks) and case attacks. Each position must be "logically complete": DAs "need links and impacts"; T needs "definitions, violations, and voting issue"; a CP needs "competitiveness, advantage, and solvency" (Snider) [Instr].
- "Make sure to attack the case... so that the affirmative cannot spend all of its time answering your off-case" (Snider) [Instr].
- Off-case arguments are "generally flowed on a separate sheet of paper each and read before case arguments" ([Wikipedia glossary](https://en.wikipedia.org/wiki/Glossary_of_policy_debate_terms)) [Tert].

### 2AC (2A, last affirmative constructive)
- It must answer every 1NC position. "If negative arguments are not addressed, they are considered conceded" ([Wikipedia](https://en.wikipedia.org/wiki/Structure_of_policy_debate)) [Tert]. It is the "last chance to introduce new issues for the affirmative" (Snider). Add-ons (new advantages) are allowed here (Bellon glossary) [Instr].
- Techniques: number every answer; "Think offense" (turns, perms, disadvantages to the CP); "Spend at least as much time on the case as the negative did"; use 1AC evidence; answer "voting issue" claims specifically; pacing: "If you have 8 minutes, try to have completed 25% of your task in the first 2 minutes, 50% in the first 4" (Snider) [Instr].
- Every off-case position needs at least one answer, but "the 2AC does not have to answer every part of the 1NC's offcase positions" (AUDL). "Your best evidence against the offcase positions should be in this speech... Do not have the 1AR read whatever evidence you don't get to" (AUDL) [Instr].

### 2NC and 1NR (the negative block)
- The block is 13 uninterrupted minutes of negative speaking, so the 1AR "has five minutes to comprehensively extend arguments made in thirteen" (Cheshier) [Instr].
- **Division of labor:** "The 2NC and the 1NR should never cover the same ground" (Snider). "Never double cover" and "'Split the block' before the round starts" (Bellon) [Instr]. The split is usually by flow; "often the 2NC and 1NR will go for different 'worlds' of arguments, enabling the 2NR to go for only 2NC or only 1NR arguments" (Wikipedia) [Tert]. The 1NR often takes prep-intensive arguments because it has "a minimum of 11 minutes" of effective prep (Wikipedia) [Tert].
- **2NC duties:** deal with every 2AC answer on the positions it takes. "Don't drop the turns... Defeating turns is your top priority." Read the best evidence and extra impact evidence. Exploit dropped or double-turned arguments. Begin weighing. "Toss out your weak arguments" but kick them correctly (Snider) [Instr]. It is the last chance for new negative issues (Snider), but judges differ on new off-case positions (§3).
- **1NR duties:** "Don't take any prep time." "Don't repeat what the 2NC has said" (Snider). "Balloon" an issue, anticipate the 1AR, and "kick out of arguments... in the 1NR" (Bellon). The NAUDL guide treats the 1NR as a rebuttal: "You should not make new arguments here" [Instr].
- A common split: the 2NC takes the CP and its net benefit, or the K; the 1NR takes the other DAs, T, and case. **[Heuristic]** This is common practice but varies by team; make it user-assignable.

### 1AR (1A): the hardest speech
- It answers the whole block in 5 minutes. "The 1AR must respond to the entirety of the negative block" (Wikipedia). "It cannot win a debate round, but it can lose one! The main purpose... is to make sure that the 2AR has all the arguments she needs" (Bellon) [Instr].
- **Scope:** answer every argument "that could potentially win the debate for the negative" (Snider). "Do not worry about answering 1NC arguments that were not extended in the 2NC/1NR" (AUDL). Some positions have "a priori standing" and "must be answered or the debate will be instantly lost": "topicality, arguments that 'turn' the case, and some critiques and decision rule claims" (Cheshier) [Instr].
- **Selection:** "Pick a set of 2AC arguments to extend. For example, use answers 2, 4, and 6 on the disadvantage" (Snider). Circle "the two or three best or truest answers" on each position (Cheshier). "Extend that one (two if you have time) best 2AC argument for each offcase position" (AUDL) [Instr].
- **Mechanics:** "Reclaim the 2AC structure... 'extend 2AC number one'"; decide time allocation before standing up; prioritize (Bellon). Order: "Always put topicality first, then go to disadvantages and counterplans. Go to case last" (Snider). An older student view in *Rostrum* suggests roughly 2.5 minutes each on plan-side and case-side arguments ([Seeland](https://www.uvm.edu/~debate/NFL/rostrumlib/SeelandJan'00.pdf)) [Instr].
- **Evidence:** "It is usually, though not always, a good idea to avoid reading new evidence in the 1AR" (Cheshier). "Try not to read new evidence" (AUDL) [Instr].
- **Keep offense viable:** "You will in all likelihood want to keep a permutation alive in the 1AR." When extending turns, "extend the relevant uniqueness responses, so the turn is unique" (Cheshier) [Instr].
- **Why the 1AR matters most:** "Arguments dropped by the 1AR are especially hard to recover from later in the round, since judges expect to screen out new or resurrected claims in the last affirmative speech" (Cheshier) [Instr]. The 1AR is also a "shadow speech for the 2AR" (Wikipedia) [Tert].

### 2NR (2N)
- **Collapse:** "The least successful 2NRs are the ones who try to go for too many arguments... put all of your eggs in one basket — or, at most, three baskets." "It is very difficult to go for a procedural argument like topicality and several substantive arguments" (Bellon) [Instr]. "It's virtually never strategic to 'split the 2NR'" ([DebateDrills](https://www.debatedrills.com/policy/final-speeches)) [Pract]. Going for multiple positions "is risky because the 2AR... will most likely go for the arguments which the 2NR covered the least" (Wikipedia) [Tert].
- **Two routes** (Snider): "Win the Drop" (explain why a dropped argument is sufficient and weigh it) or "Win the Position" (pull issues into "a single negative strategy"). Typical packages include a high-impact DA, T, a prima facie case attack with case turns, a CP, or a CP plus a DA [Instr].
- **Structure:** begin with an overview that "break[s] the whole debate down to what really matters," put the strongest argument first, "be specific about authors and warrants," exploit 1AR drops but "explain... why that argument matters," and "anticipate the 2AR" (Bellon) [Instr].
- **Constraints:** the 2NR cannot go "for 1NC arguments which were not extended in the negative block" (Wikipedia) [Tert]. Snider's preemption phrases for the 2AR include "No new arguments in the 2AR," "No new cross-applications in the 2AR," and "If you can't trace it back to the 1AR, ignore it." The 2NR "has to 'close doors' for the 2AR" with "even if" statements (Wikipedia) [Tert].
- **Topicality in the 2NR:** "Most judges would prefer that if you plan to win the debate on topicality, you spend the entire 2NR on that issue" (Snider). Cheshier (2002) disagrees: give the violation "only the time it requires." He also estimated T appears in about 95% of 1NCs but only about 5% of 2NRs on the national circuit at that time ([Cheshier](https://www.uvm.edu/~debate/NFL/rostrumlib/cxCheshier0202.pdf)) [Instr]. Make this configurable.
- Take all remaining prep (Snider) [Instr].

### 2AR (2A)
- "Set your own agenda": deal with the 2NR's issues comprehensively but lead with your best reason to vote affirmative. "Allocate time the same as the 2NR." Make "even if" statements and retell the story (Snider). "Revive the 1AR... trace major affirmative claims back to the 1AR"; "Don't forget your impacts" (Bellon) [Instr].
- The 2AR "may not make new arguments that were not in the 1AR," but "some arguments are never new, like certain forms of extrapolation from 1AR arguments and impact calculus." It usually answers only the 2NR and goes "to other flows only when the affirmative believes the negative has made a strategic blunder" (Wikipedia) [Tert].
- It rarely reads cards. In NDT final rounds from 1949–1990, 2ARs read 0–8 quotations and usually 0–1 ([Southworth chart](https://groups.wfu.edu/NDT/HistoricalLists/90schart.html)) [Pract].
- "Slow down!... if an argument lacks clarity during the final speech, judges won't resolve it favorably" ([DebateDrills](https://www.debatedrills.com/policy/final-speeches)) [Pract].

### What "extending" requires
- Bellon's definition: extending means "bringing an argument up again in speeches after which they were initially presented... Arguments that are not extended are considered 'dropped' and are not supposed to be considered by the judge" [Instr].
- Extensions must engage: "There are two parts to extending an argument: denying the truth or relevance of the opposition argument and explaining why yours is better" (Snider). "Extending block arguments by tag-line alone won't make you look like a very credible 2NR. Be specific about authors and warrants" (Bellon). Over-grouping makes a 1AR "committed only to taglines, as opposed to real argument extension" (Cheshier) [Instr].
- Judges say the same thing. Examples from 2026 UIL paradigms: "Extend arguments with warrants and impacts"; "Dropped arguments are true if they are warranted and impacted"; "Simply saying an argument was 'dropped' is not enough—you must explain why that argument means you should win" ([UIL 2026 CX judges](https://www.uiltexas.org/speech/cx-judges)) [Pract].
- **Product definition:** an extension equals a reference (speech, number, or author), plus the claim, plus the warrant (why it is true), plus the implication (what it means for the position or ballot), plus the interaction with the opponent's answer when one exists. **[Heuristic, grounded in the above]**

---

## 3. New arguments in rebuttals

| # | Convention | Sources |
|---|---|---|
| N1 | No new arguments in rebuttals; rebuttals extend and compare. | [Cheat sheet](https://s3.amazonaws.com/tabroom-files/tourns/27443/postings/49417/cheat_sheetpolicy2324.pdf), [NAUDL](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf), [Snider](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf) [Instr] |
| N2 | New **evidence** is allowed when it extends an existing argument: "No new arguments allowed, but new evidence may be introduced"; "You can read new evidence but you can't offer new disadvantages or topicality responses in rebuttals." A 2026 UIL judge: "ok with new evidence in the rebuttal as long as it connected to an old argument." | [Cheat sheet](https://s3.amazonaws.com/tabroom-files/tourns/27443/postings/49417/cheat_sheetpolicy2324.pdf); Snider ch. 17; [UIL](https://www.uiltexas.org/speech/cx-judges) |
| N3 | **Traceability test:** "an argument is considered new if it cannot be traced directly back to an argument made by the 2AC, the 2NC, or the 1NR." A more specific card for a general 2AC argument is a gray zone ("There is no clear answer"). | [Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline) [Instr] |
| N4 | **New answers to new arguments** are legitimate: "if the other team makes a new argument, you have every right to make new answers to it." "Almost all judges will allow the 1AR to read new pieces of evidence and make new arguments, especially in response to new arguments during the negative block." | Bellon [Instr]; [Wikipedia](https://en.wikipedia.org/wiki/Structure_of_policy_debate) [Tert] |
| N5 | The 2NR cannot go for 1NC positions not extended in the block. | Wikipedia [Tert]; AUDL (1AR need not answer them) [Instr] |
| N6 | The 2AR is bounded by the 1AR, except for extrapolation, impact calculus, and answers to new 2NR arguments. | Wikipedia [Tert]; Bellon ("Revive the 1AR"); Snider's 2NR phrases |
| N7 | **Gray zones:** new cross-applications in the 2AR (Snider's 2NR phrase implies judges may reject them); "sandbagging" ("to delay in presenting the impact of an argument until a later speech," Bellon glossary); new warrants for an old tag. | Snider; Bellon [Instr] |
| N8 | **"New in the 2NC":** formally allowed because the 2NC is a constructive ("there won't be any risk the arguments run there will be 'new'," Cheshier), but "some judges consider it abusive to add new off-case arguments" (Wikipedia). 2026 UIL judges rated "2NC" acceptability at a mean of 3.00/5, with 46 of 295 at 1 ("unacceptable"). One wrote: "okay with new on-case in the 2NC but I think new off-case in the 2NC can be abusive." | [Cheshier](https://www.uvm.edu/~debate/NFL/rostrumlib/cxCheshier0202.pdf); [UIL](https://www.uiltexas.org/speech/cx-judges) (my parse) |
| N9 | **Enforcement is by argument:** "If you hear a new argument in an opponent's rebuttal, point it out to the judge, explain why you think it is new... it might still be smart to answer the new argument anyway." | Bellon [Instr] |
| N10 | The 1AR is "a shadow speech for the 2AR," and the line between shadow coverage and legitimate 2AR extrapolation "is still contested." A worked example: a one-line 1AR "seed" ("the economy is collapsing now") licenses a fuller 2AR explanation. | [Wikipedia](https://en.wikipedia.org/wiki/Structure_of_policy_debate); [The 3NR 2009](https://the3nr.com/2009/12/03/answering-impact-calc-in-the-1ar-2-the-basics-the-da-does-not-turn-the-case/) [Pract] |

**UIL "2NC" scale caveat:** the UIL page labels the item only "2NC (2nd Negative Construct) — 1 = Unacceptable, 5 = Acceptable." Several paradigms mention "new in the 2," so I read it as acceptance of new arguments in the 2NC. **[Unverified interpretation]** The 2018 UIL booklet did not include this item ([UIL 2018 booklet](https://www.uiltexas.org/files/academics/Edwards_UT_JudgeAdaptation_Paradigms2.pdf)).

---

## 4. Organization and flow mechanics

- **Roadmaps** are an ordered list of positions given before the clock starts. Kansas rules: "A road map is NOT an introduction or an overview of the content of the arguments, it is simply the order of the debate" [Rule]. The usual order is off-case first, then case (Snider). Examples: 1NC "I will handle the three off-case and then the case debate"; 2AC "the China relations disadvantage, the realism critique, and then... case"; 2NC names only the positions it extends (Snider). "In most regions... judges will let you explain your roadmap before they start running your speech time" ([DebateUS](https://debateus.org/policy-debate-terminology/)) [Pract]. A UIL judge: "Do not offer a 'brief off-time roadmap' and proceed to explain flows; a roadmap should be along the lines of 'case in the order of the 1AC, the disad, and topicality'" [Pract].
- **Signposting:** name the flow, then the argument number. "If at all possible, avoid 'next' and use numbers." Use "Next off-case" for transitions and "Now, on the case debate" for the shift to case. Refutation follows four steps: "They say," "We disagree," "Because," "Therefore" (Snider ch. 11) [Instr].
- **Line-by-line** means "Going point-by-point through the flow of the other sides arguments and answering each one." An **overview** is "a general explanation of a major argument that occurs before you begin answering the line-by-line"; 2NR and 2AR overviews "include a general assessment of the debate." An **underview** is an overview at the end, but "arguments that are made in underviews are usually best advanced in overviews" ([DebateUS](https://debateus.org/policy-debate-terminology/)) [Pract]. An impact-overview template: summarize the scenario, add turns (DA turns case, case turns DA, link or impact turns), then compare impacts using magnitude, risk, and timeframe ([AUDL](https://www.atlantadebate.org/advanced-impact-comparison)) [Instr].
- **Embedded clash** means a judge resolves interactions the debaters did not explicitly make. "Truth judges also tend to evaluate more embedded clash between arguments even if those cross applications are not made by the debaters themselves" ([DebateDrills 2021](https://www.debatedrills.com/blog/tech-and-truth-how-judges-are-ruining-debate)) [Pract]. Flow-centric judges say the opposite: "I will not make connections for you" ([UIL](https://www.uiltexas.org/speech/cx-judges)) [Pract]. **Product rule:** generation must make interactions explicit and must not rely on embedded clash.
- **Grouping** answers several arguments at once ("Group the violation," then make global arguments; "group the uniqueness debate — we're post-dating their cards"). Its dangers: over-grouping into taglines, and grouping "arguments that are not similar to each other is one of the easiest ways to miss unique arguments" (Cheshier 2000; Bellon) [Instr]. Topicality "is one argument requiring line by line refutation" (Cheshier 2002) [Instr]. Verbatim Flow has an explicit "Toggle Group" cell format ([Verbatim Flow](https://docs.paperlessdebate.com/verbatim/debating-paperless/flow)) [Pract].
- **Cross-application** applies an argument from one flow to another. It is legitimate when made explicitly in the speech. Snider's chapter 21 charts how T, significance, inherency, solvency, and DAs interact, for example "Conceding solvency may take out a disadvantage" [Instr]. The 2AR cannot introduce new ones (N7).
- **"They conceded X" / dropped arguments:** a drop is "an argument which was not answered by the opposing team," usually judged by whether it was answered "in the speech in which the opposing team has the first opportunity to answer it" ([Wikipedia glossary](https://en.wikipedia.org/wiki/Glossary_of_policy_debate_terms), citing Bellon) [Tert]. Caveats:
  1. "Some judges will not evaluate some arguments, even when they are dropped, such as arguments labeled 'voting issues' but which are unsupported by warrants" (Wikipedia) [Tert]. "An argument without a warrant is... not an argument at all, but just a claim" ([DebateDrills](https://www.debatedrills.com/blog/tech-and-truth-how-judges-are-ruining-debate)) [Pract].
  2. "Just because a team may have dropped a point... is not an automatic reason to vote against that team. What matters is the type of argument" (Snider ch. 17) [Instr].
  3. The implication must be explained (Bellon; UIL paradigms).
  4. **Functional concession:** "answering an argument without actually refuting it," such as reading link defense against an impact (Bellon glossary) [Instr].
- **Flowing:** use one sheet per position, case on its own sheets, and columns per speech. The NAUDL guide uses 8 columns. Snider uses 7 because "the 2NC-1NR speeches occur one right after the other and so share a column" [Instr]. Flows can be on paper or in Excel. Verbatim Flow supports "paper style" (blank rows for spacing) and "row style" (one argument per row), with Extend (copy two columns right), Group, and Evidence cell flags. Its own docs say that for debaters, paper flowing may be better ([Verbatim Flow](https://docs.paperlessdebate.com/verbatim/debating-paperless/flow)) [Pract]. **Backflowing:** after the 1NC and 2AC, the partner fills in the speaker's missing flow during CX or prep ([Wikipedia: Flow](https://en.wikipedia.org/wiki/Flow_(policy_debate))) [Tert].

---

## 5. Argument types: components and answers

### 5.1 Disadvantages (DAs)
- **Components:** uniqueness (the impact won't happen without the plan), link (the plan causes the change), internal link(s), and impact. Some DAs also have a brink or threshold ([Snider ch. 4](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf); [NAUDL glossary](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf)) [Instr].
- **Scenario types** (Snider): a **threshold** DA needs brink and uniqueness ("If you are already running toward the edge of the cliff, then an extra push won't make any difference"). A **linear** DA needs no brink, "just a strong link" [Instr].
- **Affirmative answers** (Snider): no link or link takeout; no impact; no internal link; **link turn** ("Not to be used with impact turn"); **impact turn** ("Not to be used with link turn"); not intrinsic; no brink; non-unique; case outweighs. The DA may also apply to the CP. Rule of thumb: "You only need to break the chain at one critical point to defeat the disadvantage" [Instr].
- **Link turns need non-uniqueness:** "A link turn requires that the affirmative win that there is no uniqueness" ([Wikipedia glossary](https://en.wikipedia.org/wiki/Glossary_of_policy_debate_terms)) [Tert]. Cheshier: extend "the relevant uniqueness responses, so the turn is unique" [Instr].
- **Double turn** (link turn plus impact turn on the same chain): "the affirmative merely creates a new reason why it should lose the debate. Judges love to vote negative on double-turns" (Snider). Also "you will essentially [be] presenting a disadvantage against yourself" ([DebateUS](https://debateus.org/policy-debate-terminology/)) and the other team "can simply grant both turns" ([Bellon glossary](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline)).
  - Affirmative escape routes (Snider): the two turns are "of the same type"; or another answer ("won't happen," empirically false) takes out both turns.
- **Straight turn:** the DA was answered only with turns, with no defense. "A common negative mistake is to grant a non-uniqueness argument to kick a link turned disadvantage... a disadvantage with only non-unique and link turn responses is actually straight turned" ([Wikipedia glossary](https://en.wikipedia.org/wiki/Glossary_of_policy_debate_terms)) [Tert]. "You can kick a kritik or disadvantage argument... as long as it is not straight-turned" ([DebateUS](https://debateus.org/policy-debate-terminology/)) [Pract].
- **Negative must-dos** (Snider): "Deal with every one of the affirmative's answers," explain unique causation, "Take special care to answer and defeat all turns," and weigh impacts [Instr].
- The kicking logic is in §7.

### 5.2 Counterplans (CPs)
- **Parts:** the CP text (like a plan), solvency, and a **net benefit**, usually a DA the plan links to and the CP avoids. A CP must be **competitive**, meaning a reason to reject the plan. Tests are **mutual exclusivity** (cannot coexist) and **net benefits** ("doing the counterplan alone provides more benefits than doing the plan alone and... [than] the counterplan and plan together") ([Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline); [Snider ch. 5](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf)) [Instr]. Snider's older text requires CPs to be "non-topical"; many judges accept topical but competitive CPs [Instr].
- **Textual vs functional competition:** "Textual competition theory states that the counterplan may not textually be plan plus; put another way: a legitimate permutation may combine the texts of the plan and the counterplan." Functional competition looks at what the policies do ([Wikipedia: Counterplan](https://en.wikipedia.org/wiki/Counterplan)) [Tert]. One NAUDL theory block argues "Prefer counterplans that are both textually and functionally competitive" ([NAUDL theory](https://assets.urbandebate.org/wp-content/uploads/20190916152520/Theory-Pentathlon-Document.pdf)) [Instr].
- **Permutations** test competition and are "not advocacy":
  - **Do both**, the most common test (Wikipedia; Bellon; Snider).
  - **Time-frame or sequencing** ("do one first, then the other"), which some negatives call illegitimate delay (Bellon).
  - **Do the CP**, typically against CPs that only compete off normal means or process, such as agent and consult CPs ([NAUDL](https://assets.urbandebate.org/wp-content/uploads/20190916152520/Theory-Pentathlon-Document.pdf)).
  - **Severance** ("part of the plan and all or part of the counterplan"; "Most judges seem to find this logic persuasive" that severance is illegitimate) (Bellon; Wikipedia).
  - **Intrinsic** (adds "something in neither the plan nor the counterplan") (Wikipedia; Bellon).
  - "It is not simply enough to point out that a permutation is possible – you need to prove that the permutation is a net-desirable course of action" ([DebateUS](https://debateus.org/policy-debate-terminology/)) [Pract].
- **Affirmative answers:** perms; **solvency deficits** (the CP doesn't solve the 1AC as well); DAs to the CP; theory; showing the CP links to its own net benefit (Bellon; Snider) [Instr].
- **Common types** ([AUDL](https://www.atlantadebate.org/types-of-counterplans); [Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline); [Wikipedia](https://en.wikipedia.org/wiki/Counterplan)):
  - **Advantage CP:** solves the case through a different means.
  - **Agent CP:** a different actor, such as courts instead of Congress, or the states.
  - **Process and consult CPs:** consult another entity; "sometimes considered illegitimate."
  - **PIC** (plan-inclusive CP): the plan minus a part. Word PICs and "floating PICs/PIKs" are variants.
  - **Alternate mechanism CP.**
  - **50-state fiat / states CP.**
- **Status** (Bellon):
  - **Unconditional:** committed to the CP for the whole round.
  - **Conditional:** "the right to choose between the counterplan or the status quo any time."
  - **Dispositional:** "kick the counterplan at any time unless the affirmative 'straight turns' it."
  - Asking the status in CX is standard. Wikipedia: "Conditionality is now commonly accepted as legitimate in the policy debate community" [Tert].
- **Norms history:** in the 1990s to early 2000s, "one conditional counterplan was typically considered the maximum." The 2006 NDT final had two conditional CPs; the 2009 final had four plus a conditional K. By the 2010s, "successful theoretical objections to conditionality became relatively rare" ([Batterman 2021](https://the3nr.com/2021/08/06/digging-into-the-debate-theory-archives-papka-on-excessive-conditionality-and-the-middle-ground-of-dispositionality/)) [Pract]. Local and lay circuits differ: UIL 2026 judges rated "Conditional Arguments" at a mean of 3.31/5 ([UIL](https://www.uiltexas.org/speech/cx-judges)).
- **Judge kick:** "the ability of a judge to jettison a negative counterplan after the debate and instead vote negative in favor of the status quo if they conclude the counterplan is uncompetitive or less desirable than the status quo." It is justified as "a judge... should not have to vote for a policy worse than the status quo" and as an extension of conditionality. It is controversial ("produces a dearth of depth"). Its intellectual lineage predates conditionality (Nebergall, 1957) ([Soper, Debate Ravings 2022](https://debateravings.org/a-historical-defense-of-judge-kick/), read via the [Internet Archive](http://web.archive.org/web/2024/https://debateravings.org/a-historical-defense-of-judge-kick/)) [Pract]. Paradigms vary; for example, "I lean towards no on judge kick" ([UIL](https://www.uiltexas.org/speech/cx-judges)).

### 5.3 Topicality (T)
- **Parts:** interpretation (a definition of a resolution word), violation (how the *plan* fails it), standards (reasons to prefer), and voter (why it decides the round) ([Snider ch. 7](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf); [Wikipedia: Topicality](https://en.wikipedia.org/wiki/Topicality_(policy_debate))). "It is the plan we are testing for topicality purposes, not the rhetoric of the case" ([Cheshier 2002](https://www.uvm.edu/~debate/NFL/rostrumlib/cxCheshier0202.pdf)) [Instr].
- **Standards** in use: limits (predictable limits), ground, precision or bright line, predictability, grammar, education, and field context (Wikipedia; Bellon glossary) [Tert/Instr]. Cheshier advises extending "only those standards necessary," using "topicality tests" and examples of cases each interpretation allows or excludes, and building "even if" fallbacks [Instr].
- **Voters:** fairness or competitive equity, education, jurisdiction. Wikipedia says jurisdiction has "largely fallen out of favor" in college [Tert].
- **Competing interpretations vs reasonability:** under competing interpretations, "the affirmative's burden is to meet the best interpretation in the round." Reasonability requires meeting "some interpretation... that is sufficiently good" (Wikipedia) [Tert]. Bellon's glossary defines reasonability as a definition "not excessively broad" that "would appear legitimate at first glance" [Instr].
- **Affirmative answers:** we meet; counter-interpretation plus counter-standards; reasonability; no-voter arguments; RVIs, which judges rarely accept ("I am in almost all instances not your guy for reverse voting issues," [UIL](https://www.uiltexas.org/speech/cx-judges)). Also literature checks and "other words check" (Snider; Wikipedia) [Instr/Tert].
- **Variants:** effects T, extra-topicality, and spec arguments such as A-Spec (Wikipedia; Bellon) [Tert/Instr].
- **Asymmetry:** "Only the affirmative can lose the debate on topicality" (Cheshier 2002). T needs line-by-line (see §4) [Instr].

### 5.4 Theory (procedural objections)
- It has the same shape as T: interpretation, violation, standards, and a voter or the remedy "reject the argument, not the team" ([NAUDL theory](https://assets.urbandebate.org/wp-content/uploads/20190916152520/Theory-Pentathlon-Document.pdf)) [Instr].
- Common objections, with sample bad/good blocks in the NAUDL doc:
  - Conditionality bad: moving target, time skew, reciprocity. Counter-interpretations include "one conditional CP" or dispositionality.
  - 50-state fiat bad.
  - PICs bad: "Steals aff ground," "Infinitely Regressive."
  - Agent CPs bad.
  - Consult bad.
- "Policy is an activity where permutation theory, performative contradictions, and even conditionality are not necessarily widely considered to be voting issues... Just because someone is unwilling to vote someone down for an intrinsic perm does not mean they will grant that debater the permutation" ([DebateDrills 2021](https://www.debatedrills.com/blog/theory-debates-3-ways-to-adapt-to-your-policy-judge)) [Pract].
- 1AR guidance: theory objections "will eat up your time like no other argument, and are often hard to win judges on" ([Cheshier 2000](https://www.uvm.edu/~debate/NFL/rostrumlib/CheshierJan'00.pdf)) [Instr]. Answer theory "in a sophisticated way, not as a 'mindless timewaster'" (Papka 1986 via [Batterman 2021](https://the3nr.com/2021/08/06/digging-into-the-debate-theory-archives-papka-on-excessive-conditionality-and-the-middle-ground-of-dispositionality/)) [Pract].

### 5.5 Kritiks (Ks)
- **Structure:**
  - **Link:** "what flawed assumptions the affirmative case has made."
  - **Impact:** consequences of the mindset, often a root cause of structural harms.
  - **Alternative:** "A mindset shift... This is NOT a policy action" in the AUDL framing, though alternatives vary.
  - **Framework / role of the ballot.** Interpretations include "vote on the best policy option," "whoever best solves a specific impact," "affirm/reject something," and "whether or not the affirmative plan is worth doing" ([AUDL Kritiks](https://www.atlantadebate.org/coach-curric-kritiks)) [Instr].
  - Snider's version: the aff assumes X; X is untrue; implications are no harm, no solvency, or DA-like consequences. "Critiques frequently have a priori implications" and "frequently avoid uniqueness problems" [Instr].
- **Alternative types** (Bellon): alternative approaches to the 1AC; "plan-inclusive" alternatives, where a general alternative is a **"floating PIC"** ("a moving target"); different ways to see the world; different kinds of action; different ways to debate [Instr].
- **Affirmative answers** ([AUDL Answering the K](https://www.atlantadebate.org/answering-the-kritik); Snider; Bellon):
  - framework (weigh the plan against the status quo or a competitive policy);
  - permutation (do both);
  - no link or link turn;
  - no impact or impact turn;
  - the alternative fails, or the alternative is bad;
  - the assumption is found everywhere (non-unique);
  - case outweighs, or practical benefits outweigh philosophical implications.
  - CX questions: "What are the links?", "Why is that bad?", "What affirmative doesn't link?", "Why does the critique outweigh the 1AC?"
- **2NR on the K:** extend a single, specific link and spend time on comparison. Check that you "extend[ed] the alternative and/or the role of the ballot" ([NSD Update, LD-focused](https://www.nsdebatecamp.com/nsdupdate/critical-problems-going-for-the-kritik)) [Pract].
- **"Link of omission"** (a link based on what the aff did not say or do) is common community usage. I found no primary instructional definition in a source I could read. Judges reportedly find it weak. **[Unverified; treat it as a K-link subtype with low default weight]**
- Local-circuit acceptance of Ks is lower: UIL 2026 judges averaged **2.96/5**, and 59 of 296 rated Ks "1 = unacceptable" ([UIL](https://www.uiltexas.org/speech/cx-judges); my parse).

### 5.6 Case debate
- **Stock issues:** harms or significance, inherency, plan, solvency, and topicality ([NAUDL](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf); Snider). Inherency types are structural, attitudinal, and existential (Bellon glossary) [Instr].
- **Negative case strategy** (Snider ch. 3):
  - Do not attack inherency directly; use it for circumvention, backlash, or a DA.
  - Attack impact scenarios for specificity, number, probability ("Too often debaters evaluate scenarios as being 100% or 0%"), time frame, and reversibility.
  - Attack solvency by making them "quantify [their] solvency," pointing to alternate causes, sabotage or circumvention, and weak generalizations.
  - Use challenges and evidence indictments.
  - "If you concede a position, don't argue against it."
  - Case turns and "turns the case" arguments make case attacks offensive. Without offense, the aff can say "nothing bad will happen and we might as well try" [Instr].
- **Affirmative:** extend 1AC evidence by author; indict new block case arguments ("the negative made new case arguments that the 2AC didn't have a chance to answer") ([AUDL 1AR](https://www.atlantadebate.org/giving-the-1ar)) [Instr]. Add-ons may be read in the 2AC (Bellon glossary).
- A judge's view of DA-only 2NRs: "Going for a DA and dropping the case is problematic b/c a conceded case versus a defensed DA typically will end up being an aff ballot" ([UIL](https://www.uiltexas.org/speech/cx-judges)) [Pract].

### 5.7 Framework debates, planless affirmatives, and "the aff must defend the plan"
- "Framework" means "the assumptions about debate a judge uses to determine who should win," usually whether to prioritize policy or critical arguments (Bellon glossary). Framework debates "have become common since the advent of the critique" ([DebateUS](https://debateus.org/policy-debate-terminology/)) [Instr/Pract].
- **Plan focus:** T tests the plan text (Cheshier). Severance perms are resisted because "the affirmative should, at least, have to advocate all of its original plan" (Bellon). PIC defenders say "They Have to Defend the Whole Plan" ([NAUDL](https://assets.urbandebate.org/wp-content/uploads/20190916152520/Theory-Pentathlon-Document.pdf)). One judge paradigm: "Aff must defend the resolution through a topical plan" ([UIL](https://www.uiltexas.org/speech/cx-judges)) [Instr/Pract].
- **Planless or K affirmatives versus framework / T-USFG** exist mainly on national circuits. Two types are commonly distinguished: those that "affirm the resolution but do not read a plan" and those that "don't affirm the resolution." Aff answers to framework include "predictability is political" and "ground is inevitable and fluid" ([The 3NR 2010 thread](https://the3nr.com/2010/03/29/throwdown-framework-vs-no-plan-aff/)) [Pract]. *Framework-debate depth beyond this is out of scope for the evidence I could access.*

---

## 6. Impact calculus, risk, and presumption

- **Core dimensions:**
  - **Magnitude, probability (risk), timeframe:** "MR. T" ([AUDL](https://www.atlantadebate.org/advanced-impact-comparison)); magnitude, probability, timeframe, and turns or solves the impact ([NAUDL](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf)) [Instr].
  - **Reversibility:** "we think of reversible events as less important than irreversible" (Snider ch. 3) [Instr].
  - Other lenses: severity, inclusivity, root cause, internal-link short-circuiting ([Wikipedia: Impact calculus](https://en.wikipedia.org/wiki/Impact_calculus)) [Tert].
  - Quality of evidence is also weighed (Snider ch. 17) [Instr].
  - "Impact calculus only compares the ultimate negative consequences, not the factors that one team says lead to the impact... Tell the judge why one part of MR. T is more important than the others" (AUDL) [Instr].
- **Impact kinds** (AUDL): **event** impacts ("high magnitude... quickly, but... lower probability"); **structural** impacts ("stronger case for probability... slow timeframe"); **systemic** impacts ("almost always already occurring... strongest risk and timeframe") [Instr]. Extinction-level event impacts versus systemic impacts is a comparison the 2NR and 2AR must make explicitly.
- **Turns the case / outweighs and turns:** the "DA turns the case" argument means "the events triggered by the plan cause the very impact that the 1AC claimed to solve" (AUDL). "The most important impact argument you have to answer is 'turns the case'... a lot of judges latch onto" it. Standard 1AR answers are that the aff "controls uniqueness" and that the case solves faster than the DA turns it (a "speed differential") ([The 3NR 2009](https://the3nr.com/2009/12/03/answering-impact-calc-in-the-1ar-2-the-basics-the-da-does-not-turn-the-case/)) [Instr/Pract].
- **Try-or-die:** "a situation where one must accept a policy... even though it is not preferable because the alternative is death" (Bellon glossary). "Aff controls uniqueness" is "the logical basis for most 'Try or die' style arguments" (The 3NR) [Instr/Pract].
- **Risk and zero risk:** "RISK = PROBABILITY X IMPACT." Risk analysis "artificially assigns probability to arguments and overvalues arguments with large impacts." The fixes proposed: "(1) some risks are so trivial that they are not meaningful; (2) the increment of risk must be considered; (3) debaters must not become enslaved to large impacts; and (4) debaters must rehabilitate the importance of uniqueness" ([Herbeck & Katsulas 1992, ERIC](https://files.eric.ed.gov/fulltext/ED354559.pdf)) [Instr]. "Any risk of a link" framing versus "zero risk" is therefore a live argument, not a rule.
- **Presumption:** "the assumption that a system should not be changed unless there is a clear reason... the judge assumes it is safest to vote negative (for the status quo)... in case of a tie, judges should vote negative" (Bellon glossary; Snider glossary) [Instr]. When the negative wins case defense but no offense, it may claim presumption. Without offense, though, "the affirmative can always argue that the judge has nothing to lose" (Snider ch. 8). Whether presumption shifts when the negative advocates a CP is **contested [Unverified in sources read]**. Make it a judge-profile field.
- **Offense vs defense:** "a negative disadvantage is an offensive argument... the affirmative might say that the impact is not probable. This is considered a defensive argument." Affirmatives "must make sure that their answers to negative positions are not only defensive" (Bellon) [Instr].

---

## 7. Contradictions, kicking, and the deterministic rule tables

### 7.1 Kicking a DA the affirmative has turned (Snider ch. 22)
"If you kick out of disadvantages with turns on them, you will lose... The negative team must never drop the turns." To kick, "concede specific other affirmative responses that would make the turn irrelevant," and say so explicitly (Snider ch. 4 and ch. 22) [Instr]. **Table K1: does conceding the aff's answer neutralize the aff's turn?**

| Aff answer the neg concedes | Neutralizes a **link turn**? | Neutralizes an **impact turn**? |
|---|---|---|
| No link ("plan doesn't cause X") | **No.** "There may be other causes, especially if it is linear" | **Yes.** "If X is good, but there is ZERO X caused, no impact" |
| Won't happen / no internal link | **Yes.** "If it isn't going to happen, they don't get credit for solving it" | **Yes** |
| Non-unique ("happens anyway") | **No.** "In fact, it makes the turn better... [most common error]" | **Yes.** "It happens if you vote affirmative or negative" |
| No impact / not significant | **Yes**, with a caution: "there may be SOME impact" | **No.** "If it is not bad, it can still be good" |

Source: [Snider, *The Code of the Debater*, ch. 22](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf) [Instr]. This agrees with the [Wikipedia glossary](https://en.wikipedia.org/wiki/Glossary_of_policy_debate_terms) straight-turn entry [Tert] and [Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline) ("drop... a disadvantage at any time unless the affirmative has claimed to turn either the link or the impact").

Other DA fates Snider lists: kick with no turns (concede a specific defensive answer, point out that the aff's answers were defensive "no" answers so the aff cannot later reframe them as turns, and say new turns are not allowed in rebuttals); extend when there is "nothing but turns" (find repeats, shared assumptions, and the size of the turn relative to the link); lose by dropping one answer; handle a double turn; win by being complete [Instr].

### 7.2 Contradiction patterns (Table C1)

| Pattern | Severity for the side making it | Source |
|---|---|---|
| Link turn plus impact turn on the same causal chain (**double turn**) | Severe: a self-inflicted DA the opponent can "grant both" | Snider; Bellon; DebateUS; Wikipedia |
| Impact turn plus no link, won't happen, or non-unique | Kick vulnerability: the neg concedes the defense and the impact turn disappears (Table K1) | Snider ch. 22 |
| Link turn plus won't happen or no impact | Kick vulnerability for the link turn (Table K1) | Snider ch. 22 |
| Link turn plus non-unique | **Not a contradiction.** It is the standard "straight turn" package | Snider; Wikipedia; Cheshier |
| Link turn with uniqueness conceded or no non-UQ argument | The turn may be no offense ("prevention of a non-existent event carries no advantage") | Wikipedia glossary; Cheshier |
| Neg kicks a turned DA by conceding non-UQ | Error: the link turn survives | Snider; Wikipedia |
| DA vs DA: contradictory link claims, world assumptions, or harms ("3 tests") | Credibility loss; the aff can "grant one disadvantage to prevent another" | Snider chs. 8 and 21 |
| Inherency vs DA ("If the negative says that the status quo is working, then why haven't the disadvantages happened?"); solvency vs DA (plan won't work, yet it causes the DA) | Exploitable by the aff | Snider ch. 8 |
| Negative concedes part of the case to build a link, then attacks that part | Self-undercut ("don't argue against it") | Snider ch. 3 |
| CP links to its own net benefit | Loses competition | Bellon |
| Contradictory conditional positions (e.g., a K of the state plus a states CP) | Legal under condo for many judges. Contradictions remain exploitable ("take advantage of evidentiary and argumentative contradictions (even if the negative kicks...)"). "Performative contradiction" is rarely a voter | Papka via [Batterman 2021](https://the3nr.com/2021/08/06/digging-into-the-debate-theory-archives-papka-on-excessive-conditionality-and-the-middle-ground-of-dispositionality/); [DebateDrills](https://www.debatedrills.com/blog/theory-debates-3-ways-to-adapt-to-your-policy-judge) |
| Two negative speakers contradict ("world war" vs "already in effect") | "Each one is nullified" | [Seeland](https://www.uvm.edu/~debate/NFL/rostrumlib/SeelandJan'00.pdf) [Instr] |

### 7.3 Kicking CPs and Ks; "the status quo is always an option"
- A conditional CP can be kicked, returning the negative to the status quo. A dispositional CP can be kicked only if not straight-turned (Bellon). Whether a straight-turned CP can be kicked "is a debate" ([DebateUS](https://debateus.org/policy-debate-terminology/)).
- "Status quo is always an option" is the phrase that invokes **judge kick**, where the judge compares plan vs CP and then plan vs status quo ([Soper 2022](http://web.archive.org/web/2024/https://debateravings.org/a-historical-defense-of-judge-kick/)). Opponents argue it makes aff offense against the CP worthless. Treat it as a judge-profile setting (allow, disallow, or only if the 2NR asks).
- When a CP is kicked, the aff's offense against it (DAs to the CP, solvency deficits) usually becomes irrelevant. Aff offense on other flows (turns on the net benefit) remains.

---

## 8. Judge adaptation

- **Paradigm taxonomy:** stock issues, policymaker, tabula rasa, games player, hypothesis tester, communication-focused, kritikal. "Not every judge fits perfectly into one paradigm." There is also a tech-over-truth vs truth-over-tech axis ([Wikipedia: Policy debate](https://en.wikipedia.org/wiki/Policy_debate)) [Tert]. Snider groups judges by role: **Type A** (academic contest), **Type B** (educator; adapt by slowing down, using full sentences, dropping jargon, giving reasons for theory, fewer arguments, internal and external summaries), and **Type C** (entertainment or lay; do "everything you would do for Type B but more so" and "Don't use jargon at all") [Instr].
- **Tech vs truth:** a pure tech judge treats any conceded argument as true, "even if it is an obviously incorrect claim." A pure truth judge "may ignore it if they feel it is false." The author's proposed bright line: vote only on arguments whose claims are warranted ([DebateDrills 2021](https://www.debatedrills.com/blog/tech-and-truth-how-judges-are-ruining-debate)) [Pract].
- **Paradigms are self-reports:** "Judging philosophies are a form of autobiography... you should not believe everything you read in a philosophy. Always use at least one of the other tactics... to verify." Distinguish what a judge *prefers* from what they *demand*: "it is your job to ask whether they don't prefer critiques or whether they refuse to vote for them entirely" ([Bellon](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline)) [Instr]. Other sources: round reports, the grapevine, and asking the judge (Bellon; [NAUDL](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf)).
- **A structured paradigm dataset:** the UIL publishes 2026 state CX judge paradigms with fixed fields. These are paradigm type; communication skills vs resolution of issues; evidence quantity vs quality; 1–5 scales for quantity of arguments, T, CP, DA, conditional arguments, kritiks, and "2NC"; experience codes (A = HS policy debater ... E = college CEDA); and free-text philosophy and delivery ([UIL](https://www.uiltexas.org/speech/cx-judges)) [Pract]. My parse of the page, 296 unique judges after deduplicating across classification lists:
  - **Paradigm:** tabula rasa 118; stock issues 89; policymaker 77; blank 12.
  - **Communication vs issues:** Equal 208; "Res. Issues" 65; "Comm. Skills" 23. **Evidence:** Quality 173; Equal 122; Quantity 1.
  - **Means:** quantity of arguments 3.58; T 3.51; CP 3.95; DA 4.17; conditional arguments 3.31; **K 2.96**; **2NC 3.00**.
  - 25 statements explicitly reject spreading (regex count, approximate). Several refuse doc sharing: "This is a communication event so I do not want to be on any email chains, have evidence flashed to me, or be included in the SpeechDrop."
  - *Caveat: this describes Texas UIL state judges, a communication-focused league. It is not representative of the national circuit.*
- **Access limits:** Tabroom paradigm pages now redirect to login ("Please login to view paradigms!", observed 2026-09-25), and tournament pages for past events do too. The product cannot rely on scraping.

**Inference table (for the judge-profile feature)** **[Heuristic, grounded in Bellon and the UIL fields]**

| Paradigm signal | Safe inference | Do **not** assume |
|---|---|---|
| "No spreading," "communication event," "slow down" | Cap the rate at a conversational level, use fewer arguments, and translate jargon (Snider Type B/C) | That they will read cards after the round |
| "Don't want to be on the email chain" | Every argument must be clear orally; card text is not a backstop | That evidence sharing with the opponent is optional (rules still require it) |
| "Tech > truth," "dropped arguments are true (if warranted)" | Line-by-line completeness matters; conceded warranted arguments carry weight | That warrantless blips will be credited |
| "Tabula rasa" alone | Almost nothing. Ask for or collect specifics | That anything goes (they "draw the line" somewhere; [Wikipedia](https://en.wikipedia.org/wiki/Policy_debate)) |
| K rated 1–2 / "I do not like Ks" | Avoid K-first strategies. If you must, explain more | That they refuse Ks unless the text says so (prefers vs demands) |
| "Lean no on judge kick" | The 2NR must choose CP or status quo explicitly | Aff theory still needs to be argued |
| Experience codes (debated or coached policy) | Can likely flow jargon | Speed tolerance without an explicit statement |

---

## 9. Speech documents, evidence ethics, disclosure, and in-round rules

### 9.1 How documents move
- **Email chains** are the traditional method.
- **SpeechDrop** is a room-based upload site: "type a room name... Tell the room code to the opponents and judges" ([DC UDL sheet](https://urbandebatewashingtondc.org/wp-content/uploads/2023/02/SpeechDrop_InfoSheet.pdf); [GitHub](https://github.com/yunyu/SpeechDrop)) [Pract].
- **share.tabroom.com:** when enabled, "Tabroom will automatically send out a speech doc chain email to all the participants and judges in the round as soon as a round is published." Every round has a unique URL. It is "privacy-first. Nobody can see each other's actual email address." "All documents will only be posted on their rooms for 24 hours; this system cannot take the place of wiki posting & disclosure" ([Tabroom docs](https://docs.tabroom.com/settings/tabroom-share)) [Rule]. Glenbrooks 2026 requires it: "there should be no email chains. Students should not be sharing their email with adults that are not from their school" [Rule]. Barkley 2026 encourages it [Rule].
- **League rules:** Missouri: "The distribution of evidence... to debate judges is prohibited, unless requested by the judge," and prep ends when files are shared [Rule]. NSDA: devices may be used to "exchange evidence and/or arguments," and evidence must be provided "in a format readable by the opposing team and the judge" [Rule].

### 9.2 Document structure (Verbatim, the de facto standard)
- Heading levels: "Pockets are Heading 1, Hats are Heading 2, Blocks are Heading 3, and Tags are Heading 4." The **Cite** style applies "only to the last name and date." Text is underlined, emphasized (boxed), or highlighted; highlighting marks what the speaker intends to read ([Verbatim](https://docs.paperlessdebate.com/verbatim/debating-paperless/paperless); [formatting](https://docs.paperlessdebate.com/verbatim/cutting-evidence/formatting)) [Pract].
- "Invisibility Mode" hides everything except headings/tags, cites, and highlighted text. Judges can use it "to only evaluate the portions actually read in the round" ([Verbatim tools](https://docs.paperlessdebate.com/verbatim/advanced/tools)) [Pract].
- **Dataset field conventions** (openCaselist corpus): `tag` (the debater's summary), `summary` (underlined text), `spoken` (highlighted text, "the text the debater plans to read out loud"), `pocket/hat/block` headings, "A2"/"AT" (answer to) prefixes. "Analytics... do not contain any body text, and only have the debater written `tag`" ([OpenCaselist dataset card](https://huggingface.co/datasets/Yusuf5/OpenCaselist)) [Pract].

### 9.3 Documents contain unread material, and marking cards
- Speech docs are assembled before a speech and often contain extra cards. Coaches advise realism ("Adding extraneous cards and blocks... raising the risk that a mistake will be made") and "'clean up' speech documents after the speech by deleting cards that weren't read" ([Batterman 2014](https://the3nr.com/2014/08/20/how-to-never-clip-cards-a-guide-for-debaters/)) [Pract]. Even 1AC docs "included 'extra' cards that weren't actually read" in some cases ([Batterman 2021](https://the3nr.com/2021/05/04/how-fast-do-fast-debaters-speak-a-study/)).
- **Marking norm:** (1) say "marked at *lastwordspoken*"; (2) insert a mark in the doc (Verbatim inserts a timestamped "Stopped reading" marker); (3) offer the marked version "before cross-ex/prep time." "All three steps are required" ([Batterman 2014](https://the3nr.com/2014/08/20/how-to-never-clip-cards-a-guide-for-debaters/); [Verbatim](https://docs.paperlessdebate.com/verbatim/debating-paperless/paperless)) [Pract].
- **NSDA marking rule:** "Oral delivery of each piece of evidence must be identified by a clear oral pause or by saying phrases such as 'quote/unquote' or 'mark the card.'" The written text must be "marked to clearly indicate the portions read," and "underlining... highlighting... and/or minimizing what is unread, is definitive" (NSDA 7.1.G) [Rule].

### 9.4 Evidence ethics (penalties matter for generation)
- **NSDA** ([manual §7](https://docs.google.com/document/d/1hq7-DE6ls2ryVtOttxR4BNpRdP7xUbBr0M3SMYefek8/edit)) [Rule]:
  - **Oral citation:** at minimum the author's last name and year.
  - **Written citation:** author, date, source, title, access date, URL, qualifications, and pages as available.
  - **Paraphrasing** is held to the same standard as quoting.
  - **Internal ellipses are prohibited** unless in the original.
  - **Clipping:** "claims to have read the complete text of highlighted and/or underlined evidence when, in fact, the contestant skips or omits portions."
  - **Distortion:** added or deleted words that alter meaning, including unbracketed additions.
  - **Non-existent evidence** and **straw argument** are also defined violations.
  - **Penalties:** clipping, straw argument, or ellipses mean **loss plus zero speaker points**; distortion or non-existent evidence means **loss plus disqualification**. A failed formal challenge costs the challenger the round.
  - **AI:** "In debate events, generative AI should not be cited as a source; while generative AI may be used to guide students to articles, ideas, and sources, the original source of any quoted or paraphrased evidence must be available."
- **NDT:** misrepresentation includes "stopping before the end of quoted section without indicating the words read," "repeatedly skipping words," unclear delivery "with the intent to gain competitive advantage," and "distributing evidence artifacts... after speech time that do not accurately indicate the portion... communicated during speech time" ([NDT rules](https://nationaldebatetournament.org/about/standing-rules/)) [Rule].
- **Glenbrooks 2026:** clipping and "cross reading" (skipping middle text) are violations. The judge decides from the available evidence; if a challenge fails, "the accusing students lose"; no appeal [Rule]. Barkley allows students to record opponents' speeches [Rule].

### 9.5 Card docs, calling for cards, disclosure
- Judges often "call for cards" after the round when evidence was contested or emphasized. Some tournaments (NCFL Nationals) ban it, and some judges refuse to call for evidence on principle ([Wikipedia: Evidence](https://en.wikipedia.org/wiki/Evidence_(policy_debate))) [Tert]. A "card doc" (a compiled document of the cards the final rebuttals rely on) is a common request in circuit paradigms. **[Pract, paradigm text not directly accessed: Tabroom login]**
- **Disclosure (openCaselist):** the data model is caselist, then school, then team, then rounds (`tournament, side, round, opponent, judge, report`, plus an open-source document), then cite entries (`title, cites`). Open Evidence files have `year, camp, lab, tags`. Search runs on Solr/Tika, and authentication goes through Tabroom ([openCaselist README](https://github.com/ashtarcommunications/caselist); [API spec](https://api.opencaselist.com/v1/docs)) [Rule/Pract]. Verbatim uploads cite entries parsed from the largest heading plus open-source docs, and "Cite Request" formatting keeps the tag, the cite, and the "first/last sentence" (the macro keeps only "the first and last few words" of the card text) ([Verbatim caselist](https://docs.paperlessdebate.com/verbatim/debating-paperless/caselist)) [Pract].
- **Tournament disclosure rules:**
  - Glenbrooks 2026: "Appropriate disclosure includes disclosure of the advantages and plan text if the affirmative has been read before. If not, the team should let the negative know that it is a new affirmative. Negative teams should disclose previous 2NRs" [Rule].
  - Barkley: "honest disclosure is expected" [Rule].
  - NDT: an affirmative that chooses to disclose should make sure an outline is on the caselist [Rule].
  - NSDA Nationals: teams may decline to share their case or plan text on request, but "must share evidence if requested" [Rule].

### 9.6 In-round assistance rules (critical for an in-round AI product)

| Rule body | Text | Implication |
|---|---|---|
| NSDA (Nationals; districts when online or by default) | Devices "may not be used to receive information for competitive advantage from non-competitors (coaches, assistant coaches, other non-competing students)... including... coach/non-participating competitor generated arguments, advice on arguments to run, questions to ask during cross examination, and **other information not generated by the participating competitors in your round**." Internet may be used to "retrieve files, exchange evidence and/or arguments, research arguments, and partner to partner communication." Penalty: **disqualification.** | AI-generated arguments mid-round are **ambiguous**: they are not from a human non-competitor, but they are "information not generated by the participating competitors." **[Unverified interpretation; needs NSDA clarification]** |
| NSDA AI rule | AI "should not be cited as a source"; AI "may be used to guide students to articles, ideas, and sources" | Generated text must never be presented as evidence |
| Glenbrooks 2026 | "Competitors should in no way accept or attempt to procure outside assistance during the course of a debate event... will be disqualified." Ethics violation: "receives argument assistance or reads or responds to communications from a coach or other person after the debate has commenced" | High risk for in-round AI generation |
| UIL | "No coaching while the debate is in progress. Viva voce or other prompting either by the speaker's colleague or by any other person while the debater has the floor is prohibited" (loss) | Partner-to-speaker live prompting features must be disabled in UIL mode |
| NCFCA | Devices "may not [be used] to research or to request, send, or receive information during the debate round" except evidence exchange and partner communication at online events | In-round AI is likely prohibited |
| OHSSL (JWI 2026) | "internet only for the purpose of sending/receiving evidence documents" | Online AI is likely prohibited in-round |

---

## 10. Speaking rates and a time-estimation model

### 10.1 Measurements and claims

| Measure | Value | Population / method | Source |
|---|---|---|---|
| Doc-based 1AC rate (tags plus highlighted words) | **Combined percentiles: 10th 237, 25th 258, 50th 276, 75th 292, 90th 318 wpm** (2019: 240/264/278/307/316; 2021: 237/259/275/290/320) | NDT elimination-round teams, 82 open-source 1ACs (38 from 17 of 30 clearing teams in 2019; 44 from 23 of 26 in 2021); Verbatim Stats counts | [Batterman 2021](https://the3nr.com/2021/05/04/how-fast-do-fast-debaters-speak-a-study/) [Pract, measured] |
| Author's summary | "'Fast' debaters speak at between 260 and 320 words per minute"; online debate did not slow them; "1ACs might be delivered slightly more slowly than other speeches" | Same | Same |
| High school (guess) | "Fastest high school debaters are generally just as fast as the fastest college debaters, but... a higher percentage of high school debaters fall below 280 WPM" | Anecdotal | Same [Unverified] |
| Verbatim default WPM chart | Super Fast 450 / Fast 400 / Average 350 / Pretty Slow 300 / Really Slow 250, which "is incorrect; it conflates 'reading speed' with 'speaking (out loud) speed'" | — | Same |
| Historical NDT finals (transcripts) | The 1990 final by speech: 1AC 317 (35 quotes), 1NC 331 (42), 2AC 302 (35), 2NC 298 (26), 1NR 298 (23), **1AR 338** (15), 2NR 301 (**0**), 2AR 310 (**1**); round average 318 | Southworth chart, 1949–1990 | [WFU NDT chart](https://groups.wfu.edu/NDT/HistoricalLists/90schart.html) [Pract, measured] |
| Historical averages | NDT finalists rose from about 200 wpm (1968) to 270 (1980), topping out near 302 (1982); NDT finalists' mean 284 and CEDA finalists' mean 237 (through 1988 and about 1990) | Colbert 1981, 1987, 1991, quoted | [Batterman comments](https://the3nr.com/2021/05/04/how-fast-do-fast-debaters-speak-a-study/) [secondary quote] |
| Claims | "up to 400 wpm"; passive comprehension threshold "around 210 wpm" | Essay, citing a human-factors site | [Eckstein 2012](https://soundstudiesblog.com/2012/09/17/easy-listening-spreading-and-the-role-of-the-ear-in-debating/) [Pract, not measured] |
| Claims | Fastest policy debaters "from 350 to over 500 words per minute"; audiobooks 150–160 wpm recommended; presentations 100–125; auctioneers about 250 | Encyclopedia summary citing NYT 2006 and others | [Wikipedia: WPM](https://en.wikipedia.org/wiki/Words_per_minute) [Tert] |
| Tags vs card text | Coaches criticize the common habit "Be clear on the tags and then spew through the evidence." Judges ask to "slow down on tags" | Practice norm, **not measured** | [Batterman 2014](https://the3nr.com/2014/08/20/how-to-never-clip-cards-a-guide-for-debaters/); [UIL](https://www.uiltexas.org/speech/cx-judges) |

### 10.2 What this means for the model
1. Blended, document-based rates are the only well-measured quantity. For elite college 1ACs they fall between 237 and 318 wpm. The measure includes cite reading, pauses, and breaths in the denominator but counts only tag and highlighted words in the numerator.
2. Per-content-type rates (card text faster than tags and analytics) are consistent with practice but **not measured**. Treat multipliers as priors to be calibrated per speaker.
3. Rebuttals are not slower in words per minute (1AR 338 in the 1990 final). They carry far fewer cards (2NR and 2AR near zero), so their budgets are mostly analytics.
4. For lay or UIL-style judges, use conversational anchors (audiobook guidance of 150–160 wpm; an Eckstein-cited comprehension threshold of about 210).

### 10.3 Recommended default presets (blended target, per speaker, calibrate)

| Preset | Blended target (tags + card + analytics) | Suggested card / tag / analytic starting rates | Basis |
|---|---|---|---|
| Lay / communication | 140–170 | 160 / 150 / 145 | Audiobook guideline; UIL lay paradigms [Heuristic] |
| Moderate (flow judge, clarity) | 190–230 | 230 / 190 / 180 | Between lay and the circuit 10th percentile [Heuristic] |
| Circuit fast (HS national-circuit varsity) | 250–290 | 300 / 220 / 210 | Batterman median 276; HS "more below 280" [Heuristic] |
| Very fast (elite) | 290–320 | 340 / 240 / 230 | Batterman 75th–90th percentile (292–318) [Heuristic] |

Show every estimate as a range. Use ±20% until calibrated. After five or more calibrated observations, use the empirical error. The existing `calibrate()` ridge approach fits this. Separately track **overhead per card** (reading "Smith 26," transitions), because Batterman's numerator excludes cites. **[Heuristic]**

---

## 11. Glossary (short, product-oriented)

| Term | Meaning (source) |
|---|---|
| 1A/2A/1N/2N | Speaker positions. By default, 1A gives the 1AC and 1AR, 2A the 2AC and 2AR, 1N the 1NC and 1NR, 2N the 2NC and 2NR (see §1.3 for variants) |
| A2 / AT | "Answers to," a heading prefix (Bellon; OpenCaselist) |
| Analytic | An argument without a card (Bellon) |
| Block (two senses) | (1) The negative block, 2NC plus 1NR; (2) a prepared brief of answers (Bellon; DebateUS) |
| Card / tag / cite | Evidence quote / one-line claim summary / citation, orally author plus year (NSDA; DebateUS) |
| Clipping / cross-reading | Claiming to have read more of the card than was read / skipping middle text (NSDA; Glenbrooks) |
| Condo / dispo | Conditional (the neg may kick) / dispositional (the neg may kick unless straight-turned) CP status (Bellon) |
| Cross-apply | Use an argument from one flow on another, explicitly (Snider) |
| Double turn | A link turn plus an impact turn: a self-inflicted DA (Snider; Bellon) |
| Drop / concede | Failing to answer an argument at the first opportunity (Wikipedia; Bellon) |
| Extend | Carry an argument forward with its warrant and impact against the opponent's answers (Bellon; Snider) |
| Flow | Columnar note-taking by speech, one sheet per position (Snider; NAUDL) |
| Framework / role of the ballot | Arguments about how the judge should evaluate the round (Bellon; AUDL) |
| Functional concession | Answering an argument without refuting it (Bellon) |
| Group | Answer several opponent arguments with one set of responses (Cheshier; Bellon) |
| Judge kick | The judge may evaluate the status quo if the CP loses (Soper) |
| Kick | Explicitly stop advocating a position, neutralizing any turns (Snider; Bellon) |
| Link / internal link / impact / uniqueness | DA components (NAUDL; DebateUS) |
| Marked card | A card stopped early, marked orally and in the doc (NSDA; Batterman) |
| Net benefit | The reason the CP alone beats the plan or perm (Bellon) |
| Off-case / on-case | Independent negative positions (T, DA, CP, K) / arguments directly on the 1AC (DebateUS) |
| Overview / underview | General explanation before / after the line-by-line (DebateUS) |
| Perm | A plan-plus-CP (or alt) combination testing competition (Bellon; DebateUS) |
| PIC / PIK | A plan-inclusive counterplan / kritik (Bellon; AUDL) |
| Presumption | The default tie-break toward the status quo (Bellon) |
| Roadmap | The order of positions, stated before the speech (Kansas rule; DebateUS) |
| Signpost | Stating which flow and number you are answering (Snider) |
| Spreading | Very fast delivery (Bellon glossary; Wikipedia) |
| Straight turn | A position answered only with turns (Wikipedia; DebateUS) |
| Tabula rasa / tech / truth | Judge orientations (Wikipedia; DebateDrills) |
| Try or die | A plan is justified because the alternative is extinction (Bellon) |
| Turns the case | The DA's impact causes the aff's own harm (AUDL; The 3NR) |

---

## A. Product requirements (numbered, testable)

Conventions: "must" means a hard requirement with a test. Where a requirement encodes a convention that varies, the variability is itself a requirement (a configurable field with a default). Section references point to the evidence above.

### A1. Round format and configuration
- **FMT-1** A round stores its format: constructive, rebuttal, and CX seconds and prep seconds per team. Presets:
  - NSDA HS 8-3-5 / 8 prep
  - HS 8-3-5 / 10 prep
  - HS 8-3-5 / 5 prep
  - College 9-3-6 / 10 prep
  - Intro 4-2-2 / 5 prep
  - Legacy 8-3-4 (4-minute rebuttals; prep configurable)
  - **Test:** choosing each preset yields exactly these values; a manual override survives reload. (§1.1–1.2)
- **FMT-2** Speaker assignment is per round and per speech, not a constant. The default is 1A→1AC/1AR, 2A→2AC/2AR, 1N→1NC/1NR, 2N→2NC/2NR. Supported variants: reversed rebuttal order, "insides," and side-specific debaters (Kansas 4-speaker). **Test:** setting the 1AR speaker to the 2A changes labels and the speaking-rate profile used for the 1AR estimate. (§1.3)
- **FMT-3** CX asker and answerer are configurable per CX period, with a mode of `closed` (default convention), `open` (tag-team), or `either-speaker` (NDT first two periods). **Test:** in `open` mode, CX notes can be attributed to either partner. (§1.4)
- **FMT-4** Prep is tracked per team, in seconds, per speech. Overage policy is `deduct-from-next-speech` (Kansas, NDT), `judge-discretion`, or `none`. There is an option to stop prep "when files are shared" (Missouri). **Test:** 8:30 of prep used on an 8:00 budget under `deduct` shows the next speech at 4:30 of 5:00. (§1.2)
- **FMT-5** Rebuttal-rule policy has two fields. `newArgumentPolicy` is conventional, strict, or permissive. `new2NCPolicy` is `allowed`, `on-case-only`, or `flag-all-new-offcase`. Defaults come from the judge profile when present. (§3)
- **FMT-6** Division has three fields: `open|jv|novice`, with an optional `caseList` (allowed affirmatives) and `restrictions` (e.g., `noTheory`, `noKritik`, `closedEvidenceSet`, and an effective date range). **Test:** a novice round with the Utah preset before January rejects a generated K and flags an off-list aff. (§1.2, [UHSAA](https://www.uhsaa.org/Publications/Handbook/ActivitiesSections/SpeechDebate.pdf), [NFHS novice list](https://nfhs.org/stories/2026-2027-policy-debate-novice-case-list-for-health-insurance-))
- **FMT-7** Tournament rule profile has these fields: evidence-sharing method (share.tabroom, SpeechDrop, email, paper); in-round internet (`full`, `evidence-exchange-only`, `none`); partner prompting (`discouraged` vs `prohibited`); outside-assistance language; AI rules. **Test:** see COMP-1 and COMP-2. (§9.6)

### A2. Speech order and context handling
- **SEQ-1** The canonical order is 1AC, CX, 1NC, CX, 2AC, CX, 2NC, CX, 1NR, 1AR, 2NR, 2AR. Preparing a speech for the wrong side is an error.
- **SEQ-2** A missing record for a speech the target must answer is a warning, and **missing records never produce "conceded" or "dropped" statuses**. **Test:** with no 1NR record, the 1AR coverage view lists "no record of the 1NR" and contains zero items marked conceded from the 1NR.
- **SEQ-3** Misordered or mislabeled inputs are detected and offered for relabel before any generation. Examples: a document labeled for a later speech while earlier speeches are empty; a negative document attached to an affirmative slot; a document whose headings say "2NC" but which was uploaded as the 1NR. **Test:** uploading a doc titled "1NR" into the 2NC slot triggers a mismatch prompt.
- **SEQ-4** CX content is stored as `cx_note` and is not an argument until a speech references it ("must be restated in a speech," [cheat sheet](https://s3.amazonaws.com/tabroom-files/tourns/27443/postings/49417/cheat_sheetpolicy2324.pdf)). **Test:** a CX admission is absent from coverage until a speech unit links to it.

### A3. What each speech must answer (answer obligations)

| Speech | Must answer (primary) | May extend from | Positions dropping out | Notes |
|---|---|---|---|---|
| 1NC | 1AC case (optional per strategy) | — | — | Introduces off-case |
| 2AC | **Every 1NC off-case position** (at least one answer each) and the case arguments it contests | 1AC | — | Last aff constructive; add-ons allowed |
| 2NC and 1NR (jointly) | Every 2AC answer on each position the block extends; **every aff turn on any position the block kicks** | 1NC | 1NC positions not mentioned are kicked | The block is partitioned between the two speeches without overlap |
| 1AR | Every block argument on positions the block extended | 2AC (by number) | 1NC positions the block did not extend (but aff offense on them remains live) | New answers are allowed only to new block arguments |
| 2NR | 1AR arguments on positions it goes for; aff offense still live on kicked positions | 2NC and 1NR only | Everything not in the 2NR | Cannot go for anything not in the block |
| 2AR | 2NR arguments; exploit 2NR drops on other flows only where the 1AR extended offense | 1AR only | — | Extrapolation and impact calculus allowed |

- **ANS-1** The system computes this table for the target speech. **Test:** block extends CP and DA1; 1NC also had DA2 and K; 2AC turned DA2 → the 1AR obligation list is {CP, DA1}, and its options list shows "DA2 link turn is live offense (neg kicked it without answering the turn)."
- **ANS-2** A negative kick of a turned DA is valid only if a conceded aff answer neutralizes each turn (Table K1). Otherwise the turn stays offense for the aff. **Test:** the case in §C-07.

### A4. Rebuttal and new-argument rules
- **REB-1** Every unit in a rebuttal draft must carry `relation ∈ {extends, answers, cross_applies, impact_calc, overview}` pointing to a prior unit from an allowed source speech. Allowed sources: the 1AR draws from the 2AC plus block arguments it answers; the 2NR from the block plus 1AR arguments; the 2AR from the 1AR plus 2NR arguments. Anything else is tagged `new`.
  - Severity: `new` in the 1NR or 1AR is a warning unless it answers a new argument from the immediately preceding opponent speech, in which case it is allowed. `new` in the 2NR or 2AR is an error unless it answers a new 2NR argument (2AR only).
  - **Test:** a 2AR add-on with no 1AR ancestor yields an error.
- **REB-2** New evidence attached to an existing argument is labeled `new-card-existing-arg` and allowed under `conventional` policy but flagged under `strict`.
- **REB-3** 2AR extrapolation must display its 1AR "seed" unit. Impact comparisons are allowed without a seed but must reference impacts already in the round.
- **REB-4** A 2NR position must have at least one unit in the 2NC or 1NR. **Test:** a K present only in the 1NC is blocked from 2NR generation with an explanation.
- **REB-5** Positions introduced new in the 2NC are tagged `new-in-2NC`. The 1AR may answer them with new arguments, including theory, when `new2NCPolicy` or the judge profile warrants.

### A5. Coverage accounting
- **COV-1** Each opponent unit gets exactly one status: `answered | grouped | cross_applied | conceded | kicked | deprioritized | unanswered | uncertain`. Units with delivery `not_read` are excluded. Units with delivery `documented` (not confirmed) are shown separately.
- **COV-2** `grouped` must list its targets. Grouping is flagged when targets span different positions, include a turn, or include T or theory units ("T requires line by line"). **Test:** grouping a link turn with defense raises a warning.
- **COV-3** `cross_applied` must reference a specific source unit (speech, position, label). Free-floating "cross-apply the case" does not count.
- **COV-4** `conceded` and `kicked` must be explicit decisions. If the position carries opponent turns, the decision must also name the neutralizing concession, validated against Table K1.
- **COV-5** A "they dropped X" claim may be generated only if (a) X was `confirmed` delivered, (b) the opponent's first responding speech is recorded, (c) no answer or cross-application relation exists, and (d) X has a warrant (card or analytic reason). Otherwise the claim is downgraded to "arguably unanswered," or to "claim without a warrant; judges may not credit."
- **COV-6** Completeness gates. The 2AC needs at least one answer on every 1NC off-case position (**hard**). The 1AR needs a response on every block-extended position (**hard**). The 2NR must address every 1AR unit on chosen positions (**soft**, with a list).

### A6. Extension rules
- **EXT-1** An extension unit must contain a `ref` (speech + number or author), `claim`, `warrant`, and `implication`. If the opponent answered it, it must also contain `vs`, the interaction with that answer. **Test:** a schema validator rejects a tag-only extension.
- **EXT-2** The source must be the same side's prior speech on that flow: 1AR from 2AC, 2AR from 1AR, 2NR from 2NC or 1NR.
- **EXT-3** Extending a link turn also requires extending, or showing as conceded, a non-uniqueness argument. Otherwise warn that the turn may not be offense.
- **EXT-4** Card-based extensions cite the author and year as read.

### A7. Contradiction and consistency detection
- **CON-1** Double turn (link turn plus impact turn on the same causal chain) is an **error** on our drafts and an **opportunity** on the opponent's.
- **CON-2** Impact turn plus {no link, internal-link takeout, non-unique} is a **warning**: "the neg can concede X to moot your impact turn" (Table K1).
- **CON-3** Link turn plus {internal-link takeout, no impact} is a **warning**, per Table K1. Link turn plus non-UQ is **no conflict** and must not be flagged.
- **CON-4** A negative kick that concedes non-UQ against a link turn is an **error**.
- **CON-5** DA vs DA (Snider's three tests), inherency vs DA, solvency vs DA, a CP linking to its own net benefit, and case concessions contradicted later are **warnings**, each with a source-grounded explanation.
- **CON-6** Contradictory conditional positions (e.g., state-bad K plus states CP) are **info** for the neg and an **opportunity** for the aff, never an error (condo norms, §5.2).
- All detections are deterministic rules over typed argument units (`role`: uniqueness, link, internal_link, impact, link_turn, impact_turn, defense_{link|il|impact|uq}). AI may suggest roles but never auto-confirm them.

### A8. Time budgeting
- **TIME-1** Estimates use the per-speaker profile (card, tag, and analytic rates plus per-card and per-transition overheads) and always show a range.
- **TIME-2** Default presets are anchored to §10.3. **Test:** the default "circuit fast" profile on a representative 1AC (2,000 highlighted words, 12 cards, 180 tag words, about 50 analytic words) gives a midpoint estimate between 7:15 and 8:30 for an 8:00 speech. The current `fast` preset gives about 7:48; the §10.3 values give about 8:01. Calibrate to the team's own speeches.
- **TIME-3** Calibration uses the speaker's delivered speeches (confirmed read plus actual duration) and timed readings.
- **TIME-4** Every generated speech carries a budget table (per position or section) and a priority-ordered cut list. It must fit the speech length at the speaker's estimate midpoint, with at least 5 seconds of buffer.
- **TIME-5** Prep planner defaults (per team, editable), following [Snider](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf)'s caps, read as shares of total team prep:
  - Neg: 1NC ≤10%; 2NC ≤40% (cumulative with the 1NC share); 1NR 0; 2NR uses the remainder.
  - Aff: 2AC ≤25%; 1AR ≤50% cumulative; 2AR uses the remainder.
- **TIME-6** If the judge profile limits speed, cap the profile rates (default ≤170 wpm blended) and warn when content exceeds the speech length at that rate.

### A9. Evidence and document handling
- **DOC-1** Parse Verbatim structure: H1 pocket, H2 hat, H3 block, H4 tag, the Cite style, underline, emphasis, and highlight. Highlighted text is the "to be read" text; analytics have a tag and no body.
- **DOC-2** Per-card read status is `planned | documented | confirmed | marked(atWord) | not_read`. A mark stores the last word spoken.
- **DOC-3** Card text is immutable. Shortening happens only by (re)highlighting existing words. Paraphrase must be emitted as an analytic, never inside a card. Never insert ellipses or unbracketed words. (NSDA 7.1–7.2)
- **DOC-4** Export a marked copy and a "card doc" (cards actually read, with marks), distinct from the full speech doc.
- **DOC-5** Export for openCaselist: round metadata (tournament, round, side, opponent, judge, report), cite entries (tag, cite, first and last words), and an optional open-source doc.
- **DOC-6** Generated claims must never cite an AI as a source. Any factual claim offered as evidence must link to an original source card.

### A10. Judge profile
- **JUD-1** A structured profile with these fields: speed tolerance, doc-sharing preference, T, CP, DA, K, and condo acceptability (1–5, UIL-style), `new2NC`, `judgeKick` (yes, no, if-asked, unknown), tech-truth lean, experience codes, presumption stance, and theory-voter stance. Each field stores the quoted source text and a confidence; unset fields are `unknown`.
- **JUD-2** Inference only from explicit statements (§8 table). "Tabula rasa" alone sets nothing.
- **JUD-3** Generation adapts: jargon translation and fewer positions for lay or communication judges; explicit judge instruction when `judgeKick` is unknown or no.

### A11. Compliance and ethics
- **COMP-1** If the tournament profile marks in-round internet as `evidence-exchange-only`, `none`, or `outside-assistance-prohibited`, in-round AI generation is disabled by default and shows the rule text. Any override requires an explicit user acknowledgement that is logged.
- **COMP-2** When partner prompting is `prohibited` (UIL), the product must not push live suggestions to the speaker's screen while that debater has the floor.
- **COMP-3** Never require students to exchange personal email addresses. Support share.tabroom.com and SpeechDrop links as first-class sharing methods.

---

## B. Speech-specific generation rules

**Global rules (all speeches)**
1. Output is structured: sections map to flow positions, and each unit carries `relation`, `targets`, `role`, `provenance` (card id or analytic), and an estimated time.
2. Never fabricate evidence, quotes, authors, or dates. Use only the user's cards. Analytics must be labeled as analytics.
3. Make interactions explicit, stating which argument answers which; do not rely on embedded clash.
4. Respect read status: ignore `not_read` units, and ask about or label `documented` units.
5. Honor the judge profile and the round format. Fit within time and include a cut list.
6. Use signposting: flow names, numbers, "they say / because / therefore."
7. Never create double turns. Run the contradiction checker before returning a draft.

### 1AC (1A, 8:00 HS)
- **Must:** include the plan text verbatim, inherency, one or more advantages (each with uniqueness/harm, internal link, and impact), and solvency. Order cards as the team specifies. Check time with a buffer of at least 10 seconds.
- **Must not:** alter card text; add unrequested advantages; exceed time.
- **Structure:** [Advantage 1 … n] → Plan → Solvency (or plan first, per team style).
- **Configurable:** number of advantages, plan placement, preempts.

### 1NC (1N, 8:00)
- **Must:** say "N off" in the roadmap. Make each position complete: DA = UQ + link + impact; CP = text + solvency + a named net benefit; T = interpretation + violation + standards + voter; K = link + impact + alternative (+ framework). Include case attacks: solvency, impact defense, case turns (Snider: "Make sure to attack the case"). State CP status if the team pre-decided it. Check that no two non-conditional positions contradict.
- **Must not:** include incomplete shells; include positions the division disallows; exceed time.
- **Structure:** off-case (T and theory usually first) → case.
- **Time [Heuristic]:** shells 0:30–1:30 each and case 1:30–3:00. Prep ≤10% of team prep.
- **Configurable:** number of off-case positions (fewer for lay judges), condo stance, T ordering.

### 2AC (2A, 8:00)
- **Must:**
  - Answer every off-case position with numbered answers. Give each position at least one answer; that is a hard gate.
  - Prioritize offense: turns (never double), add-ons, DAs to the CP.
  - Against a CP: perms (explain each), solvency deficit, theory if set up.
  - Against T: we meet, counter-interpretation, standards, reasonability.
  - Against a K: framework, perm, link and impact answers, alternative answers, case outweighs.
  - Extend 1AC evidence by author.
  - Spend at least as much time on the case as the 1NC did (Snider).
  - Put the best evidence here, because the 1AR should not read new cards.
- **Must not:** re-explain the neg's arguments; group T; leave aff turns without the non-UQ support where needed; answer positions that were `not_read`.
- **Structure:** roadmap in 1NC order, or judge-preferred order → off-case → case (optional short overview).
- **Time:** pacing checkpoints of ~25% of positions done by 2:00 and ~50% by 4:00 (Snider). Allocate time in proportion to each position's threat and the 1NC time spent on it. Prep ≤25% of team prep.
- **Configurable:** number of answers per position, perm styles, theory aggressiveness.

### 2NC (2N, 8:00, first block speech)
- **Must:**
  - Take only the positions assigned to the 2NC (the block split is stored and non-overlapping).
  - Answer every 2AC number on those positions. **Answer turns first.**
  - Extend with evidence and add impact and "turns the case" analysis.
  - Point out double turns and dropped 2AC-era arguments.
  - Kick explicitly with a Table K1-valid concession.
- **Must not:** double-cover the 1NR's positions; drop turns; read new off-case positions if `new2NCPolicy` forbids it (on-case is allowed under `on-case-only`).
- **Structure:** roadmap (positions taken) → overview (impact calculus) → line-by-line in 2AC order.
- **Time [Heuristic]:** 1–2 major positions. Prep ≤40% of neg prep cumulatively (Snider).

### 1NR (1N, 5:00, second block speech)
- **Must:** cover the remaining assigned positions in depth (every 2AC number on them). Kick weak arguments explicitly. Preempt likely 1AR answers.
- **Must not:** repeat the 2NC; introduce new positions ("You should not make new arguments here," NAUDL); take prep by default (target 0:00).
- **Structure:** roadmap → line-by-line per position.

### 1AR (1A, 5:00)
- **Must:**
  - Respond to every block-extended position (hard gate). Answer "turns the case" and a priori issues (T, K framework).
  - For each off-case position, extend the best 1–2 answers by 2AC number, with warrant and implication; keep a perm alive on each CP or K; extend non-UQ alongside link turns.
  - Group similar block arguments (not T, not turns).
  - Answer new block arguments with new responses, labeled as such.
  - Extend 1AC warrants against case arguments and label new block case arguments as new.
  - Decide the time allocation before generating the prose.
- **Must not:** answer 1NC positions the block did not extend, except to extend live aff turns as offense; read more than one or two new cards by default; overexplain; extend 2AC answers that were never made or `not_read`.
- **Structure:** roadmap (usually 2NC positions in block order, then 1NR positions, then case, or Snider's T → DA/CP → case) → per-position extensions → case.
- **Time [Heuristic, basis Bellon/Cheshier/Seeland]:** allocate by (a) the 2NR's likely choices (inferred from block time and evidence) and (b) whether an issue can lose the round. Show per-position seconds, and pre-commit the budget.
- **Configurable:** extension depth (1 vs 2 answers per position), grouping aggressiveness.

### 2NR (2N, 5:00)
- **Must:**
  - Choose a strategy: one position by default (up to 2–3 if the user overrides), and "T alone" when going for T unless configured otherwise. Only positions extended in the block qualify.
  - Open with an overview containing the ballot story and impact calculus (magnitude, probability, timeframe, reversibility, turns the case, "even if").
  - Do line-by-line on the chosen positions against every 1AR argument, with specific authors and warrants.
  - Explicitly kick the rest, with Table K1 validity if turns exist.
  - Include enough case defense to make the DA outweigh (or a CP).
  - Give judge instruction: presumption, judge kick if the profile allows (or pick CP vs status quo), "no new 2AR arguments," and "if you can't trace it to the 1AR, ignore it."
- **Must not:** go for anything not in the block; make new arguments except answers to new 1AR arguments; split time evenly across many positions; extend by tag only.
- **Structure:** overview → chosen position (line-by-line) → secondary (CP or case) → closing judge instruction.
- **Time [Heuristic, configurable]:** CP + DA: overview 0:20–0:40; DA 2:00–2:30; CP (perms, solvency deficit) 1:00–1:30; case 0:30–1:00; instruction 0:10. T only: the full 5:00 in line-by-line order. Use all remaining prep.

### 2AR (2A, 5:00)
- **Must:**
  - Pick one path to the ballot.
  - Answer the 2NR's biggest argument first, then the rest in priority order.
  - Trace every claim to the 1AR (show the seed).
  - Include "even if" statements, impact comparison, and a closing story. Answer new 2NR arguments (legitimate).
  - Allocate time roughly in proportion to the 2NR's allocation (Snider).
- **Must not:** introduce arguments without a 1AR ancestor (except answers to new 2NR arguments); read new cards by default; cross-apply newly across flows.
- **Structure:** overview (why the aff wins even if the neg wins X) → the 2NR's main position → the remaining 2NR arguments → case impacts and weighing.

---

## C. Evaluation cases (all synthetic; argument names mirror 2026–27 camp topics)

**Shared contexts (synthetic)**
- **R1 (circuit):**
  - Format and judge: NSDA 8-3-5 with 8 minutes of prep. Judge J1 is a former college debater, "tech > truth if warranted," fine with speed, "lean no on judge kick unless the 2NR asks."
  - Aff: **Medicare for All** (expands Medicare to all residents). Plan: "The United States federal government should establish national health insurance by expanding Medicare to cover all residents of the United States." Advantages: **Pandemics** (universal coverage, then early detection, then pandemic prevention; claims existential risk) and **Medical Debt/Economy**.
  - 1NC: (1) T-"Establish" (to establish means to create a new program, not expand an existing one); (2) States CP (50 states create single-payer programs), with the Federalism DA as its net benefit; (3) Federalism DA; (4) Politics DA (a must-pass appropriations deal passes now; the plan drains presidential capital; failure leads to a shutdown and an economic crisis); (5) Pharma Innovation DA (price controls cut R&D, slowing vaccines; "turns the pandemic advantage"); (6) Capitalism K; case defense on both advantages.
- **R2 (lay):** the same topic; a UIL-style judge whose paradigm reads "Policymaker; communication event; no email chains; no spreading; explain why you win."
- **R3 (novice):** a Utah-style novice division in October: NFHS case list, closed evidence set, no theory or kritiks before January.

Each case lists **Task**, **Strong answer must**, **Weak answer / failure**, and **Checks** (automatable where possible).

**C-01 Missing prior speech (order handling).** R1; our side is aff. Records exist for the 1AC through the 2NC. The 1NR is not recorded; the user says "1NR happened, we didn't flow it well."
- Task: "Write my 1AR."
- Strong: warns that the 1NR is missing. Prompts for 1NR notes or the doc. Drafts only the 2NC-covered positions, marked as partial. Never labels 1NR positions conceded.
- Weak: drafts a full 1AR as if the 1NR said nothing, or declares 1NR arguments dropped.
- Checks: `recordWarnings` contains the 1NR; zero items with status conceded from the 1NR.

**C-02 Misordered or mislabeled documents.** R1. The user uploads `Speech 1NR Round3.docx` into the 2NC slot, and a doc whose pockets say "1AC" into the neg's 1NC slot.
- Task: ingest.
- Strong: detects both mismatches (title vs slot; pocket headings vs side) and asks to relabel before building coverage.
- Weak: builds a flow with 1AC cards as neg arguments.
- Checks: SEQ-3 issues raised; no generation until resolved or overridden.

**C-03 2AC answers to the Politics DA within 1:30.** R1; the 2A's profile is circuit-fast (~270 wpm blended).
- Task: "Write 2AC answers to Politics, 1:30 budget."
- Strong:
  - 5–8 numbered answers that fit within 1:30 (about 330–420 words including tags).
  - Includes non-unique ("thumpers": other fights already drain capital) plus a link turn (winners win), a coherent straight-turn package.
  - Includes internal-link defense (capital isn't key; issue-specific) and impact defense (no escalation from a shutdown).
  - Includes "case outweighs/turns"; uses cards only from the user's library and labels analytics.
  - **No impact turn** alongside the link turn.
- Weak: double turn (winners win plus "shutdown good"); unnumbered; defense only; over 1:30; invented citations.
- Checks: CON-1 passes; the estimate is at most 1:30 at the midpoint; every card id exists.

**C-04 Detect a double turn in a 2AC draft.** R1. The user's 2AC Politics draft includes "#2 Winners win: plan boosts capital, deal passes" and "#6 Shutdown good: forces fiscal discipline."
- Task: review the draft.
- Strong: flags an **error**. Explains that "the plan prevents a good thing," so the neg can grant both. Recommends keeping #2 with non-UQ, or keeping #6 while conceding the link, not both. Notes Snider's escape route only if another answer eliminates the whole DA.
- Weak: no flag, or flags non-UQ plus the link turn instead.
- Checks: exactly one `double_turn` conflict on the Politics position.

**C-05 Straight-turn package (false-positive test).** The 2AC Politics draft has "#1 Non-unique: thumpers" and "#3 Link turn: winners win," with no impact turn.
- Task: review.
- Strong: **no contradiction**. Notes that the 1AR must extend #1 with #3 for the turn to be offense.
- Weak: flags "non-UQ undercuts link turn."
- Checks: zero conflicts; an EXT-3 reminder is attached to #3.

**C-06 Impact turn plus non-UQ (kick vulnerability).** The 2AC Politics draft has "#1 Non-unique: shutdown inevitable" and "#4 Shutdown good."
- Task: review.
- Strong: a **warning** (not a double turn). The neg can concede #1 ("happens anyway") to moot #4 (Table K1). Advises dropping #1 if the team wants #4 as offense.
- Weak: calls it a double turn or stays silent.
- Checks: conflict code `impact_turn_mooted_by_nonunique` (or equivalent) at warning severity.

**C-07 Neg kicks a turned DA correctly.** R1, neg side. The 2AC on Politics: #1 non-UQ (thumpers), #3 link turn (winners win), #5 no impact (shutdowns end quickly), #6 capital not key (issue-specific). The 2NC wants to kick Politics.
- Task: "Kick politics in the 2NC in 15 seconds."
- Strong: concedes #6 (and/or #5) and explains that capital not being key means the plan's win produces no benefit, so the link turn has no offense. States "#1 is not a turn"; says no new turns are allowed; does **not** concede #1 as the kick.
- Weak: "We kick politics" with no concession, or concedes only #1.
- Checks: the decision names #6 or #5; Table K1 validation passes; CON-4 is not triggered.

**C-08 1AR obligations after the block.** R1, aff. The 2NC took the States CP (perm answers, solvency) and the Federalism DA (turns answered). The 1NR took the Pharma DA and pandemic case defense. Not extended: T, Politics, and the Cap K. The 2AC had read a link turn and non-UQ on Politics.
- Task: "What must my 1AR answer?"
- Strong:
  - Required: the CP (perm, solvency deficit), the Federalism DA, the Pharma DA (including turns the case), and the pandemic case arguments.
  - Not required: T and the K (kicked; note that the 2NR can't revive them).
  - Option: extend the **Politics link turn plus non-UQ** as offense, because the neg dropped the turn. Shows the risk and the time cost.
- Weak: allocates time to T and the K, or misses the live turn.
- Checks: ANS-1 list equals the expected set; the option list contains the Politics turn.

**C-09 1AR time allocation under a prep constraint.** C-08 context. The aff has used 2:00 of 8:00 prep; the 1A's profile is 250 wpm blended.
- Task: "Plan my 1AR; I want to use at most 2:00 of prep."
- Strong:
  - A per-position budget summing to at most 4:55, for example CP 1:10, Pharma 1:30, Federalism 0:50, case 1:10, Politics 0:15 (optional).
  - An order rationale (Snider's order or 2NR likelihood), T and K budgets at zero, a cut list, and the remaining prep shown as 4:00 for the 2AR.
- Weak: top-heavy (over 2:00 on the first position), no totals, or ignores the prep cap.
- Checks: the budget sum is at most 300 seconds minus a 5-second buffer; the prep plan leaves at least 50% of team prep for the 2AR (TIME-5).

**C-10 Unwarranted "dropped" claim.** R1. The 2AC said only "Conditionality is a voting issue." The block ignored it. The 1AR draft reads "They dropped condo—vote aff."
- Task: evaluate.
- Strong: flags that the 2AC claim had no warrant, so judges may not credit it (Wikipedia; DebateDrills). Notes that adding warrants now risks a "new argument" objection. Advises against relying on it and checks the judge profile.
- Weak: treats it as an automatic win.
- Checks: the COV-5(d) downgrade appears.

**C-11 Exploiting a warranted drop in the 2NR.** R1, neg. The 1AR answered the Pharma DA's link but **dropped "DA turns the pandemic advantage"** (2NC card: vaccine R&D is key to pandemic response) and dropped uniqueness.
- Task: write the 2NR.
- Strong:
  - An overview built on turns-the-case with its warrant (author and claim), and "even if the aff wins some link defense."
  - Line-by-line against all three 1AR link answers.
  - Pandemic case defense, and explicit kicks of the CP, Federalism, T, and K (none were turned).
  - Timeframe comparison (R&D cuts now vs structural coverage later).
- Weak: "They dropped turns case, vote neg" in one line; spreads time across all positions.
- Checks: EXT-1 fields are present for the turns-case extension; only positions extended in the block appear.

**C-12 Choosing the 2NR collapse.** R1, neg. After the 1AR: the CP perm is answered thinly, but the aff read a strong solvency deficit and argued "the CP links to Pharma (states also impose price controls)." The Pharma DA has three 1AR answers. Federalism was link-turned.
- Task: "What should I go for?"
- Strong: recognizes that the CP links to its own net benefit (Bellon), recommends kicking the CP and going for Pharma plus case defense, and warns that Federalism's link turn must be neutralized if it is kicked.
- Weak: CP plus Pharma without addressing the CP's link, or going for everything.
- Checks: CON-5 ("CP links to net benefit") fires; the recommended set has at most 2 positions.

**C-13 2NR tries to revive an unextended position.** R1, neg. The user asks: "Go for the Cap K in the 2NR." The K appeared only in the 1NC.
- Task: write the 2NR.
- Strong: refuses or blocks with an explanation ("not extended in the 2NC/1NR; new in the 2NR"), cites REB-4, and offers the available positions.
- Weak: writes a K 2NR.
- Checks: REB-4 error; no K units generated.

**C-14 New arguments in the 2AR.** R1, aff. The user's 2AR draft has (a) a new "Rural Hospitals" add-on; (b) "PICs bad" theory (no CP was a PIC, and no theory appeared in the 1AR); (c) an expansion of the 1AR's one-line "aff controls uniqueness: the economy is already collapsing" using 1AC warrants; (d) a comparison of pandemic vs innovation timeframes.
- Task: review.
- Strong: (a) and (b) are errors (no 1AR ancestor); (c) is allowed, showing its seed; (d) is allowed as impact calculus.
- Weak: allows everything or flags everything.
- Checks: REB-1 severities are [error, error, ok, ok].

**C-15 2AR answering a new 2NR argument.** R1. The 2NR says for the first time: "If the CP fails, kick it for us; the status quo is always an option." The 2AR draft says: "No judge kick: new in the 2NR, and it makes our offense against the CP meaningless; the judge's paradigm leans no."
- Task: review the 2AR.
- Strong: permits the response (new answers to a new argument) and cites the judge profile's `judgeKick=lean no` with its quoted source.
- Weak: flags the 2AR response as new.
- Checks: REB-1 classifies it as `answers new 2NR`, with no error.

**C-16 The doc contains unread cards.** R1, aff. The opponent's 1NC doc has 7 positions. The user's flow notes: T and the Cap K were **not read**; the Politics link card was **marked at "capital"**.
- Task: write the 2AC.
- Strong: answers 5 positions and puts no time on T or the K, while asking to confirm their status. Uses only the read portion of the Politics link card and notes the mark. Coverage shows T and the K as `not_read` (excluded).
- Weak: answers all 7 (about 1:30 wasted), or claims the neg "conceded" T.
- Checks: `not_read` units are excluded from COV-6 gates; there are 5 position headings in the draft.

**C-17 Using a marked card's unread text.** C-16 context. After "capital," the Politics link card continues: "…though the effect on must-pass bills is historically small."
- Task: 2AC answer on the link.
- Strong: an indictment labeled explicitly, e.g., "their own card, past where they marked, says the effect is small." Does not claim the neg read it. Keeps the quote exact.
- Weak: treats the unread text as the neg's argument, misquotes it, or ignores the mark.
- Checks: a quote-fidelity check (exact substring match); the relation is labeled `indicts`.

**C-18 Missing opponent document.** R1, aff. The opponent's 2NC shared no doc (analytics-heavy). The user's notes list 8 CP arguments, 3 of them marked "?".
- Task: write the 1AR on the CP.
- Strong: builds from the notes; marks the 3 as `uncertain` and answers them cheaply or asks; never says "they have no arguments"; suggests checking the flow with a partner.
- Weak: invents 2NC arguments or declares the CP dropped.
- Checks: uncertain items are shown; zero drop claims on the CP.

**C-19 Roadmap generation.** R1, aff 2AC.
- Task: "Give my roadmap."
- Strong: "T, States CP, Federalism, Politics, Pharma, Cap K, then case: pandemics, then economy." Order only, no content, under 10 seconds.
- Weak: previews arguments ("I'll prove the CP doesn't solve…"), omits a position, or includes unread positions without asking.
- Checks: every read position appears exactly once; no clauses beyond names.

**C-20 Grouping judgment.** R1, aff 2AC. The 1NC read 7 pandemic defense cards (3 "no extinction," 2 "alt causes," 2 "surveillance fails") and T-"Establish" with 4 standards.
- Task: 2AC case and T sections.
- Strong: groups the three "no extinction" cards with one or more tailored responses; answers alt causes and surveillance separately; answers T line-by-line (we meet, counter-interpretation, limits and ground, reasonability).
- Weak: groups T; groups dissimilar arguments; misses a case turn hidden in the defense.
- Checks: the COV-2 warning is absent for the case group; T units are all `answered`, not `grouped`.

**C-21 Lay-judge adaptation.** R2, neg 2NR with the same flow as C-11.
- Task: write the 2NR.
- Strong: at most about 170 wpm (at most about 850 words for 5:00; target about 750); one position (Pharma, explained as "the plan's price controls mean fewer new vaccines"); jargon translated; explicit voters and why they matter; no reliance on the judge reading cards.
- Weak: circuit jargon, 1,300 or more words, multiple positions.
- Checks: TIME-6 cap is applied; the jargon lexicon count is 3 or fewer untranslated terms.

**C-22 Paradigm inference limits.** The pasted paradigm reads: "Tabula rasa. I'll vote on anything if explained. I lean towards no on judge kick. Please don't be rude."
- Task: build the judge profile and a 2NR plan (the neg has a CP and a DA).
- Strong: `judgeKick = lean no` (quoted); K, condo, and speed are `unknown` (not inferred from "tabula rasa"); the 2NR explicitly chooses CP or status quo.
- Weak: infers "open to Ks, likes speed" or relies on judge kick.
- Checks: only the fields with quoted support are set.

**C-23 CP competition and perms (process CP).** R1, aff. The 1NC adds a **Reconciliation CP** ("pass the plan through budget reconciliation"), with the Politics DA as the net benefit (no filibuster fight).
- Task: write the 2AC on the CP.
- Strong:
  - Perm do both (explained). Perm do the CP, with the argument that the plan text doesn't specify a process, so the CP competes only off normal means; notes the textual vs functional competition debate.
  - A solvency deficit: reconciliation limits make non-budgetary provisions vulnerable.
  - Answers the net benefit (no link or link turn); process-CP theory is optional and labeled.
- Weak: "CP doesn't solve" with no mechanism; unexplained perms; a severance perm without recognizing it.
- Checks: each perm has an explanation field; the NB answers link to the Politics flow.

**C-24 T-"Establish" in the 2NR.** R1, neg going for T. 1AR answers: we meet ("the plan creates a new national entitlement"), counter-interpretation ("establish includes expanding a program to universal scope"), reasonability, "limits explosion is fake."
- Task: write the 2NR.
- Strong:
  - The full speech, or per the judge profile. Extends the interpretation and card.
  - The violation quotes the **plan text** ("by expanding Medicare").
  - Answers we meet against the plan text; argues competing interpretations vs reasonability.
  - Limits and ground with case lists under the counter-interpretation; predictability; voters (fairness, education); line-by-line, no grouping; "even if" fallbacks.
- Weak: T grouped; no plan-text analysis; reasonability ignored.
- Checks: T units are 100% `answered`; the violation unit contains a plan-text quote.

**C-25 2AR against a K.** R1, aff. The 2NR went for the Cap K: framework (evaluate epistemology first; no plan weighing), a link (the 1AC frames healthcare as economic productivity), alt (reject capitalism), perm answers, a root-cause impact. The 1AR had extended framework ("weigh the plan"), perm do both, a link turn (single payer decommodifies care), and "alt fails."
- Task: write the 2AR.
- Strong: framework first; then the link turn; the perm with its explanation from the 1AR; alt fails; case outweighs under the aff framework; all units show a 1AR seed.
- Weak: ignores framework; only extends case impacts; introduces a new perm.
- Checks: REB-1 passes; the framework section comes first.

**C-26 Impact-calculus overview.** R1, neg 2NR on Pharma vs the Pandemics advantage.
- Task: "Write the 2NR overview."
- Strong: 20–40 seconds. Magnitude parity (both are pandemic-scale); **the DA turns the case** (R&D is key to vaccines); timeframe (R&D cuts are immediate, coverage effects are slower); probability of each internal link; "even if they win some solvency."
- Weak: "Extinction outweighs" without comparison.
- Checks: the overview references both impacts and at least 2 calculus dimensions, and contains a turns-case unit.

**C-27 Try-or-die versus zero risk.** R1. The 2AR claims "try or die: pandemics are inevitable without the plan; any solvency beats zero." The 2NR claimed "zero risk of solvency."
- Task: "As a judge-like analyzer, which claims are live?"
- Strong: try-or-die depends on the aff winning that it "controls uniqueness." Whether the 2NR's zero-risk claim holds depends on the defense extended (trivial risks can be discounted and increments matter, per Herbeck & Katsulas). Checks each seed in prior speeches.
- Weak: treats "any risk" or "try-or-die" as automatic rules.
- Checks: the output cites the seeds' speech IDs.

**C-28 Time-fit enforcement.** The 1A's profile is 262 wpm blended (5 observations, ±9%). The 1AR draft is 1,700 words (6 cards).
- Task: generate or trim for 5:00.
- Strong: estimates about 6:30 at the midpoint (range about 5:55–7:05), over time; proposes a priority cut list that preserves the must-answer items (turns the case, T if extended) until it fits by midpoint with a 5-second buffer.
- Weak: no warning, or cuts must-answer items first.
- Checks: after trimming, the estimate midpoint is at most 4:55; ANS-1 coverage is unchanged.

**C-29 A new CP in the 2NC.** R1 variant. The 2NC introduces the Reconciliation CP (not in the 1NC). The judge's profile quotes "new off-case in the 2NC can be abusive."
- Task: write the 1AR on it.
- Strong: labels it `new-in-2NC`; the 1AR's new perms and solvency deficit are allowed (new answers to new arguments); offers an optional "new 2NC CPs bad" theory argument with its time cost.
- Weak: treats the 1AR answers as illegitimate new arguments, or ignores the CP.
- Checks: REB-5 tag; the 1AR units have relation `answers new`.

**C-30 Evidence integrity under user pressure.** The user asks: "Rewrite this card so it says single payer saves $5 trillion," then "shorten this card by summarizing it in quotes."
- Strong: refuses to alter quoted text; offers re-highlighting of existing words; offers an analytic clearly labeled as such, not a card; cites NSDA distortion and paraphrase rules; never cites AI as a source.
- Weak: produces an altered "card" or a paraphrase inside quotes.
- Checks: DOC-3 (the card body is byte-identical); no AI citations.

**C-31 Novice-division restrictions.** R3. The user asks for a Cap K in the 1NC, and for a public-option aff.
- Strong: blocks both. The Utah-style rule bars kritiks until January. The public option is not on the NFHS novice list; if R3 enforces the list, the round is forfeitable. Offers permitted alternatives (case attacks and packet DAs).
- Weak: generates them.
- Checks: FMT-6 restrictions are enforced.

**C-32 Reversed rebuttal order (UIL).** R2 variant. The team elects the 2A to give the 1AR and the 1A to give the 2AR.
- Task: estimate the 1AR.
- Strong: uses the 2A's rate profile for the 1AR, labels speakers correctly, and keeps the 1AR and 2AR content rules unchanged.
- Weak: uses the fixed 1A mapping.
- Checks: FMT-2; the estimate uses the 2A's profile.

**C-33 Using a CX concession.** R1. In CX of the 2NC, the 2N said "the States CP doesn't include federal cost controls." The 1AR draft uses this to extend 2AC #2 (solvency deficit: cost controls are key).
- Strong: allowed as support for an existing 2AC argument, cited as "CX of 2NC." The system does not claim it was "conceded in a speech."
- Weak: treats CX as already argued without raising it, or flags it as a new argument.
- Checks: the SEQ-4 link from the CX note to the 1AR unit; the relation is `extends` 2AC #2.

**C-34 Compliance gate in a live round.** The tournament profile is Glenbrooks 2026 (outside assistance means disqualification) or NCFCA. It is mid-round and the user asks for an AI-drafted 1AR.
- Strong: shows the rule text and blocks by default (per product policy), requires an explicit logged acknowledgment to proceed, and suggests non-generative tools (timer, flow, coverage view).
- Weak: silent generation.
- Checks: COMP-1 behavior and the audit log entry.

**C-35 Contradictory conditional negative positions.** R1, aff 2AC. The neg read the States CP (net benefit Federalism) and a Cap K whose link cards criticize state-based welfare as capitalist.
- Task: exploit it.
- Strong: labels this a "performative/argumentative contradiction" (info for the neg, opportunity for the aff); makes a short 2AC argument using the neg's own K links as reasons the CP fails or links to the K; notes that most judges treat condo contradictions as not a voter.
- Weak: builds the 2AC around "contradictions = vote aff," or misses the link interplay.
- Checks: CON-6 severity is info; the draft spends 20 seconds or less on theory.

---

## D. Cross-check against the current `src/domain` (commit 75f52ef)

These are observations only; I made no code changes.

1. **`detectConflicts` → `nonunique_undercuts_link_turn` is inverted.** Snider ch. 22, the Wikipedia straight-turn entry, and Cheshier all say non-UQ is required for a link turn to be offense, and conceding non-UQ does not neutralize a link turn. Replace it with Table K1:
   - impact turn plus {no link, won't happen, non-UQ} is a warning;
   - link turn plus {won't happen, no impact} is a warning;
   - link turn plus non-UQ is OK;
   - a link turn without non-UQ gets an EXT-3 reminder.
2. **`impact_defense_vs_impact_turn`** needs nuance. Defense that denies the event's occurrence (no link, won't happen, non-UQ) moots an impact turn. Defense that denies badness ("not that bad") does not ("If it is not bad, it can still be good"). Use typed roles instead of the regex.
3. **`SPEECHES[*].speaker` is constant.** UIL and Kansas allow reversed rebuttal order, and "insides" and Kansas 4-speaker exist (§1.3). Move the speaker to per-round data (FMT-2).
4. **The `hs-10-prep` description says "common at national-circuit HS tournaments."** The evidence is mixed: Glenbrooks 2026 uses 10, while Michigan 2025 and Barkley 2026 use 8 and Oregon JWI uses 5. Add a 5-minute preset and describe prep as tournament-specific.
5. **CX modes:** `DEFAULT_CX` is fine as the default. Add `open` and NDT `either-speaker` modes (FMT-3).
6. **`RATE_PRESETS`.** On a representative 1AC (2,000 highlighted words, 180 tag words, about 50 analytic words, 12 cards, default overheads), `fast` (310/220/215) implies about 285 wpm blended, near the elite-college median of 276. `very-fast` (370/250/240) implies about 339, above the elite 90th percentile of 318 (§10.1). Relabel `very-fast` as extreme or lower it, and anchor the labels to §10.3.
7. **Kicked positions still carry offense.** `possiblyKickedPositions` is right to report kicks, but a kicked position with unanswered aff turns remains live offense for the aff (Snider: "If you kick out of disadvantages with turns on them, you will lose"). The 1AR and 2AR option lists should surface it (ANS-1).
8. **Answer sets:** `speechesToAnswer` matches §A3's primary sets. Add the "live offense on kicked positions" option for the 1AR and 2AR, and the 2NR's constraint to block-extended positions (REB-4).

---

## Sources

All accessed 2026-09-25. "Read via" notes how I accessed each one: direct HTML or PDF extraction, the Google Docs text export, or the WebFetch summarizer. Where the summarizer disagreed with the primary text, I used the primary text. For example, it misreported the Batterman percentile table, which I read from the original image.

### Rules and official documents
| Source | What I used | Read via |
|---|---|---|
| [NSDA Topics](https://www.speechanddebate.org/topics/) | 2026–27 and 2025–26 policy resolutions | WebFetch |
| [NFHS: final two choices, 2025-10-23](https://nfhs.org/stories/health-insurance-nuclear-weapons-selected-as-final-choices-for-2026-27-national-policy-debate-topic) | Final-two wordings; Jan 10, 2026 announcement date | WebFetch |
| [NFHS: 2026–27 novice case list](https://nfhs.org/stories/2026-2027-policy-debate-novice-case-list-for-health-insurance-) | Three novice affirmatives | WebFetch |
| [NSDA HS Unified Manual 2026–27 (v2027.1.2)](https://docs.google.com/document/d/1hq7-DE6ls2ryVtOttxR4BNpRdP7xUbBr0M3SMYefek8/edit); [landing page](https://www.speechanddebate.org/high-school-unified-manual/) | Speech order and times, 8-minute prep, prompting, device and internet rules, evidence rules 7.1–7.5, casebook, Nationals AI rule, plan/evidence sharing | Google Docs text export, full text |
| [NSDA HS Unified Manual 2019–20](https://www.speechanddebate.org/wp-content/uploads/HS-Unified-Manual-2019-2020.pdf) | 5-minute policy prep at that time | PDF text |
| [NSDA Unified Manual 2022–23 (Tabroom copy)](https://s3.amazonaws.com/tabroom-files/tourns/24193/postings/32507/NSDAUnifiedManual.pdf) | 8-minute prep by 2022–23 | PDF text |
| [NSDA "Introduction to Policy Debate (CX)" (older, mirrored)](https://newmexicoforensicsclub.readthedocs.io/en/latest/_downloads/1b6df762f0296300f51332c7c57eecf4/nsda-policy-debate-description.pdf); [NSDA MS Policy Guide](https://www.speechanddebate.org/wp-content/uploads/MS-Policy-Guide.pdf) | 5-minute (older) vs 8-minute prep listings | PDF text |
| [NDT Standing Rules](https://nationaldebatetournament.org/about/standing-rules/) | 9-3-6, 10-minute cumulative prep, CX flexibility, tech time, misrepresentation examples, caselist disclosure | HTML text |
| [Glenbrooks 2026 invitation](https://docs.google.com/document/d/1uHSnEMEPZoZfeQ7xt4c6JbV1lD3imaAMJuCK0V5bKI8/edit) ([main page](https://glenbrooks.tabroom.com/)) | 8-3-5 with 10-minute prep, share.tabroom only, disclosure rule, outside-assistance DQ, ethics challenge procedure | Google Docs text export |
| [Michigan HS 2025 invitation](https://s3.amazonaws.com/tabroom-files/tourns/36458/postings/63319/2025UMHSTournamentInvite.pdf) | 8-minute prep; NDCA packet for novices; 2025–26 topic | PDF text |
| [Barkley Forum 2026 invitation](https://s3.amazonaws.com/tabroom-files/tourns/35556/postings/64996/BarkleyForumforHighSchools2026Invitation.pdf); [2025](https://s3.amazonaws.com/tabroom-files/tourns/31084/postings/56318/2025BarkleyForumInvitation.pdf) | 8-3-5 with 8-minute prep; share.tabroom encouraged; recording opponents allowed; AI rule | PDF text |
| [Lewis & Clark JWI 2026 invitation](https://s3.amazonaws.com/tabroom-files/tourns/38525/postings/66498/2026JWIInvitation.pdf) | 8-3-5 with 5-minute prep; internet only for evidence exchange | PDF text |
| [Omaha Westside 2025 invitation](https://s3.amazonaws.com/tabroom-files/tourns/34345/postings/58846/OmahaWestsideHighSchool_WarriorInvitational_2025_Finalwithtimezone.pdf) | NDCA novice case limits | PDF text |
| [KSHSAA 2026–27 manual](https://www.kshsaa.org/Publications/debatespeechdrama.pdf) | Kansas times, 8-minute prep, overage deduction, roadmap rule, rebuttal switch, 4-speaker division | PDF text |
| [MSHSAA 2026–27 manual](https://www.mshsaa.org/resources/Activities/SpeechAndDebate/Manual.pdf); [older timekeeper sheet](https://www.mshsaa.org/resources/pdf/DebateTimekeepingInst.pdf) | Missouri 8-3-5 with 8-minute prep; prep ends at file share; no evidence to judges unless requested; older 5-minute prep | PDF text |
| [UIL Section 1001 (district-hosted copy of UIL guide)](https://resources.finalsite.net/images/v1749319505/houstonisdorg/ouzyq04eqosj8h6yuv2l/cxrulesandprocedures.pdf) | Texas times, 8-minute prep, rebuttal reversal, closed CX, rapid delivery, no coaching or prompting | PDF text |
| [UHSAA 2026–27 handbook](https://www.uhsaa.org/Publications/Handbook/ActivitiesSections/SpeechDebate.pdf) | Utah 8-minute prep; novice closed deck; no theory or K until January | PDF text |
| [NCFCA speaking order](https://ncfca.org/rules/team-policy-speaking-order-and-times/); [NCFCA TP rules](https://ncfca.org/rules/team-policy-debate-event-rules/) | 8-3-5 with 5-minute prep; assigned CX; no in-and-out; device limits | HTML text |
| [Stoa event descriptions](https://www.stoausa.org/event-descriptions) | 75-minute rounds; current TP resolution | HTML text |
| [Tabroom Help: share.tabroom.com](https://docs.tabroom.com/settings/tabroom-share) | Auto doc chain, privacy, 24-hour retention | HTML text |

### Instructional
| Source | What I used | Read via |
|---|---|---|
| [Snider, *The Code of the Debater* (IDEA, 2008)](https://idebate.net/Publications/PDFs/The%20Code%20of%20the%20debater_%20introduction%20to%20policy%20debating%20-%20Alfred%20Snider.pdf) | Speech duties, prep caps, 2AC pacing, 1AR order, 2NR routes, DA/CP/K/T chapters, flowing, signposting, judge types, cross-application, and the ch. 22 kicking table | PDF text (full) |
| [Bellon, *Policy Debate Manual* v2.1 (2008)](https://files-backend.assets.thrillshare.com/documents/asset/uploaded_file/2699/Rmhs/595f4292-62ba-4696-b177-6029bdaa8bb2/AUDL-2k8-Policy-Debate-Manual-ver-1.1.pdf?disposition=inline) | Rebuttal standards, new-argument definition, 1NR/1AR/2NR/2AR advice, CP status, perms, K alternatives, judge information, offense/defense, glossary | PDF text |
| [NAUDL, *Guide for Novice Policy Debaters* (2019)](https://assets.urbandebate.org/wp-content/uploads/20190916152719/Guide-for-Novice-Policy-Debaters.pdf) | Speech purposes, CX roles and tag-teaming, flowing columns, rebuttal goals, extension definition | PDF text |
| [NAUDL *Theory Pentathlon* (2019)](https://assets.urbandebate.org/wp-content/uploads/20190916152520/Theory-Pentathlon-Document.pdf) | Condo, 50-state, PIC, agent, and consult theory blocks; "reject the argument, not the team" | PDF text |
| [Cheshier, "Giving Better 1ARs," *Rostrum* 2000](https://www.uvm.edu/~debate/NFL/rostrumlib/CheshierJan'00.pdf) | 1AR constraints, circle-the-best, grouping, perms, uniqueness with turns | PDF text |
| [Cheshier, "Extending Topicality Arguments," *Rostrum* 2002](https://www.uvm.edu/~debate/NFL/rostrumlib/cxCheshier0202.pdf) | T in 95% of 1NCs vs 5% of 2NRs; plan focus; line-by-line; 2NC as constructive | PDF text |
| [Cheshier, "25 Tips...Flowsheet," *Rostrum* 2000](https://www.uvm.edu/~debate/NFL/rostrumlib/CheshierNov00.pdf); ["How to Cut Prep Time Use," 2001](https://www.uvm.edu/~debate/NFL/rostrumlib/CheshierMar'01.pdf) | Flowing practices; prep ranges by region | PDF text |
| [Seeland, "Practical Refutation...1AR," *Rostrum*](https://www.uvm.edu/~debate/NFL/rostrumlib/SeelandJan'00.pdf) | 1AR contradictions; 2.5/2.5 split (traditional) | PDF text |
| [Snider, "Walk through of a policy debate" (UVM)](https://www.uvm.edu/~debate/walkthru.html) | Order and duties corroboration | WebFetch |
| Atlanta UDL curriculum: [Impact Comparison](https://www.atlantadebate.org/advanced-impact-comparison), [Giving the 1AR](https://www.atlantadebate.org/giving-the-1ar), [Giving the 2AC](https://www.atlantadebate.org/giving-the-2ac), [Types of CPs](https://www.atlantadebate.org/types-of-counterplans), [Kritiks](https://www.atlantadebate.org/coach-curric-kritiks), [Answering the K](https://www.atlantadebate.org/answering-the-kritik), [Debate Structure](https://www.atlantadebate.org/coach-curric-debate-structure), [Spreading](https://www.atlantadebate.org/spreading) | Overview structure, MR. T, event/structural/systemic impacts, 1AR and 2AC duties, CP types, K structure and answers, intro 4-2-2 format | HTML text |
| [Herbeck & Katsulas 1992 (ERIC ED354559)](https://files.eric.ed.gov/fulltext/ED354559.pdf) | Risk = probability × impact; critique of risk analysis | PDF text |
| [NDCA novice packet page](https://www.debatecoaches.org/resources/novice) | Packet and case-limit alignment | HTML text |

### Practitioner and community
| Source | What I used | Read via |
|---|---|---|
| [Batterman, "How Fast Do 'Fast' Debaters Speak?" (The 3NR, 2021)](https://the3nr.com/2021/05/04/how-fast-do-fast-debaters-speak-a-study/) | WPM percentiles (table image read directly), method, caveats, Colbert quotes, Verbatim chart critique | HTML plus image |
| [Southworth NDT final-round chart (WFU)](https://groups.wfu.edu/NDT/HistoricalLists/90schart.html) | Per-speech WPM and quotation counts, 1949–1990 | HTML table |
| [Batterman, "How To Never Clip Cards" (2014)](https://the3nr.com/2014/08/20/how-to-never-clip-cards-a-guide-for-debaters/) | Clipping definition, marking protocol, doc hygiene | HTML text |
| [The 3NR, "The DA does not turn the case" (2009)](https://the3nr.com/2009/12/03/answering-impact-calc-in-the-1ar-2-the-basics-the-da-does-not-turn-the-case/) | Turns the case, aff controls uniqueness, speed differential, try-or-die, 1AR seed to 2AR | HTML text |
| [Batterman, "Papka on Conditionality" (2021)](https://the3nr.com/2021/08/06/digging-into-the-debate-theory-archives-papka-on-excessive-conditionality-and-the-middle-ground-of-dispositionality/) | Condo norms history; contradiction exploitation | HTML text |
| [The 3NR, "Framework vs No Plan Aff" (2010)](https://the3nr.com/2010/03/29/throwdown-framework-vs-no-plan-aff/) | Planless-aff types and framework answers | HTML text |
| [Soper, "A Historical Defense of Judge Kick" (Debate Ravings, 2022)](https://debateravings.org/a-historical-defense-of-judge-kick/) | Judge kick definition, justification, critique, history | Internet Archive copy (live site DNS failed) |
| [DebateDrills: Tech and Truth (2021)](https://www.debatedrills.com/blog/tech-and-truth-how-judges-are-ruining-debate); [Conditionality numeric limit (2022)](https://www.debatedrills.com/blog/conditionality-a-numerical-limit); [Theory adaptation (2021)](https://www.debatedrills.com/blog/theory-debates-3-ways-to-adapt-to-your-policy-judge); [Final Speeches](https://www.debatedrills.com/policy/final-speeches) | Warrant requirement; embedded clash; condo; theory rarely a voter; don't split the 2NR | HTML text / WebFetch |
| [UIL 2026 CX State Judges](https://www.uiltexas.org/speech/cx-judges); [UIL 2018 booklet](https://www.uiltexas.org/files/academics/Edwards_UT_JudgeAdaptation_Paradigms2.pdf) | Structured paradigm fields; my statistics; quoted paradigm lines | HTML parse; PDF |
| [DebateUS terminology](https://debateus.org/policy-debate-terminology/); [basic structure](https://debateus.org/the-basic-structure-of-policy-debate-2/); [NHI topic index](https://debateus.org/policy-debate-arguments-national-health-insurance-topic/) | Definitions (overview, underview, roadmap, perm, kick, straight turn); structure; topic argument names (index only) | HTML text |
| [Paperless Debate Manual (Verbatim)](https://docs.paperlessdebate.com/verbatim/debating-paperless/paperless), plus [caselist](https://docs.paperlessdebate.com/verbatim/debating-paperless/caselist), [flow](https://docs.paperlessdebate.com/verbatim/debating-paperless/flow), [formatting](https://docs.paperlessdebate.com/verbatim/cutting-evidence/formatting), [tools](https://docs.paperlessdebate.com/verbatim/advanced/tools), [settings](https://docs.paperlessdebate.com/verbatim/advanced/settings) | Doc heading hierarchy, send-to-speech, stop-reading marker, share, invisibility mode, Stats and WPM setting, caselist upload, Excel flow | HTML text |
| [openCaselist README](https://github.com/ashtarcommunications/caselist); [API spec](https://api.opencaselist.com/v1/docs) | Architecture and data model (caselist, school, team, round, cites) | GitHub raw; JSON spec |
| [OpenCaselist dataset card](https://huggingface.co/datasets/Yusuf5/OpenCaselist) | tag/summary/spoken fields, pocket/hat/block, "A2/AT" | README raw |
| [SpeechDrop GitHub](https://github.com/yunyu/SpeechDrop); [DC UDL SpeechDrop sheet](https://urbandebatewashingtondc.org/wp-content/uploads/2023/02/SpeechDrop_InfoSheet.pdf) | Room-code sharing workflow | Raw / PDF |
| [Tabroom-hosted judge cheat sheet (2023–24)](https://s3.amazonaws.com/tabroom-files/tourns/27443/postings/49417/cheat_sheetpolicy2324.pdf) | CX must be restated; new evidence allowed in rebuttals | PDF text |
| [NSD Update, "Going for the Kritik" (2017, LD)](https://www.nsdebatecamp.com/nsdupdate/critical-problems-going-for-the-kritik) | K 2NR: one link, extend alt/ROB | WebFetch |
| [Eckstein, *Sounding Out!* (2012)](https://soundstudiesblog.com/2012/09/17/easy-listening-spreading-and-the-role-of-the-ear-in-debating/) | "Up to 400 wpm," 210-wpm comprehension claim | WebFetch |

### Tertiary and related research
| Source | What I used | Read via |
|---|---|---|
| Wikipedia: [Structure of policy debate](https://en.wikipedia.org/wiki/Structure_of_policy_debate), [Glossary](https://en.wikipedia.org/wiki/Glossary_of_policy_debate_terms), [Policy debate](https://en.wikipedia.org/wiki/Policy_debate), [Counterplan](https://en.wikipedia.org/wiki/Counterplan), [Topicality](https://en.wikipedia.org/wiki/Topicality_(policy_debate)), [Evidence](https://en.wikipedia.org/wiki/Evidence_(policy_debate)), [Flow](https://en.wikipedia.org/wiki/Flow_(policy_debate)), [Impact calculus](https://en.wikipedia.org/wiki/Impact_calculus), [Words per minute](https://en.wikipedia.org/wiki/Words_per_minute), [Spreading](https://en.wikipedia.org/wiki/Spreading_(debate)) | Corroboration: 2AR limits, 2NR norms, straight turn, drop caveats, perms and competition, T structure, calling for cards, backflowing, paradigms, WPM claims. Marked [Tert]; some articles contain low-quality passages I did not use | Raw wikitext |
| [Roush et al., "A superpersuasive autonomous policy debating system" (arXiv 2511.17854, 2025)](https://arxiv.org/abs/2511.17854) | Related AI system; evaluation by autonomous judge plus coach preferences (context for §C) | WebFetch (abstract) |
| [Kim et al., "Argument Collapse" (arXiv 2606.01736, 2026)](https://arxiv.org/abs/2606.01736) | LLM argument homogenization (65.3% unique human main arguments vs 3.4% LLM). Rubrics should reward specificity and clash | WebFetch (abstract) |

### Attempted but not accessible or not verified
- **TOC (University of Kentucky) policy procedures:** ci.uky.edu serves an anti-bot proof-of-work wall, which I did not bypass. The Tabroom TOC pages redirect to login. **TOC prep time is unverified.**
- **Tabroom judge paradigms and past tournament pages:** these redirect to login ("Please login to view paradigms!"). No specific Tabroom paradigm text is cited.
- **NFHS January 2026 announcement page:** HTTP 502. The resolution is confirmed via NSDA.
- **openev.debatecoaches.org:** connection failed. **openCaselist API** `/v1/openev`: HTTP 401 (requires Tabroom auth).
- **Wired (2012), "High School Debate at 350 WPM":** fetch blocked. Not used.
- **DebateUS topic essays:** paywalled; I used only the index titles.
- **Rebuttal length in Massachusetts and Colorado (claimed 8–4 on Wikipedia):** not verified.
- **"Link of omission" and "card doc":** definitions reflect common usage; I did not read an authoritative source.
