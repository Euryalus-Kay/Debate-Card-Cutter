# Writing analytics and blocks: format, style, content, and measurements from real camp files

*Research record, 2026-09-25. Written by a research agent from the sources listed at the end (all opened on that date unless noted); reviewed and adopted into Clash's rules (see docs/PROJECT_RECORD.md). Quotes are limited to short lines; everything else is paraphrased with its source.*

I've finished both parts. Some caveats first:

- **Camp lecture notes:** I couldn't find DDI, Michigan, Georgetown, Berkeley/BDL, Harvard, Emory, CNDI, UTNIF, SDI or Gonzaga lecture notes as text online. What exists is institute pages and YouTube videos.
- **Search budget:** the session ran out of web searches (200 of 200) partway through. After that I only fetched URLs I already had.
- **Quotes:** direct quotes are kept to one short NSDA line; everything else is paraphrased with its source.

Labels: **[R]** = rule or software convention; **[W]** = widely taught (two or more independent sources agree); **[C]** = one coach's view; **[M]** = measured in your files. Source numbers [S#] refer to the list in section 8.

## 0. Corpus and method (Part B)

- **Files:** 20 unique debate .docx files in ~/Downloads.
  - 23 names matched your patterns. I dropped 3 "(1)" copies that were byte-identical to their originals.
  - The two "Walk Hyde Park" files matched the "K - " pattern by accident ("Park - "). I excluded them and opened no other personal files.
- **Groups:** aff (3 1ACs and 4 "Aff -" files), neg (Case Neg, Neg - AI Inventors, Blockchain Neg Michigan, Innovation Bad), K (8 files), T (the NDCA Novice packet).
- **Parsing:** read-only inline scripts using the repo's parser: `/Users/zainzaidi/Projects/Debate-Card-Cutter/src/server/ingest/docx.ts`, `structure.ts` and `xml.ts`. I ran them with the tsx cache turned off and printed only counts and 2–3-word openings.
- **Totals:** 1,206 cards; 368 tagged analytics; 696 headings with content. I excluded 135 loose paragraphs that had no tag (file notes and the like).

Caveats on the corpus:
- **Concentration:** two DDI aff files hold 73% of all analytics (Blockchain 194, Semiconductors 75).
- **Camp files are mostly evidence.** Most analytics get written in-round, so 1AR and 2NC blocks here are about 90% cards only.
- **Not arguments:** 8% of the "analytics" are structural, such as plan or CP texts and "Scenario 1" labels.
- **Parser gap:** Word's automatic list numbering isn't in the parser's text. I checked the document XML separately and found it on only 3% of analytics.
- **Missing styles:** Case Neg – Blockchain has no heading styles. I set its heading levels in memory from Verbatim's font sizes (26/22/16/13 pt).
- **Possible misreads:** the parser counts untagged text as "analytic" and counts a tag followed by underlined explanation as a card with no cite. I corrected for both.

## 1. How to write a single analytic

1. **Anatomy [W].** An analytic is an argument with no evidence [S39]. NSDA's model 2AC answer has three parts [S1, p.56]:
   - It should "Begin with a one or two word DESCRIPTIVE IDENTIFIER" such as No Link, We Meet, Non-Unique, Turn or Perm.
   - Then a one- or two-sentence tag.
   - For an analytic or theory argument, a short explanation of how it wins the issue and changes the round.
   - [M] Your files match: when an analytic has a short label before a colon or dash, the label is 2 words at the median (90th percentile 4 words).
2. **Claim, warrant, implication [W].** NSDA teaches claim–warrant–proof and five ways to clash: deny, challenge relevance, attack the warrant, attack the evidence, or turn [S1, pp.7–8].
   - The four-step version is "they say / but / because / therefore" [S46]. Pitt's labels are signal / state / support / summarize [S47].
   - AUDL's DR. MO adds Deny, Reverse, Minimize and Outweigh. Minimize and Outweigh are the "even if" moves [S14].
   - For attacking a card, use AUDL's ABCD: Author, Basis, Context, Date [S15].
3. **Aim at their warrant, not their tag [W].**
   - Phillips: brainstorm what the other side will actually say, and give each distinct attack its own answer [S24]. Teams that read the same cards whatever the other side says are merely good, not great [S32].
   - An analytic that forces the other team to read a card just to get back to even is a decent one [S36] [C].
   - Berube (a CEDA/CAD essay) says long low-probability causal chains are often built by the debater, not the authors. That is the basis for "each step lowers the risk" analytics [S7].
4. **"Even if" layers [W].** Say which argument you win outright, then why you still win if you lose it [S14, S2]. Cheshier also advises turning defensive fights into offensive voting issues [S4].
5. **One idea per numbered point; signpost [W].** NSDA's eight steps are:
   - identify the argument you're answering;
   - say how many answers are coming;
   - label each one;
   - explain it;
   - give source and date;
   - read the card;
   - say why it beats their argument;
   - move on [S1, p.8].
   - AUDL: answer in the order they made their arguments, using their numbers ("answering 1NC 2") [S13].
   - Hanson: judges rebuild the debate from short cues, so labels and decision rules steer the decision [S5].
6. **Length and word economy.**
   - Coach thresholds [C]: an argument needs at least 10 words [S31]. Analytics under 25 words can't be flowed [S23].
   - Cheshier warns against both over-explaining and dropping explanation altogether. One clear explanation early can save time later [S4].
   - [M] Your files: analytic tags have a median of 12 words (10th percentile 3, 90th 31) and 1 sentence (mean 1.4). 22% are 4 words or fewer, mostly perms and labels. Only 4% have extra explanation paragraphs; the explanation lives in the tag itself.
7. **Formatting [R].**
   - Verbatim levels: Pocket = Heading 1, Hat = Heading 2, Block = Heading 3, Tag = Heading 4 (already recorded in the repo's research docs).
   - Verbatim deliberately has no "Analytic" style. Analytics use the Tag style and should stay in the shared speech doc; the manual calls removing them anti-competitive [S38].
   - [M] 96% of your analytics start with a capital; 56% end with a period; only 7% are in Title Case.

## 2. Standard analytics by argument type

**Disadvantage answers (2AC)** [W: S12, S45, S1]
- The standard set: non-unique, no link, link turn (paired with non-unique), impact turn, no internal link / no brink / no threshold / no timeframe, and "case outweighs."
- Never read a link turn and an impact turn on the same DA (a double turn) [S12, S45].
- A straight turn (turns only, no defense) forces the neg to answer it [S12].
- [C] Phillips: organize answers in modules (uniqueness, link defense, link offense, impact defense, impact offense), put the best first, and treat piles of impact defense as usually weak [S26].
- Cheshier: when extending a turn in the 1AR, also extend the uniqueness answer that makes it offense [S4].

**Disadvantage blocks (2NC/1NR)**
- Give an overview, then answer every numbered 2AC argument [S1, S17].
- The block must answer 2AC turns and theory, including on positions it drops, or the 1AR can win on them [S1, pp.59–62] [W].
- Plant impact calculus in the 2NC (15–20 seconds) and repeat it in the 1NR [S41] [C].

**Counterplans**
- AUDL's STOP: Solvency deficits, Theory, Offense (DAs to the CP, "CP links to the net benefit"), Permutations [S10] [W].
- **Perms [W: S3, S10, S44]:**
  - A perm is a test of competition, a thought experiment, not a new plan [S3].
  - The main types: do both; do the CP; the whole plan plus part of the CP.
  - Cheshier lists "intrinsic" perms (adding something from outside the CP) and perms that drop part of the plan (severance) as widely rejected. Timeframe perms are contested [S3].
  - Explain every perm: say why doing both avoids the net benefit [S10, S44].
  - The neg's standard answers: the perm links to the net benefit, the two are mutually exclusive, or the perm severs [S44].
- **Solvency deficits [C]:** name the internal link the CP misses, why it matters, and how much risk is left [S31].
- **Theory [W: S9, S40]:**
  - Conditionality, PICs, agent CPs, 50-state fiat and consult CPs.
  - The neg's usual defaults are "reject the argument, not the team" and a counter-interpretation (one conditional CP, or dispositionality).
  - [M] 73% of your blocks that contain a perm lead with it. "Do both" is the most common perm, then "do the CP". Common formats: "1---Perm…" (15), bare "Perm…" (10), "1. Perm…" (7).

**Kritiks**
- F-POSTAL order: Framework, Perm, Offense (link turn or impact turn, not both), Solvency deficit, Theory (e.g., vague alts), Alt defense, Link defense [S37] [C]. AUDL covers the same categories [S11] [W].
- Phillips: answer "ontology first" and "ontology outweighs" separately [S33]. Split K blocks into finer subtypes rather than one generic "link block" [S32] [C].
- Cheshier: keep a perm alive in the 1AR [S4].
- Caldwell's older "reasons to reject a kritik" list shows the traditional/lay-circuit approach [S6] [C].
- [M] K-file analytics are longer (median 20 words, 90th percentile 64). They refer to the opponent more (59%) and say "we/our" more (41%).

**Topicality**
- Neg shell: interpretation, violation, standards, voters, in an A/B/C/D outline [S1, p.53; S21] [W].
- 2AC: we meet, counter-interpretation, reasonability, and counter-standards (field context, aff predictability). Put T first in the 2AC, 1AR and 2AR [S20] [W].
- [C] Phillips' minimum is a counter-interpretation, two offensive reasons, defense against each neg standard, and reasonability. Don't claim "we meet" when you plainly don't [S27].
- [M] In the NDCA T packet, 96% of analytics are numbered or lettered. Common openings: "They overlimit…", "Prefer reasonability…", "Predictability –…".

**Theory, short shell vs. long shell**
- **Short shell** (the 2AC's condo bad): 4–7 numbered points, each a bold label, a dash and one sentence, ending with the voter. NAUDL drills give the 2AC block 30 seconds and the 1AR 40 [S9] [W].
- **Long shell:** interpretation, violation, standards with their impacts, voters, and pre-empts (reasonability vs. competing interpretations, drop the debater vs. drop the argument) [S40] [W].
- 1AR theory runs about one minute (roughly 200–250 words): your offense, why it's a voting issue, and answers to the neg. Use embedded clash, meaning each answer starts by naming the argument it answers [S30] [C].

**Case**
- Against specific defense, just saying "extend the 1AC card" leaves the advantage at zero risk [S31] [C].
- The block must answer every case argument [S13] [W].

**Impact calculus and overviews [W]**
- Compare magnitude, probability (risk) and timeframe (AUDL's MR. T), and look at how the impacts interact [S16]. Add reversibility, a standard extra dimension.
- Cheshier: keep rebuttal overviews short and make them about comparing impacts. Put short overviews at the top of each position rather than one big one. Avoid the "seven reasons why" opener [S2].
- An overview has 2–3 parts: story, optional turn, impact comparison [S16]. A K 2NC needs an overview, link, impact, framework, alt and "AT: Perm" sections [S23] [C].

## 3. Block and frontline format

- **Block titles [M]:**
  - "AT:" is the dominant prefix: 126 of 169 answer-block headings.
  - Others: "Answers to" (13, only in the NDCA novice file), "AT" with no colon (12), "--AT:" (10), speech label + "AT:" (5). "A2" appears only 2 times.
  - About half of block (Heading 3) titles carry a speech label: 2AC 117, 1NC 99, 2NC 90, 1AR 32, 1AC 16. None use 1NR, 2NR or 2AR.
  - Placement: label at the start 183 times vs. at the end 159 (hat and block levels combined). The separator after a leading label is "---" (96) or " – " (54).
- **Pairing [M]:**
  - Within a hat, a 2AC block always comes before its 1AR block (12 of 12). A 1NC shell always comes before its 2NC/1NR blocks (15 of 15).
  - Common patterns inside a hat: a 2AC block alone (22), AT blocks alone (18), 1NC then 2NC (8), 2AC then 1AR (6), 2AC then AT blocks (5).
- **Answers per block:**
  - NAUDL: 2–3 arguments per opposing argument, some analytic, some carded [S8] [W].
  - NSDA: the 2AC needs breadth (every position) and depth (more than one to three answers each) [S1] [W].
  - Phillips: at most 3 cards per heading [S25]. A 1AR block is "AT: X", a few sentences and one card [S24] [C].
  - [M] Answer ("AT") blocks hold a median of 2 items (90th percentile 4). Those that include analytics hold 3 (analytics median 2).
  - [M] 2AC blocks containing analytics hold a median of 5 items (90th percentile 9), 3 of them analytics. 78% start with an analytic.
- **Mix of cards and analytics [M]:**

  | Files | Cards only | Mixed | Analytics only |
  |---|---|---|---|
  | All | 80% | 14% | 6% |
  | Aff | 63% | 22% | 15% |
  | Neg | 94% | 6% | 0% |
  | K | 92% | 7% | 1% |
  | T | 53% | 47% | 0% |

  - In mixed blocks, 159 analytics come before the first card, 52 between cards and 59 after the last card.
- **Ordering:** best argument first [S25, S26] [C]; offense first in line-by-line [S13] [W]; T first [S20] [W]. [M] Perms sit first in their blocks (median position 0); turns sit mid-block.
- **Numbering [M]:**
  - 56% of analytics carry a typed number or letter, vs. 9% of card tags (aff 63%, T 96%, neg 0%, K 6%).
  - This is file-specific: DDI Blockchain uses "1---" and "A---"; DDI Semiconductors and the NDCA T packet use "1." and "a.".
- **Length and time [M]:** these count spoken words (analytic words + tag words + 2 per cite + highlighted card words), using only blocks whose cards are all highlighted:

  | Block type | Median words (10th–90th) |
  |---|---|
  | All | 149 (49–453) |
  | AT blocks | 123 (41–309) |
  | 2AC | 142 |
  | 1AR | 98 |
  | 2NC | 167 |

  - Analytics-only blocks: a median of 1 analytic, about 20 tag words (90th percentile 66).
  - At a fast 250 words per minute, an AT block is about 30 seconds; at a lay pace of 150, about 50 seconds. These are estimates.
- **Extensions:**
  - Name it, summarize the warrant, give the implication [S43] [C].
  - Deny their answer and say why yours is better (Snider, in the repo's research docs) [W].
  - 1AR: extend the 2–3 best answers per position. Group T violations with 6–10 global arguments. Overgrouping makes you blippy and "tagline-only" [S4] [W].
  - Extend without over-explaining: just enough that the 2AR can credibly go for it [S30] [C].
  - A "they dropped it" claim needs a warrant (the repo's research docs already have a rule for this, COV-5).
- **Setting up the next speech:** blocks should prepare the 2AR [S4, S30]. Split the block so the 1NR takes the prep-heavy positions [S34]. Don't repeat your partner's coverage [S1, p.58].

## 4. Style, judge adaptation, and common mistakes

- **Tech judges:** jargon is fine and short decision statements work. **Lay judges:** plain language, reasons stated, a big-picture summary [S18, S49] [W].
- Lay extensions should drop "card" talk [S43]. Inexperienced judges often don't flow the overview [S2].
- Analytics are legitimate reasoning; a card isn't automatically better [S48] [C, LD].
- **Mistakes coaches flag:**
  - extensions that only repeat the tag [S4, S24];
  - one generic block used no matter what they said [S32];
  - double turns [S12];
  - perms with no explanation [S10];
  - long overviews [S2];
  - false "we meet" claims [S27];
  - leaving 2AC theory or turns unanswered in the block [S1];
  - strings of claims joined by hyphens with no warrant [S24];
  - impact-defense dumps [S26];
  - putting case before T [S28];
  - running theory without checking the judge [S28].

## 5. Templates (placeholders only)

```
ANALYTIC (tech): [n]. [Label, 1–4 words] – [claim aimed at their warrant] because [reason]; so [consequence for this flow/ballot].
ANALYTIC (lay):  [Plain claim]. [Everyday reason]. [Why this decides the issue].
DA 2AC:  1. Non-unique – [indicator] already [state], so [impact] happens/doesn't regardless.  2. No link – the plan only [mechanism]; their link assumes [other action].
         3. Link turn – the plan [raises Y] → [helps internal link] (pair with #1; no impact turn).  4. No internal link – [A] doesn't cause [B]; each extra step lowers risk.
         5. Case outweighs – [our impact] is faster/larger/likelier because [reason].
CP 2AC:  1. Perm: do both – whole plan + [CP part]; avoids [net benefit] because [why].  2. Perm: do the CP – [why the CP is a way to do the plan].
         3. Solvency deficit – CP can't [internal link] because [reason]; that's what stops [impact].  4. CP links to the net benefit – [why].
         5. [Practice] bad – [standard] – [one sentence]; [standard] – [one sentence]; reject the [team/argument].
T 2AC:   We meet – [plan text meets their interpretation because …] (only if true) | Counter-interpretation – [text + source] | [2 offense reasons] | [defense to limits/ground] | Reasonability – [threshold].
K 2AC:   Framework – weigh the plan against the alt | Perm – do both; [why the plan doesn't rule out the alt] | Link turn – [specific] | Alt fails – [why] | Case outweighs / impact turn (pick one line of offense).
EXTEND:  Extend [author/2AC #] – [warrant]. Their [#/author] misses [flaw]. That means [flow consequence]. Even if [their best point], [why we still win].
IMPACT CALC: [Our impact] outweighs [theirs] on [dimension] because [reason] and [dimension] because [reason]; even if [their comparison], [why ours controls].
FILE: H1 [Position] > H2 [2AC – Position] > H3 [2AC – AT: Position] then [1AR – AT: 2NC argument] > H4 numbered tags (analytics) and tag + cite + card.
```

## 6. Other measurements

- **Analytics per file** (median 4.5, mean 18):

  | Analytics | Files |
  |---|---|
  | 194 | Aff – Blockchain (DDI) |
  | 75 | Aff – Semiconductors (DDI) |
  | 25 | T NDCA packet |
  | 14 | Case Neg – Blockchain |
  | 12 | Security K |
  | 7 each | 1AC Arctic Microbes; SetCol K 25-26 |
  | 5 each | 1AC.docx; Cap K NDCA; Neg – AI Inventors |
  | 4 each | Blockchain Neg Michigan; Cap K Harvard |
  | 3 | Settler Colonialism Kritik |
  | 2 each | 1AC Space; Aff – AI Inventors; Aff – Racial Scripts |
  | 1 each | Innovation Bad; SetCol Harvard |
  | 0 each | Abolition K; SetCol CNDI |

- **Analytics per block** (blocks with at least one analytic): median 2, 90th percentile 5. By group: aff 2 (90th percentile 6), T 3, neg 1, K 1.
- **Analytics as a share of all items:** aff 34%, T 42%, K 9%, neg 8%.
- **Analytic tag length (median words):** aff 11, neg 10, K 20, T 20. Card tags: overall 12; aff 11, neg 10, K 20, T 10.
- **Length buckets:** 4 words or fewer 22%; 5–12 29%; 13–25 28%; 26–40 17%; over 40 4%.
- **Opening words (tagged analytics):**
  - Two words: "perm do" 23, "they overlimit" 6, "prefer reasonability" 6, "scenario one/two" 4+4, "alt fails" 3, "link turn" 3, "link non-unique" 3, "aff solves" 3, "can't solve" 3, "topic education" 3.
  - Three words: "perm do the" 10, "perm do both" 9.
  - "Extend" is rare (1%): camp files hold frontlines, not in-round extensions.
- **Word signals** (share of analytics containing each):
  - they/their/the aff/speech names 31%;
  - we/our 11%;
  - because/since 5%;
  - means/so/therefore 10%;
  - "even if" 1%;
  - "prefer" 3%.
  - Explicit warrant words are rare; files rely on a label–dash–claim shape instead (27% of analytics).
- **Cards:** 62% are highlighted. Highlighted cards have a median of 77 highlighted words; full card text has a median of 581.

## 7. Automatic checks for generated analytics and blocks

1. Each analytic is one Heading 4 tag: a label of 4 words or fewer, a separator, then 1–2 sentences. Flag fewer than 8 words (except a perm label that has an explanation) or more than 45.
2. It contains a warrant marker (because / since / means / so / →) or a stated mechanism.
3. It shares a content word, author name or number with the argument it answers.
4. One claim per point: flag 3+ sentences, or a turn and a defensive answer in the same point.
5. Numbering runs consecutively in one style ("1." or "1---"), with no duplicates.
6. The block title matches a pattern such as `[speech] – AT: [position]`, and the position matches the opponent's flow name.
7. Answer counts: 2AC AT blocks 3–8; 1AR blocks 2–4 plus at most one card; 2NC/1NR blocks cover every 2AC number.
8. No double turns: link turn plus impact turn on the same DA or K.
9. Every link turn comes with a uniqueness answer.
10. Perms include the whole plan (otherwise flag as severance), give an explanation, and come first in CP blocks.
11. Theory shells: the short one has an interpretation or counter-interpretation, at least 2 standards and a voter; the long one adds a violation and the impact of each standard.
12. T answers include we meet (only if the plan text satisfies their interpretation), counter-interpretation, reasonability, and defense against each standard.
13. K frontlines touch framework, perm, a link answer, alt fails, and one line of offense.
14. Extensions have author or number, warrant and implication. Reject tag-only "extend X" under 10 words. Allow "they dropped" only when verified.
15. Impact calculus uses at least 2 dimensions and names the opponent's impact.
16. Overviews stay under about 20 seconds (2NR/2AR excepted) and aren't repeated in the line-by-line.
17. Estimated time at the judge's speaking rate fits the block budget (an AT block is about 30 seconds for a tech judge).
18. Strip filler and hedges ("I'd like to," "basically," "it is important to note").
19. For lay judges: flag jargon, require plain-language warrants, and allow at most 2 answers per argument.
20. No quoted text or author-year cites inside analytics unless the card is in the doc; label any paraphrase as an analytic.
21. No contradictions across blocks, e.g., a no-link answer that clashes with an advantage's own claim.
22. Answers follow the opponent's order; T comes first.
23. Every 2AC block has a paired 1AR/AT block; neg blocks answer turns and theory on positions they drop.
24. Formatting: Tag style, no separate "Analytic" style, analytics kept in the shared doc.

## 8. Sources

- S1 NSDA, Smelko & Smelko, *Debate 101* (2013): https://www.speechanddebate.org/wp-content/uploads/Policy-Debate-Textbook-2.pdf
- S2 Cheshier, Rostrum 6/1999: https://www.uvm.edu/~debate/NFL/rostrumlib/CheshierJune99.pdf
- S3 Cheshier, Rostrum 4/2000: https://www.uvm.edu/~debate/NFL/rostrumlib/CheshierApr'00.pdf
- S4 Cheshier, Rostrum 1/2000: https://www.uvm.edu/~debate/NFL/rostrumlib/CheshierJan'00.pdf
- S5 Hanson, Rostrum 5/1999: https://www.uvm.edu/~debate/NFL/rostrumlib/HansonMay99.pdf
- S6 Caldwell, Rostrum 5/2001: https://www.uvm.edu/~debate/NFL/rostrumlib/KritikMay%2701.pdf
- S7 Berube, CAD essay in *Perspectives in Controversy* (IDEA/CEDA 2002): https://idebate.net/Publications/PDFs/Perspectives%20in%20Controversy_%20Selected%20Essays%20from%20Contemporary%20Argumentation%20&%20Debate%20-%20Kenneth%20Broda-Bahm.pdf
- S8 NAUDL Block Writing Workshop: https://assets.urbandebate.org/wp-content/uploads/20190916152608/U2.Lesson-6-Block-Writing-Workshop-1.pdf
- S9 NAUDL Theory Pentathlon: https://assets.urbandebate.org/wp-content/uploads/20190916152520/Theory-Pentathlon-Document.pdf
- S10–S19 AUDL (atlantadebate.org), in order: /answering-the-counterplan, /answering-the-kritik, /turns-hs-jv, /linebyline-hs-jv, /responding-to-arguments-drmo, /coach-curric-evidence-comparison-abcd, /advanced-impact-comparison, /speech-checklist-hs-varsity, /coach-curric-judge-adaptation, /giving-the-2ac
- S20 DebateUS: https://debateus.org/2ac-answering-topicality/
- S21 DebateUS: https://debateus.org/debating-topicality/
- S22 DebateUS: https://debateus.org/policy-debate-vocabulary/
- S23–S29 Phillips, HS Impact (hsimpact.wordpress.com): /2019/04/12/how-to-write-a-good-block/, /2018/09/25/write-blocks-not-scripts/, /2017/06/16/improving-over-the-summer-3-organization-and-backfiles/, /2020/01/15/2ac-tips/, /2017/11/29/better-2ac-topicality-1/, /2015/12/02/who-wants-more-points-for-their-2ac/, /2018/10/30/some-notes-on-conditionality-bad/
- S30–S33 Phillips, The 3NR (the3nr.com): /2010/11/08/1ar-blocks/, /2010/09/23/debating-the-case-in-the-2ac/, /2010/04/07/security-k-blocks/, /2009/10/28/2ac-blocks-k-trump-cards/
- S34 Levkovitz, The 3NR: https://the3nr.com/2009/11/11/maximizing-the-1nrs-potential/
- S35–S37 Learn Policy Debate (learnpolicydebate.wordpress.com): /2012/09/26/tips-for-writing-2ac-blocks/, /2015/09/24/making-better-analytics-for-policy-debate/, /2013/11/23/the-way-to-answer-a-critique-in-the-2ac-the-fipostal-model/
- S38 Verbatim FAQ: https://docs.paperlessdebate.com/verbatim/faq
- S39 NSD glossary: https://www.nsdebatecamp.com/glossary/analytic (also /block, /overview)
- S40 Forensic Funnel: https://theforensicfunnel.com/p/the-theory-debate-toolbox
- S41 Durland, Ethos: https://www.ethosdebate.com/9523-2/
- S42 Hu, Ethos: https://www.ethosdebate.com/crash-course-guide-better-rebuttals-part-2/ (also consulted, not cited above)
- S43 Datel: https://permdoboth.weebly.com/extending-arguments.html
- S44 Arvanitis & Meacham: https://sites.google.com/view/policydebateforeveryone/strategy/counterplans/permutations
- S45 K-State: https://www.k-state.edu/debate/virtualroom/DaAnswers.htm
- S46 LibreTexts, Imperial Valley College: https://socialsci.libretexts.org/Courses/Imperial_Valley_College/Introduction_to_Oral_Argumentation_and_Debate/04:_ClashThe_Art_of_Refutation_and_Rebuttal
- S47 Pitt Communication: https://www.comm.pitt.edu/four-step-refutation
- S48 Engel, DebateDrills: https://www.debatedrills.com/blog/too-much-evidence
- S49 Silvian: https://www.debateresource.com/post/how-to-write-blocks
- Also used: the repo's existing research doc, `/Users/zainzaidi/Projects/Debate-Card-Cutter/docs/research/debate-domain.md` (Snider/Bellon material and the COV-5 rule).

**Couldn't access:**
- Tabroom judge paradigms (login required).
- The DebateUS 2AR page (paywalled).
- vbriefly.com, "Dropped arguments are not true arguments" (domain no longer resolves).
- openev.debatecoaches.org (DNS failure).
- The CAD article page on cedadebate.org (404).
- The ESU refutation PDF (certificate error).
- Camp lecture notes (none found as text).
- Gonzaga, Michigan and Solt theory PDFs (search budget ran out before I could look).
