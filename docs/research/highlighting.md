# Highlighting Evidence Cards: Research for the AI Highlighter

**Research date:** 2026-09-25
**Scope:** How competitive high school and college **policy** debaters highlight evidence cards, which choices make highlighting good or bad, what the rules say, and what an AI highlighter should be required to do. The AI picks exact phrases to highlight and code enforces verbatim text.
**Companion docs (not modified):** `evidence-formatting.md` §6–7 covers DOCX encoding and an earlier pass at highlighting practice. `debate-domain.md` §10 covers speaking rates. This document goes deeper on highlighting itself and adds new measurements.

**How to read the tags.**
- `[S#]` is a web source in §7. Every one was opened on the research date.
- `[D1]` and `[D2]` are my own measurements on real cards (method in §2.1).
- The labels **Rule**, **Measured**, **Practitioner**, and **Lore** say what kind of evidence stands behind a claim:
  - **Rule**: written into a governing rulebook.
  - **Measured**: counted from data.
  - **Practitioner**: published advice from coaches or camps.
  - **Lore**: widely repeated, but I found no authoritative write-up.

---

## Executive summary: rules for an AI highlighter

1. **Whole words only.** Every highlight starts and ends on a word boundary, so there are no partial words ("prolif", or "state" cut out of "interstate"). Excluding trailing punctuation and footnote numerals is fine. *Test:* no highlight boundary falls inside an alphanumeric token. [S1][S2] [D2: 1.5% of real highlighted tokens are partial words, and 47% of real cards have at least one. A few remove a negation inside a word, e.g. "cannot" read as "can".]
2. **The read text must be grammatical.** Read in order, each read sentence needs a subject and a finite verb (subject, verb and object where there is an object). *Test:* a POS tagger or LLM finds a finite verb in each read sentence. No read sentence may end on an article, preposition or conjunction. No skip may create an a/an agreement error. [S1][S19][S22] [D2: only 0.6% of real fragments dangle at the end of a read sentence]
3. **Read the claim and a warrant.** The read text must carry the tag's claim plus at least one reason, mechanism, or data point. *Test:* at least two read clauses, one of them with a causal or evidential marker or a number, or an LLM judge confirms that a warrant is present. [S2][S18][S19]
4. **Never flip polarity.** If a read word is governed by a negator (not, no, never, n't, cannot, without, nor), read the negator too. *Allowed:* skipping "not only/merely … but also", skipping the rejected half of "X, not Y" or "not X but Y", and skipping a negated clause entirely. *Test:* a negation-head check. This is a hard error. [S5][S6][S4][S20] [D2: reversals by highlighting are rare, about 0.3–0.6% of cards, but they happen]
5. **Never raise certainty or scope.** If a read word is governed by a hedge, modal, quantifier or bound (may, might, could, likely, perhaps, appears to, some, most, often, as much as, up to, at least, roughly), read that word too. *Test:* a hedge-scope check. This is an error in AI output. [S3][S4] [D2: real highlighters drop such hedges in 17% of cards and quantifiers in 18%. About 9 in 10 of the flagged hedge drops, and about 3 in 4 of the quantifier drops, raised certainty or scope. The AI is deliberately stricter than common practice.]
6. **No straw men.** Never read a view the author reports only to reject it as if it were the author's own. If you read it, also read the attribution ("critics argue") and the author's rebuttal. *Test:* an attribution-frame check plus an LLM "does the author endorse this?" check. [S5][S7][S3][S26]
7. **Don't stop just before a reversal.** An unread "but / however / although" clause that limits a read clause either gets read or triggers a tag warning. [S3]
8. **Splice only faithfully.** Read text may skip between sentences only in order and only inside one paragraph. The subject of one sentence may join the predicate of the next only when the skipped words are a pronoun whose antecedent is the read subject. *Test:* a cross-sentence splice check plus an LLM faithfulness check. [S22]
9. **Keep fragments at a sane size.** Aim for no more than about 30 fragments per 100 highlighted words and for 1-word fragments to be no more than about 35% of a card's fragments. Single words are fine for names, numbers and glue words. [S1] [D2 medians: 21.8 fragments per 100 highlighted words; 21% of a card's fragments are single words; p90 of that share is 41%]
10. **Budget by speech.** The default full version should read about 10–25% of the card body, which is roughly 50–110 words. A rebuttal ("short") layer is a subset, typically half to two-thirds as long. Show read time at 260–320 wpm. [S16] [D2 medians: highlighted words 1AC 88, 1NC 74, 2AC 64, 1AR 57; highlight ratio about 14% in every speech]
11. **Stay inside the underlining** when a card has it. [D1: 99.7% of real highlighted tokens are underlined; D2: 98.9%]
12. **Use layers, not colors.** Produce a full highlight layer and an optional short layer that is a strict subset. Each layer must pass rules 1–8 on its own. Export one color per version, or duplicate the card. [S1][S10][S17]
13. **Numbers travel with their frame.** When a number is read, also read its unit, bound ("as much as"), baseline ("from 52") and scope ("in a pilot at two ports"). [S2][S3]
14. **Write for the adversary.** Judges evaluate what was read, and opponents cross-examine and "rehighlight" the unread text. The read text alone must support the tag. *Test:* an LLM judge compares the tag with the read text, not with the full text. [S11][S21][S25][S18]

---

## 1. What makes highlighting good or bad (Q1)

### 1.1 The standard: the shortest read text that stays faithful and readable

- **Definition of the task.**
  - Only highlighted text is read aloud. Highlighting aims at the "shortest possible version while not compromising on the warrants" [S2]. **Practitioner.**
  - The OpenDebateEvidence paper describes the same layering: underlined, bolded or boxed text carries the argument, and "highlighted sections are read aloud during the speech" [S15]. DebateSum treats underlining and highlighting as word-level extractive summaries of the evidence [S14]. **Measured/descriptive.**
- **Readability standard: sentences, not keywords.**
  - Batterman's clipping guide tells debaters to "Underline and highlight complete sentences." [S1]
  - He criticizes three habits: sentence fragments; abbreviations (he cites "c m r" for civil-military relations and "prolif" for proliferation); and highlighting a string of warrant words in place of a subject, verb and object [S1].
  - His mechanism: while the eye hunts for the next fragment, the brain tries to make sense of the text, so the speaker adds, drops or changes words. Very long cards with very sparse highlighting are the ones most likely to be clipped [S1].
  - His recommended test is to read the card aloud, or toggle Verbatim's Invisibility Mode. If the result is hard to read, re-highlight [S1][S11]. **Practitioner.**
- **Fragments without warrants.**
  - One camp guide says cards highlighted down to sentence fragments, or left without warrants, are worthless. Its rule of thumb: "a card should be 3-4 warranted sentences" [S19]. **Practitioner** (the guide is LD-oriented).
  - Another guide says the highlighted portion should still flow as a sentence when read aloud [S22]. **Practitioner.**
- **Judges notice.** Batterman reports that judges commonly criticize shallow highlighting and factor it into decisions [S1]. **Practitioner.**
  - Confidence is moderate. Tabroom judge paradigms, the main public record of judge preferences, were login-walled when I checked (§7.3). I could not verify individual paradigms.

**Reality check [D1][D2]: "complete sentences" is an ideal, not the norm.**

| Measure | Camp files [D1] (31 cards) | Open-source sample [D2] (2,695 cards) |
|---|---|---|
| Read sentences that are one contiguous highlight run | 19.5% | 31.5% |
| Fragments per read sentence (mean) | 3.2 | 2.5 |
| Median fragment length | 3 words | 3 words |
| One-word fragments | 23% | 25% |

Elite cards assemble each read sentence from about 2–3 pieces. The operational target for the AI is therefore **read text that is grammatical and faithful**, not contiguous highlighting. Contiguity is only a tie-breaker, because it lowers clipping risk [S1].

### 1.2 What to keep: subject, verb, object; the warrant; load-bearing modifiers

- **Subject, verb and object.** This is the minimal unit of a read sentence [S1].
  - Real cards show what goes wrong without it. My checks on [D1] and [D2] found read text such as "*X* include" or "*Y* outperform" after the modal or auxiliary was skipped, and article errors ("a" followed by a skipped adjective, then a vowel-initial noun).
  - In [D1], 4 of the 8 places where a read "a/an" was followed by skipped words produced an agreement error. That is a cheap, testable check (§6, H-5).
- **Warrant, not only the claim.**
  - Zhou's principle is to shorten without losing the warrants [S2].
  - The camp guide's unit is the warranted sentence [S19].
  - Bauschard frames the core choice as which two or three sentences carry the argument, and notes that opponents can read the portion that contradicts your underlining [S18]. **Practitioner.**
- **Load-bearing modifiers and terms.**
  - Torson warns that taking technical terms out of their context (his example is "equal protection") misrepresents authors [S3]. **Practitioner.**
  - In my synthetic Example 1 (§5), dropping one adjective ("slower-than-expected") reverses the causal claim. Adjectives are not automatically filler.
- **Numbers with their frame.**
  - Zhou's worked example cuts a sentence about an epidemiologist's projection to its core. It keeps "could" but drops the phrase "as much as" in front of the percentage [S2].
  - I read this as evidence that even careful teaching examples shave numeric bounds. The AI should keep them (rule 13). This is my inference, not a claim made in [S2].

### 1.3 What to skip

- **Attribution filler** such as *he said*, *he added*, *he emphasized* [S2].
- **Institutional detail** that doesn't carry the claim. Zhou's example drops the word "University" from an expert's institutional title [S2].
- **Redundant sentences.** Highlighting and underlining exist to remove unnecessary or redundant sentences [S17].
- **Intensifiers and decorative adjectives** that don't change truth conditions: "very," "without question," "dramatically" when the verb is still read.
- **Parentheticals, citations and footnote markers.**
- **How much gets skipped at a time [D1].** The gap between two fragments in the same sentence is short: median 2 words, p75 4, p90 8. Typical skips are small modifiers and asides, not whole clauses.

### 1.4 When you must NOT skip

| Do not skip | Why | Evidence type |
|---|---|---|
| **Negators** that govern a read word | Deleting or adding "not" is the NSDA's own example of distortion [S5][S6]. NSD's glossary gives the pattern of a card reading "the economy will fall apart" from "the economy will not fall apart" [S20]. Gandra & Tambe define mis-cutting as changing an author's meaning by strategic underlining or minimizing [S4]. | Rule + Practitioner |
| **Qualifiers and scope limits** ("both good and bad", "sometimes", "rarely") | Gandra & Tambe's example: reading only "good" from "both good and bad" skews a qualified claim [S4]. Torson: ellipses can hide qualifiers like "sometimes" or "rarely" [S3]. Skipping them by highlighting has the same effect. | Practitioner |
| **Hedges and modals** (may, could, likely, perhaps, appears to) | Same logic as qualifiers. In real data these are dropped often: flags in 17% of [D2] cards, about 90% of them genuine upgrades (§4.4). | Measured |
| **Attribution frames** ("critics argue …") when the author rejects the view | Reading such a view as the author's own is a straw argument (NSDA 7.2.D). It is allowed only if acknowledged when first read [S5][S6][S7]. Torson: "don't card straw men" [S3]. Eagan: one supportive sentence does not mean the author supports the theory, because the author may be describing the opposing view [S26]. | Rule + Practitioner |
| **Contrastive continuations** (a trailing *…, but those reports are methodologically weak* clause) | Torson's example: an ellipsis cuts off exactly such a clause and inverts the evidence [S3]. Stopping a highlight before the "but" does the same. | Practitioner |
| **Numeric bounds, baselines, units, time frames** | These turn upper bounds into point estimates and pilots into system-wide results (Example 3). | My analysis |

**Confidence.**
- *High* that dropping negators and meaning-carrying qualifiers is condemned: rule text plus several practitioners.
- *Moderate* that dropping ordinary hedges ("could" → nothing) is treated as misconduct in practice. [D2] shows it is routine, and I found no ruling that punishes it. For AI output I recommend treating it as an error anyway. The cost of including one more word is tiny, and an AI that inflates certainty invites credibility attacks and rehighlighting [S21][S25].

### 1.5 "Word salad," sparse highlighting and rehighlighting

- **Word salad.** Highlighting a series of keywords that do not form sentences is Batterman's most extreme case [S1]. It is also the style most likely to produce clipping, because the speaker changes words while reading [S1]. **Practitioner.**
- **Consequence 1: clipping exposure.** Under the NDCA definition, a debater clips when they "read five words or more that they did not read" [S9]. Fragmented highlighting makes 5-word slips easy. **Rule.**
- **Consequence 2: rehighlighting.** Opponents answer bad highlighting by rehighlighting the card, i.e. showing what the unread text says.
  - Phillips argues that the burden should sit with the team that read the poorly highlighted card. Under his view a rehighlighting need not be read aloud [S21]. **Practitioner** (contested; judges differ).
  - The NSDA *Debate 101* textbook recommends cross-examining on the parts of 1AC cards that were **not** highlighted [S25].
- **Implication for the AI:** anything left unread that qualifies or reverses the read text will be used against the user.

### 1.6 Partial-word highlighting

- **Against.** Abbreviations like "c m r" and "prolif" are part of Batterman's criticism of shortened, hard-to-read highlighting [S1].
- **Conditionally for.** Zhou permits it: his example reads "flu" out of "influenza". He allows it if, and only if, it does not change the author's argument [S2]. **Practitioner** (disagreement between sources).
- **Adjacent practices.**
  - Verbatim's *Auto-Emphasize First* boxes the first letter of each word so acronyms can be read aloud, as in "United States" [S10].
  - The NDT does not count skipping words, or pieces of words, through mitigating circumstances or unintentional action as misrepresentation [S8]. That concerns delivery, not highlighting.
- **What real partial highlights are.**
  - [D1]: after removing tokenization artifacts (footnote numerals, dash- and slash-joined words) and one duplicated card, about 35 genuine partial-word highlights across 31 cards:
    - about 12 inflection trims (plural, possessive or tense endings dropped);
    - 6 acronym letters;
    - 4 truncations such as "util", "info", "neocons";
    - 4 compound-part cuts that change meaning, such as "state" from "interstate" and a year range cut to its first year;
    - 2 manufactured articles ("a" out of "an" or "as");
    - about 7 apparent slips (a missing first or last letter).
  - [D2]: partial words are 1.5% of highlighted tokens and appear in 47% of cards. A random sample of 150 partial highlights breaks down as follows (automatic classification, approximate):

    | Kind | Share | Examples |
    |---|---|---|
    | Initial letters read as acronyms | ~47% | "United States" → "U S", "North" → "N" |
    | Inflection or derivation trims | ~23% | "withdrawing" → "withdraw", possessive "'s" dropped |
    | Clippings | ~17% | "economic" → "econ", "government" → "gov" |
    | Non-prefix pieces | ~7% | "Democrats" → "Dems", "redouble" → "double" |
    | Short fragments that look like slips | ~5% | — |
    | Negation removed inside a word | ~1% | "cannot" → "can", "isn't" → "is" |
- **Recommendation: forbid partial words in AI output.**
  - Word-level highlighting loses little brevity.
  - Partial highlighting is how a "verbatim" card manufactures words the author never wrote.
  - The phrase matcher must also refuse to match inside a longer word (§6, H-1).

### 1.7 Highlighting across sentences

- **Faithful joins exist.** One guide's example reads a single sentence assembled from two: the subject from the first, and the second's predicate after its pronoun is skipped [S22]. This is faithful only because the skipped pronoun refers to the read subject.
- **Real data.**
  - Contiguous highlights that run through a sentence boundary are rare: 2.6% of fragments in [D1]. Continuous two-sentence reading is not the concern.
  - The concern is splicing, which I could not measure without parsing. In a manual read of flagged [D2] cards I saw one case: the subject came from one clause ("others") and the predicate from a clause about a different group ("they … will not submit").
- **Guidance.** Torson and Zhou both push for keeping full paragraphs in the card so that context stays inspectable [S3][S2]. The NSDA judges' guide says debaters may choose which parts of a quote to read, but "the entire text must be present" [S7]. **Rule/Practitioner.**
- **Rule for the AI:** splice across sentences only for pronoun or antecedent joins, never across paragraphs, and never to join facts about different entities, times or quantities (Example 4).

### 1.8 Making cards fast to read

- Batterman's checklist for readability [S1]:
  - one highlight color;
  - consistent formatting, so the eye finds the next highlighted word;
  - complete sentences;
  - a read-aloud rehearsal.
- Verbatim's Invisibility Mode shows only tags, cites and highlighted text. Batterman suggests using it to rehearse the read text [S1][S11]. **Practitioner.**
- **Rebuttal versions ("highlighting down").**
  - Batterman treats abbreviation as one way of highlighting a word down. If you want both a longer and a shorter read, he recommends two copies of the card, one more highlighted and one less highlighted, rather than two colors [S1].
  - Wikipedia's article records the norm of highlighting once per season rather than re-marking the same card repeatedly [S17].
  - A standard written "1AR version" convention is **Lore**: I found no authoritative write-up. §2.3 shows the measurable effect: later speeches read shorter cards.

---

## 2. Quantitative norms (Q2)

### 2.1 Method for my measurements

**[D1] Camp files.** Three 2021 summer debate-institute ("camp") files in `docs/research/samples/` (Michigan7 climate tradeoff disad, Northwestern fracking neg addendum, Berkeley states counterplan).
- I parsed the DOCX XML: `w:highlight` for highlighting; underline/emphasis styles for underlining.
- 53 cards have body text; 31 are highlighted.
- Scripts ran in a scratch directory. The camp files were only read.

**[D2] Open-source sample.** A random sample from **OpenDebateEvidence-Deduplicated-Anonymized** on Hugging Face [S15] (756,178 rows; openCaselist disclosures, 2014–2022).
- I fetched 170 random 25-row pages through the public datasets-server rows API, into memory only.
- 4,050 rows; kept 2,695 **policy** cards with at least one highlighted word and at least 40 body words (1,723 college, 972 high school).
- Highlighting comes from the `<mark>` tags in the `markup` column. The first paragraph after the tag is treated as the cite.
- Speech labels come from the file's own headings (pocket, hat, block), e.g. "1NC – DA".
- A second, independent pass (60 pages × 25 rows, different seed; 1,020 cards) collected examples to hand-check the precision of the negation, hedge and quantifier flags.
  - It reproduced the main-pass medians within about one point: ratio 14.5%, 74 highlighted words, 22.3 fragments per 100 highlighted words, 1-word share 0.21, dangling 0.62% of fragments.
- Only aggregate statistics are reported here. No card text is reproduced beyond a few words used to name a pattern (e.g. "may fear" → "fear").

**Definitions.**

| Term | Meaning |
|---|---|
| Token | A run of letters or digits, allowing internal apostrophes |
| Fragment | A maximal run of consecutive highlighted tokens |
| Read sentence | The highlighted tokens of one source sentence |
| Dangling | A fragment that ends on an article, preposition or conjunction exactly where the read sentence ends |

**Limitations.**
- Sentence splitting is heuristic.
- Hedge and negation checks are lexical.
- Speech labels reflect how files are organized, not what was actually read.
- Open-source disclosures over-represent constructives.

### 2.2 Card-level norms

| Metric | Camp files [D1] | Open-source sample [D2] | Other sources |
|---|---|---|---|
| Body words per card (median, IQR) | 546 (445–815) | 521 (272–911) | Mean 520 words per card; mean underlined extract 198 words; tags 14 words [S14] |
| **Highlighted (read) words per card** | **100** (76–112; range 45–190) | **71** (48–108; p10 32, p90 161) | Rules of thumb: 3–4 warranted sentences [S19]; two or three sentences [S18] |
| **Highlight ratio (highlighted ÷ body words)** | **17.0%** (10.7–23.5%; range 7–53%) | **14.5%** (9.3–22.3%; p10 6.0%, p90 32.3%) | No rule sets a ratio (§4.1) |
| Underline ratio | 50.5% | 41.9% | Mean underline compression 0.46 [S14] |
| Highlighted ÷ underlined | — | 0.37 | — |
| Highlight ⊆ underline (token share) | 99.7% | 98.9% | — |
| Fragments per 100 highlighted words (median) | 25.4 | 21.8 (IQR 14.8–29.8) | — |
| Fragment length, words (median; p90) | 3; 9 | 3; 10 | — |
| 1-word fragments (share of all fragments) | 23.2% | 25.3% | — |
| Per-card share of 1-word fragments (median; p90) | 0.21; 0.36 | 0.21; 0.41 | — |
| Highlighted words per read sentence (median) | 14.0 | 11.5 | — |
| Fragments ending on an article/preposition/conjunction | 18.8% (12.2% on a preposition) | 15.4% | — |
| …of which **dangling** at the end of a read sentence | 0.4% of fragments | 0.64% of fragments (10.9% of cards have ≥1) | — |
| Partial-word tokens (share of highlighted tokens; cards with ≥1) | 1.9%; 24/31 (many artifacts, see §1.6) | 1.5%; 47.1% | — |

Two takeaways:

- **Ending a fragment on a function word is normal; ending a read sentence on one is not.**
  - About 15% of real fragments end on words like "of" or "to". The next fragment supplies the object ("rise of … China").
  - Fewer than 1% of fragments dangle at the end of a read sentence.
  - So the naive check "no fragment ends on an article or preposition" is **wrong**. The correct check applies at read-sentence boundaries (§6, H-4).
- **High-school and college highlighting look alike.** HS: median 67 highlighted words, 13.0% ratio. College: 73 words, 15.4%. Fragment statistics are nearly identical.

### 2.3 Constructives vs. rebuttals [D2]

| Speech group (from file headings) | Cards | Body words (median) | **Highlighted words (median, IQR)** | Ratio (median) | Fragments/100 highlighted words | 1-word fragments |
|---|---|---|---|---|---|---|
| 1AC | 340 | 720 | **88** (59–126) | 13.8% | 22.2 | 26.1% |
| 1NC | 781 | 557 | **74** (49–118) | 13.9% | 22.9 | 26.3% |
| 2AC | 434 | 508 | **64** (44–94) | 13.6% | 22.0 | 25.2% |
| Block (2NC/1NR) | 690 | 436 | **67** (44–96) | 15.2% | 21.8 | 24.7% |
| Rebuttal (1AR ×93, 2NR ×3) | 96 | 388 | **57** (39–78) | 14.0% | 21.1 | 25.7% |

- **Finding.** Later speeches read about 35% fewer words per card than the 1AC (57 vs 88).
  - They get there by using **shorter cards**: the body shrinks from 720 to 388 words.
  - The highlighting of a given card is not sparser: ratio and fragmentation are flat across speeches.
  - "Highlighting down" in practice looks like cutting and choosing shorter cards, plus shorter versions. It does not look like thinner, choppier highlighting. **Measured.**
- **Caveat.** 2NR and 2AR cards are scarce in open-source files (3 and 0), so the rebuttal row is effectively the 1AR.

### 2.4 Speed and seconds per card

- **Speaking rate.** Batterman measured open-source 1AC documents from teams that cleared at the 2019 and 2021 NDT, 82 documents in all (tags + highlighted words ÷ speech time), and concluded that "“Fast” debaters speak at between 260 and 320 words per minute." [S16] **Measured.**
  - His caveats: 1NCs and 2ACs may be delivered faster [S16].
  - Verbatim's built-in reading-speed chart, which goes up to 450 wpm, confuses reading speed with speaking speed [S16].
- **Why speed matters for highlighting.** Critics have long argued that speed is used as a tactic to overwhelm opponents rather than to communicate [S28]. Batterman ties the push to fit more cards into a speech directly to ever-sparser highlighting [S1]. **Practitioner.**
- **Seconds per card.** Bauschard: "you have maybe 15 seconds per card" [S18]. **Practitioner, unmeasured.**
- **Derived estimate (my arithmetic).** Seconds = (median highlighted words + about 14 tag words [S14]) ÷ rate. Cite time is already absorbed into Batterman's rate because his denominator is total speech time.

| Group | Spoken words | @260 wpm | @290 wpm | @320 wpm |
|---|---|---|---|---|
| Camp-file card [D1] | 114 | 26 s | 24 s | 21 s |
| 1AC [D2] | 102 | 24 s | 21 s | 19 s |
| 1NC [D2] | 88 | 20 s | 18 s | 17 s |
| 2AC [D2] | 78 | 18 s | 16 s | 15 s |
| 1AR [D2] | 71 | 16 s | 15 s | 13 s |

Bauschard's "15 seconds" matches later-speech cards at fast rates. A typical 1AC card runs about 20–25 s.

**Confidence.** Card-length and ratio figures are measured on large samples, but on *disclosed* documents, which may include cards that were never read. Per-card timing is derived, not observed.

---

## 3. Practices (Q3)

### 3.1 Roles of underline, emphasis and highlight (Verbatim conventions)

| Format | Verbatim key | Meaning in practice | Source |
|---|---|---|---|
| Underline | F9 | First pass: the argument-bearing text worth keeping visible | [S2][S10] |
| Emphasis (box or bold) | F10 | Optional. Phrases to stress vocally or for their rhetorical punch. Verbatim includes a *Remove Emphasis* macro because some cutters overuse it | [S2][S10] |
| Highlight | F11 | What is read aloud. Normally nested inside the underlining | [S2][S10][S15] |
| Shrink | Alt+F3 or Ctrl/Cmd+8 | Shrinks *non-underlined* text in steps. Skips omission notes such as "[Table Omitted]" | [S10] |

- Verbatim's *Remove Non-Highlighted Underlining* reduces over-underlined cards to the parts actually read [S10].
- Verbatim's *Auto Underline Card* attempts to underline a card from its tag [S10]. That is an existing precedent for automatic markup.

### 3.2 Shrinking unread text

- **Rule.** NSDA 7.1.G.2 names three written practices as definitive for showing what was read: underlining what is read, highlighting what is read, or minimizing what is unread [S5][S6].
- **Practice.**
  - The NSDA handout suggests shrinking non-read text to 8 pt [S24].
  - Zhou calls shrinking optional [S2].
  - Verbatim refuses to shrink below 4 pt and refuses any "Invisibility Mode" that deletes text: "Debaters should win with superior argumentation, not cheap tricks." [S12]
- **Implication.** Shrinking is display-only and must never remove text.

### 3.3 Invisibility Mode

- It hides everything except headings or tags, cites and highlighted text [S11].
- Judges can use it to "only evaluate the portions actually read in the round" [S11].
- Debaters can use it to check readability [S1].
- **Design consequence.** Our preview should offer the same "read-only view", because that is how the output will be judged.

### 3.4 Two-color and multi-level highlighting

- **History** [S1].
  - In the paper era, debaters highlighted first in yellow and re-highlighted over it in a darker color.
  - Batterman argues paperless files make this unnecessary. Multiple colors confuse what was read and invite ethics disputes. Some debaters use a second color to lead judges into reading more after the round, or to flag lines for later speeches.
  - His fix: one color, and duplicate the card as more and less highlighted versions.
- **Tooling.** Verbatim's *Standardize Highlighting with Exception* keeps one exception color. In the manual's words: "This allows you to quickly reformat down to just 2 colors." [S10] Two-color files therefore exist in practice.
- **Norm.** Colors and underline thicknesses accumulate over a season and blur what was read. Wikipedia records "highlighting or underlining once only" over a season as the preferred practice [S17].
- **Recommendation for the app.**
  - Store a *full* layer and an optional *short* layer.
  - The short layer is a strict subset (e.g. the 1AR read).
  - Show one layer at a time.
  - On DOCX export, write one color per exported version, or emit two cards.
  - This matches `evidence-formatting.md` §7.2.

### 3.5 Marking cards

- **Rule.** NSDA 7.1.G requires two things [S5][S6]:
  - oral marking of evidence, by a pause or by saying "quote/unquote" or "mark the card";
  - written marking of the portion read.
- **Norm** (Batterman's three steps) [S1]:
  1. say "marked at [last word spoken]";
  2. insert a mark in the document (Verbatim's tilde key adds a timestamped mark);
  3. offer the marked document before cross-examination or prep.
- **Tooling.** Verbatim inserts a "Stopped reading" marker in the active speech document [S13].
- **LD variant.** Say you are cutting the card and mark the unread remainder [S23].
- **Consequences.**
  - The NDT lists stopping before the end of the quoted section without indicating the words read as misrepresentation [S8].
  - The NDCA accepts differences between marked documents as evidence in clipping disputes [S9].
- **Design.** Store marks as metadata on the highlight layer (last word read). Never implement them as text edits.

### 3.6 Rehighlighting by opponents

- Opponents "insert" or read a rehighlighting of your card, or cross-examine on the unhighlighted text [S21][S25][S18].
- This does not constrain the format. It does mean the highlighter's choices will be audited by the other side.

---

## 4. Ethics and rules (Q4)

### 4.1 Governing rules

| Body | Provision | What it says (paraphrased) | Type |
|---|---|---|---|
| **NSDA** (High School Unified Manual v2027.1.2) [S5]; same substance in 2015–16 rules [S6] | 7.1.E | Internal ellipses are prohibited. Debaters may skip words when reading, but the skipped text must remain in the card, and where reading begins and ends must be marked | Rule |
| | 7.1.G | Oral marking plus written marking. Underlining, highlighting, or minimizing unread text is "definitive" | Rule |
| | 7.2.A | **Distortion**: the text contains added or deleted words that significantly alter the author's conclusion (e.g. deleting or adding "not"). Unbracketed added words count as distortion | Rule |
| | 7.2.C | **Clipping**: claiming to have read all highlighted or underlined text while skipping or omitting portions | Rule |
| | 7.2.D | **Straw argument**: presenting a position the author introduces in order to refute it as the author's own. Allowed only if acknowledged when first read | Rule |
| | 7.3 note | Credibility arguments can be made in-round without a formal allegation | Rule |
| | 7.4.A–C | Marking or citation faults: judge's discretion. Clipping, straw arguments and ellipses: loss (the 2015–16 text adds zero speaker points). Distortion or nonexistent evidence: loss and disqualification | Rule |
| **NSDA judges' guide** [S7] | Scenarios | Debaters may choose which parts of a quote to read, but the full text must stay available so the quotation can be examined in context. Clipping: vote against the clipper and give zero points | Rule (guide) |
| **NDT** Standing Rules (rev. Dec 2025), VII.B.1.c [S8] | Misrepresentation | Intentional or negligent misrepresentation of the portion read is prohibited. Examples: stopping early without indication; "repeatedly skipping words or lines of words" without indication; speaking too unclearly to tell what was read; distributing documents that don't match what was read. Non-examples: skipping words or parts of words through mitigating circumstances or unintentionally; a brief lack of clarity. Penalty for distortion or falsification: loss and zero speaker points | Rule |
| **NDCA** national championship procedures [S9] | Clipping definition (adopted 2014-02-02) | Clipping = representing that you read five or more words you did not actually read. Loss and zero points; a false accusation costs the accuser the same. Technical malfunction is no excuse; ill intent is not required. No appeal. Audio-recording consent forms; the accuser presents recordings or marked-document differences | Rule |
| **UIL** (Texas) | — | The Constitution and Contest Rules page for Cross-Examination Debate that I opened contains no evidence or highlighting rules. A linked C&CR PDF returned 404. I found no UIL-specific clipping or highlighting rule | Not found |

### 4.2 Terminology (the AI and UI should use these precisely)

| Term | Meaning |
|---|---|
| **Clipping** | A *delivery* offense: the reading claims more was read than was actually spoken [S5][S8][S9] |
| **Distortion** (NSDA) | A *text* offense: words were added or deleted, changing the conclusion [S5] |
| **Mis-cutting** | Community term for changing the meaning through what you underline, highlight or minimize [S4] |
| **Straw argument** | Reading the author's description of a view the author rejects [S5][S3] |
| **Power-tagging** | A tag that overstates the evidence. Community term; not an NSDA rule |

Sources are not consistent. NSD's glossary uses "clipping" for a card cut to omit "not" [S20], which the rulebooks would call distortion or mis-cutting.

### 4.3 Does skipping "not" through highlighting violate the rules?

- **The letter of the rule.** NSDA 7.2.A is written about the *text* containing added or deleted words [S5][S6]. When the card keeps "not" but it isn't highlighted, the written text is intact. A strict reader could say this is not 7.2.A distortion.
- **The community view.** Community sources treat it as misconduct anyway:
  - Gandra & Tambe define mis-cutting as changing an author's meaning by strategically underlining or minimizing key words. They argue a debater should "represent the author as asserting everything read in that card." [S4]
  - NSD's glossary gives the "not" example as a violation [S20].
  - The NDT standard is about misrepresenting which portion of the evidence was read [S8], so a misleading read portion is within its spirit.
- **How it is handled in-round.** A formal allegation stops the round (NSDA 7.3; NDCA procedure) [S5][S9]. More often it becomes an argument: theory, rehighlighting, or a credibility attack [S4][S21].
- **Classification:** "meaning reversal by highlighting" is a **documented norm** close to a rule, not an explicit rule.
- **Recommendation.** Treat it as a hard error for AI output. The older NSDA handout's reassurance, that keeping the full text means an opponent "can never accuse you of altering the intent" [S24], is contradicted by the mis-cutting literature.

### 4.4 Published examples of miscut cards, and what real data shows

**Published examples (all described, not reproduced).**
- *Torson* [S3]:
  - A sentence ranking a president as number one means nothing without knowing whether the list is of the best or the worst presidents.
  - A sentence reporting that drone strikes kill civilians is cut off before the clause saying those reports have serious methodological problems.
  - A card built from an author's description of an opposing legal model, read as the author's own conclusion.
- *Gandra & Tambe* [S4]: a sentence saying there are arguments that presumed consent is both good and bad, read as if it said only "good".
- *Eagan (1994)* [S26]: a single supportive sentence does not show that the author supports the theory, because the author may be describing the opposing view. He also cites statistics read without their framing.
- *NSD glossary* [S20]: a prediction that the economy will not collapse, cut so that it reads as a prediction of collapse.

**What real cards do [D1][D2]** (lexical flags; hand-checked samples):

| Pattern | Flag rate | Hand check |
|---|---|---|
| **Epistemic hedge skipped right before a read word, inside a read sentence** (may, might, could, likely, probably, possibly, perhaps, seems, appears, suggests) | **17.3% of [D2] cards** (578 flags) | 31 random flags: about 28 were real certainty upgrades ("may fear" → "fear"; "is likely overblown" → "is overblown"; "might have sued" → "sued"; "could increase" → "increase"). [D1]: 14 of 27 unique skipped hedges were certainty or scope upgrades |
| Scope quantifier skipped before a read word (some, most, often, many, nearly…) | 18.4% of [D2] cards | 40 random flags from the second pass: about 30 real scope upgrades ("almost always" → "always", "nearly 40 points" → "40 points", "some of the largest" → "the largest", "often made" → "made"). The rest were harmless determiners or intensifiers |
| Negator skipped inside a read sentence (naive: any read word before and after) | 14.1% of [D2] cards | Mostly harmless. In [D1], 0 of 13 unique cases reversed meaning. They were "not only … but also", "X, not Y", parentheticals, and whole skipped clauses |
| Negator skipped with a read word within 4 tokens (proximity heuristic) | 4.7% of [D2] cards | 33 random flags: about 1 clear reversal (a card saying a nuclear option was not an effective solution, highlighted to read as if it were effective) and 2 overclaims or garbles. The rest were false positives of the kinds above |
| Negator whose governed word is read (head heuristic; §6 H-7) | 2.3% of cards (second [D2] pass, n = 1,020) | All 24 flags reviewed: 3 real meaning changes, 3 "if not" overclaims, 2 reconstructions, 16 false positives (§4.5) |
| Numeric bound skipped while the number is read ("as much as", "up to", "at least", "more than") | 0.7% of [D2] cards | Rare in practice, but serious when present |

- **Interpretation.**
  - Reversing negations by highlighting is **rare** in disclosed cards, about 0.3–0.6% (§4.5). Proximity-based detectors mostly flag harmless constructions.
  - **Inflating certainty or scope by dropping hedges and quantifiers is common and routine.** About one card in six does it, and the lexical flags for it are mostly correct: about 90% for hedges and 75% for quantifiers.
- **Confidence.**
  - The flag rates are measured.
  - The precision estimates rest on small hand-checked samples (about 30 each). Treat them as ±15 points.
  - [D2] consists of *disclosed* documents from 2014–2022.

### 4.5 A better negation rule (tested on real cards)

A proximity rule flags any skipped negator that has a read word within a few tokens after it. It is noisy (§4.4). A **head rule** works better:

> Find the first non-determiner token after the skipped negator. Flag if that token is read.

I tested it on a second, independent [D2] pass of 1,020 cards.
- **Flag rate:** 2.3% of cards (24 flags). I reviewed all 24 by hand.
- **Genuine meaning changes: 3.** One passage said some language was not binding precedent, and the highlighting read that it was binding precedent. One said a practice was not oriented toward a goal and read as oriented toward it. One denied how an aspiration was expressed and read as affirming it.
- **Overclaims through "if not": 3.** "most if not all" read as "all"; "largely if not solely" read as "solely". These are scope upgrades and belong under H-8.
- **Reconstructed double negatives or rhetorical questions: 2.** The read text states the author's implied view by deleting a negation. It is faithful in spirit but not in form. They need review.
- **False positives: 16.** Most were:
  - "not X but (rather/instead/only) Y" with a shared verb, where reading the Y half is faithful;
  - idioms ("or not", "often as not", "little to no");
  - a negator that ends a skipped relative clause.
- **Estimated prevalence** of genuine reversals-by-highlighting in disclosed cards: about 0.3% of cards (3/24 × 2.3%), or about 0.6% counting the "if not" overclaims. Rare, but real and serious.
- **Refinements for H-7:**
  - Whitelist "not X but/rather/instead Y" when the read text contains Y and none of X.
  - Whitelist the idioms "or not", "as not", "to no".
  - Route "if not" to H-8.
  - Stop the scan at clause boundaries: a comma followed by a relative pronoun, or a semicolon.
- **Partial words can hide negation.** In 150 randomly sampled partial-word highlights from [D2], 2 removed a negation *inside* a word ("cannot" read as "can", "isn't" read as "is"). A word-level negation check cannot see this. That is one more reason for H-1 (whole words only).

---

## 5. Synthetic examples

All passages below are **SYNTHETIC**. I invented them for illustration. They are not quotations and describe no real events.

Notation: `==text==` is highlighted (read aloud); everything else is unread.

### Example 1: grammar, warrant, and a load-bearing adjective

**Source (synthetic).**
> Regional grid operators warned on Tuesday that the rapid retirement of coal plants, combined with slower-than-expected construction of transmission lines, could leave the Midwest short of reliable capacity during extreme cold. The operators said that without new long-distance lines, wind power generated in the Plains cannot reach the cities where demand peaks in winter, so utilities would have to rely on rolling blackouts to balance the system.

**Bad A: word salad.**
```
... retirement of ==coal== plants, combined with slower-than-expected construction of ==transmission== lines,
could leave the ==Midwest short== of reliable capacity during ==extreme cold==. ... ==wind== power generated in
the Plains ==cannot reach== the cities ... so utilities would have to rely on rolling ==blackouts== ...
```
Read aloud: *"coal transmission Midwest short extreme cold wind cannot reach blackouts"*

- There is no subject-verb-object structure, and a listener cannot rebuild the causal chain.
- Invites clipping errors [S1].
- Fails H-3: 7 fragments in 10 words (70 per 100 highlighted words), and 57% of fragments are single words.

**Bad B: claim only, with the key modifier dropped.**
```
... the rapid ==retirement of coal plants, combined with== slower-than-expected ==construction of transmission
lines, could leave the Midwest short of reliable capacity== during extreme cold. ...
```
Read aloud: *"retirement of coal plants, combined with construction of transmission lines, could leave the Midwest short of reliable capacity"*

- It is grammatical, but dropping "slower-than-expected" makes *building* lines part of the problem. That reverses the author's causal claim.
- It also omits the warrant: why capacity runs short.

**Good.**
```
... the ==rapid retirement of coal plants, combined with slower-than-expected construction of transmission lines,
could leave the Midwest short of reliable capacity during extreme cold==. The operators said that ==without new
long-distance lines, wind power== generated in the Plains ==cannot reach the cities where demand peaks in winter,
so utilities would have to rely on rolling blackouts== to balance the system.
```
Read aloud: *"rapid retirement of coal plants, combined with slower-than-expected construction of transmission lines, could leave the Midwest short of reliable capacity during extreme cold. without new long-distance lines, wind power cannot reach the cities where demand peaks in winter, so utilities would have to rely on rolling blackouts"*

- Two grammatical sentences, with the claim, the mechanism and the impact.
- The modal "could" and both load-bearing modifiers are kept. The mechanism is the mismatch between "rapid" and "slower-than-expected".
- The skips are attribution ("Regional grid operators warned on Tuesday that", "The operators said that") and detail ("generated in the Plains").
- The ratio is high (about 70%, 47 of 67 words) only because this toy source is two sentences long. A real 500-word card would land near 15–20%.

### Example 2: a straw man, a reversed negation, and a legitimate "not X but Y" skip

**Source (synthetic).**
> Some analysts argue that expanding tariff exemptions would revive domestic steel production. The record does not support that claim. Plants that received exemptions in 2019 did not increase output; at most, they delayed layoffs by a few months. The main effect of a broad exemption would be not new hiring but lower input prices for manufacturers that buy steel.

**Bad A: straw man.**
```
Some analysts argue that ==expanding tariff exemptions would revive domestic steel production==. The record ...
```
Read aloud: *"expanding tariff exemptions would revive domestic steel production"*

- This reads the view the author reports in order to reject it, as if it were the author's conclusion (NSDA 7.2.D) [S5][S3].

**Bad B: reversed negation.**
```
... ==Plants that received exemptions== in 2019 ==did== not ==increase output==; at most, ...
```
Read aloud: *"Plants that received exemptions did increase output"*

- This is a reversal and the textbook case of distortion or mis-cutting [S5][S4][S20]. It fails H-7.

**Good (for a negative tag such as "Exemptions won't revive steel").**
```
==Some analysts argue that expanding tariff exemptions would revive domestic steel production. The record does not
support that claim. Plants that received exemptions in 2019 did not increase output; at most, they delayed
layoffs by a few months. The main effect== of a broad exemption ==would be not new hiring but lower input prices==
for manufacturers that buy steel.
```
Read aloud: *"Some analysts argue that expanding tariff exemptions would revive domestic steel production. The record does not support that claim. Plants that received exemptions in 2019 did not increase output; at most, they delayed layoffs by a few months. The main effect would be not new hiring but lower input prices"*

- The attribution frame is kept, including its scope word "Some", so the opposing view is clearly a subset of analysts' and not the author's.
- Every negator is read.
- The bound "at most" and the time frame "in 2019" are read. Dropping "in 2019" would turn one cohort into all exempted plants.

**Also good (for an affirmative tag "Exemptions lower input prices").**
```
... ==The main effect of a broad exemption would be== not new hiring but ==lower input prices for manufacturers==
that buy steel.
```
Read aloud: *"The main effect of a broad exemption would be lower input prices for manufacturers"*

- Skipping "not new hiring but" is faithful. Dropping the rejected half of "not X but Y" keeps the author's assertion, so H-7 must whitelist this pattern.

### Example 3: hedges, numeric bounds, and scope

**Source (synthetic).**
> According to the agency's own estimate, the new screening rule could reduce wait times at land ports of entry by as much as 40 percent, although officials cautioned that gains may be smaller at crossings with limited staffing. In a pilot at two ports, average waits fell from 52 minutes to 38 minutes.

**Bad.**
```
... ==the new screening rule could reduce wait times at land ports== of entry by as much as ==40 percent==, although
... In a pilot at two ports, ==average waits fell== from 52 minutes ==to 38 minutes==.
```
Read aloud: *"the new screening rule could reduce wait times at land ports 40 percent average waits fell to 38 minutes"*

- The upper bound becomes a point estimate: "as much as" is gone. This fails H-9.
- The baseline "from 52 minutes" is gone, so "38 minutes" means nothing.
- "In a pilot at two ports" is gone, so a two-port pilot sounds like a system-wide result.
- The skip "…ports [of entry by as much as] 40 percent" also breaks the grammar ("reduce wait times at land ports 40 percent").

**Good.**
```
==According to the agency's own estimate, the new screening rule could reduce wait times at land ports of entry by as
much as 40 percent==, although officials cautioned that gains may be smaller at crossings with limited staffing. ==In
a pilot at two ports, average waits fell from 52 minutes to 38 minutes==.
```
Read aloud: *"According to the agency's own estimate, the new screening rule could reduce wait times at land ports of entry by as much as 40 percent. In a pilot at two ports, average waits fell from 52 minutes to 38 minutes"*

- The attribution ("the agency's own estimate"), the hedge ("could"), the bound, the baseline and the scope are all read.
- The attribution is optional when brevity matters most. It is safest to keep because the source flags that the estimate is self-reported.
- **Tag dependence.** If the tag claims gains "everywhere", the "although … limited staffing" clause must also be read, or the tag narrowed. H-11 and H-16 raise this warning.

### Example 4: highlighting down (nested layers) and cross-sentence splicing

**Source (synthetic).**
> Satellite operators increasingly depend on a small number of commercial launch providers. When one provider's rocket is grounded after a failure, as happened twice last year, dozens of scheduled deployments slip by months. That dependence creates a vulnerability adversaries could exploit: a single targeted disruption could stall replenishment of military and civilian constellations alike. The 2023 audit found that the agency's launch budget rose 30 percent. It also found that delays at contractor facilities doubled over the same period.

**Full layer (constructive).**
```
==Satellite operators increasingly depend on a small number of commercial launch providers. When one provider's
rocket is grounded== after a failure, as happened twice last year, ==dozens of scheduled deployments slip by
months. That dependence creates a vulnerability adversaries could exploit: a single targeted disruption could
stall replenishment of military and civilian constellations== alike. ...
```
Read aloud (about 45 words): *"Satellite operators increasingly depend on a small number of commercial launch providers. When one provider's rocket is grounded, dozens of scheduled deployments slip by months. That dependence creates a vulnerability adversaries could exploit: a single targeted disruption could stall replenishment of military and civilian constellations"*

**Short layer (rebuttal); every highlighted word is also in the full layer.**
```
Satellite ==operators== increasingly ==depend on a small number of== commercial ==launch providers==. ... That
dependence creates a vulnerability adversaries could exploit: ==a single targeted disruption could stall
replenishment of military and civilian constellations== alike.
```
Read aloud (about 20 words): *"operators depend on a small number of launch providers. a single targeted disruption could stall replenishment of military and civilian constellations"*

- The short layer keeps the claim, the mechanism (concentration plus a single point of failure) and the modal "could" on the impact.
- It drops the historical example.
- It is a strict subset of the full layer (H-15).

**Bad short layer.**
```
... That ==dependence creates a vulnerability== adversaries could exploit: a single targeted ==disruption== could
==stall== replenishment of military and civilian ==constellations== alike.
```
Read aloud: *"dependence creates a vulnerability disruption stall constellations"*

- Word salad: "disruption stall" has lost its modal and its grammar. This fails H-2 and H-8.

**Bad splice across sentences.**
```
... The 2023 audit found that ==the agency's launch budget== rose 30 percent. It also found that delays at
contractor facilities ==doubled over the same period==.
```
Read aloud: *"the agency's launch budget doubled over the same period"*

- This fabricates a claim. The budget rose 30%; the delays doubled. Subject and predicate come from sentences about different quantities. This fails H-12.

**Good splice (faithful pronoun join).** If a source says "Launch providers are now concentrated in a handful of firms. They are also the only route to orbit for most replacement satellites.", then reading *"Launch providers … are … the only route to orbit for most replacement satellites"* is faithful.
- "They" refers to the read subject.
- The scope word "most" is kept.
- This mirrors the pronoun-join technique in [S22].

---

## 6. Proposed automatic checks

Severity is given for **AI output** (what the generator must satisfy) and for **auditing human cards** (imported cards), which should warn rather than block. The baselines show how often real cards trip each check, so thresholds do not flag normal practice.

| ID | Check | How to compute | AI output | Human cards | Real-card baseline |
|---|---|---|---|---|---|
| **H-0** | Unambiguous verbatim anchoring | Each AI-selected phrase must match exactly once in its paragraph, or carry an occurrence index or offsets. Reject if unmatched | error | — | — |
| **H-1** | Whole-word boundaries | Every highlight range starts at a token start and ends at a token end (tokens are alphanumeric runs with internal apostrophes or hyphens). Trailing punctuation, closing quotes and footnote digits may be left out. The matcher must not match inside longer words ("state" in "interstate"). When auditing human cards, a partial highlight that drops "not" or "n't" inside a word ("cannot" → "can") is an **error** | error | warn (error if it removes a negation) | Partial tokens: 1.5% of highlighted tokens; 47% of cards. About 1% of sampled partials removed an in-word negation [D2] |
| **H-2** | Grammatical read sentence | For each read sentence (the highlighted tokens of one source sentence, plus faithful splices), a POS tagger or LLM finds ≥1 finite verb and its subject. Optional LLM rating: "Is this a grammatical English sentence?" | error (LLM-verified) | warn | Not measured (needs a parser) |
| **H-3** | Fragment granularity | (a) share of 1-word fragments per card; (b) fragments per 100 highlighted words | warn if (a) >0.35 or (b) >30 | warn if (a) >0.45 or (b) >40 | Medians: (a) 0.21 (p90 0.41); (b) 21.8 (p75 29.8) [D2] |
| **H-4** | No dangling ending | The last read token of each read sentence is not an article, preposition, conjunction or relativizer. Mid-sentence fragment ends on such words are **allowed** | error | warn | 0.64% of fragments; 10.9% of cards [D2] (naive per-fragment rule would flag 15% of fragments) |
| **H-5** | Article agreement across a skip | A read "a" followed after skipped words by a vowel-sound word, or a read "an" followed by a consonant-sound word. Fix by re-choosing the span, never by partial-word tricks | error | warn | 4 of 8 article-then-skip cases in [D1] |
| **H-6** | Claim + warrant | ≥2 read clauses, and at least one read clause contains a causal or evidential marker (because, since, due to, by, through, so, leads to, causes, therefore), a number, or a study or data reference. Or an LLM judge confirms that a warrant is present | error | warn | Not measured |
| **H-7** | Negation head | For each unread negator (not, no, never, n't, cannot, without, nor, neither) in a read sentence, find the first following token that is not a determiner. If that token is read, flag. Whitelist: "not only / merely / just / simply / least"; "without question / doubt", "no doubt"; a following contrast word (but, rather, instead); "X, not Y" and "not X but (rather / instead / only) Y" when only the Y half is read; the idioms "or not", "as not", "to no". Route "if not" to H-8. Stop the scan at clause boundaries | error | warn (LLM review) | Head rule flags 2.3% of cards. About 1 in 3 flags is worth review, and about 1 in 8 is a true reversal (§4.5) [D2] |
| **H-8** | Hedge / modal / quantifier scope | An unread word from the hedge lexicon within 2 tokens before a read word, inside a read sentence. Lexicon: may, might, could, would, possibly, perhaps, probably, likely, unlikely, potentially, appear(s) to, seem(s) to, suggest(s), arguably; some, most, many, few, several, often, sometimes, rarely, usually, typically, generally, largely, mostly, partly, nearly, almost, roughly, approximately | error (epistemic set); error for bounds and "if not" (e.g., "most if not all") and warn for other quantifiers | warn | Epistemic: 17.3% of cards, about 90% precision (31 reviewed). Quantifier: 18.4% of cards, about 75% precision (40 reviewed) [D2] |
| **H-9** | Numeric integrity | If a number is read, its unit, any bound (as much as, up to, at least, more than, less than, nearly, about, roughly), its baseline ("from X") and its time frame ("by 2030", "per year", "since 2015") must be read when they are in the same clause | error for bounds; warn for units, baselines, time frames | warn | Bound drop: 0.7% of cards [D2] |
| **H-10** | Attribution / straw man | The read span sits inside a clause framed as others' view ("critics / opponents / proponents / some / many + argue, claim, contend, believe, say"; "it is often said"; "conventional wisdom") and the frame is unread. Or the next sentence opens with a rebuttal cue (But, However, Yet, "This is wrong") and is unread. Confirm with LLM: "Does the author endorse the read statement?" | error | warn | Not measured |
| **H-11** | Contrast truncation | A read clause followed in the same sentence by an unread but / however / although / yet / except / unless clause, where an LLM says the clause limits or reverses the read claim | warn (error if the tag relies on the unlimited claim) | warn | Not measured |
| **H-12** | Cross-sentence splice | A read sentence whose predicate is read in sentence k+1 while its subject was read in sentence k and sentence k's own verb was skipped. Allowed only if the skipped subject in k+1 is a pronoun or anaphor for the read subject (LLM check). Never across paragraphs | error | warn | Contiguous boundary-crossing fragments: 2.6% [D1]; splices not measured |
| **H-13** | Highlight ⊆ underline | When a card has underlining, every highlighted token is underlined | error | info | 98.9% of highlighted tokens comply [D2] |
| **H-14** | Length and ratio band | Show estimated read time: (tag words + highlighted words) ÷ {260, 290, 320} wpm | warn outside ratio [0.07, 0.45] or highlighted words [30, 170] | info outside ratio [0.05, 0.55] | Ratio p10–p90 6.0–32.3%; words p10–p90 32–161 [D2] |
| **H-15** | Layer nesting | The short layer ⊆ the full layer. Each layer independently passes H-1 through H-12, and the short layer still passes H-6 | error | — | — |
| **H-16** | Tag supported by the read text alone | An LLM judge checks whether the tag is supported by the *read text* (not the full text). Separately flags "power tags" that are more certain or broader than the read text | warn | warn | — |
| **H-17** | Adversarial rehighlight probe (optional) | An LLM is asked to find unread text in the card that contradicts or materially qualifies the read text. A hit is a warning | warn | info | — |
| **H-18** | Marking metadata | Marks ("marked at <word>") are stored as metadata on a layer. The body text is never edited | error | — | — |

**Implementation notes.**

- *Error handling for AI output.*
  - For the generator, false positives are cheap: the model can nearly always satisfy H-4, H-5, H-7, H-8 and H-9 by reading one or two more words or by choosing another span.
  - So these are **hard constraints for AI output**, even though, as audits of human cards, they need LLM review to avoid noise.
  - Run the lexical checks first, then send only the flagged items to an LLM verifier.
  - Community guidance on AI card cutting warns that chatbots can misattribute or fabricate cards and data and can return partial sentences or ellipses. It tells debaters to verify AI-cut cards before reading them [S27]. This is why H-0 and the code-enforced verbatim check come first, and why the AI must never write body text, only select it.
- *Metrics to log per card.* Log these in the eval harness (`docs/evals`) so model versions can be compared against the [D2] baselines:
  - highlight ratio;
  - highlighted words;
  - fragments per 100 highlighted words;
  - 1-word fragment share;
  - dangling count;
  - partial-word count;
  - H-7, H-8 and H-9 flag counts;
  - read time.
- *Ordering of rules when they conflict.*
  1. Faithfulness (H-7 to H-12).
  2. Grammaticality (H-2, H-4, H-5).
  3. Warrant (H-6).
  4. Brevity (H-3, H-14).
  - This mirrors the sources: brevity always comes with two conditions, keep the warrants and don't change the author's argument [S2].
- *Relation to `evidence-formatting.md` §12 (validation rules V-1…V-20).* These checks refine that list rather than replace it.
  - **H-7 and H-8 split V-7.** V-7 flags any skipped negator or hedge that sits between read words. Measured on [D2], the naive negator version fires on 14% of real cards and is mostly false positives. The hedge version is precise. Use the head rule for negation and keep the lexical rule for hedges.
  - **H-10 matches V-9.**
  - **H-1, H-2 and H-3 tighten V-17.** V-17 tolerates "obvious abbreviations". For AI output I recommend forbidding all partial words, since some real partials reverse polarity.
  - **H-14 updates the V-18 baseline.** V-18 used [D1]'s 17% median; the larger [D2] sample gives 14.5% (IQR 9.3–22.3%).

---

## 7. Sources

### 7.1 Web sources (all opened on 2026-09-25)

| ID | Source | Notes |
|---|---|---|
| S1 | Bill Batterman, "How To Never Clip Cards: A Guide For Debaters," *The 3NR*, 2014-08-20. https://the3nr.com/2014/08/20/how-to-never-clip-cards-a-guide-for-debaters/ | Full text read |
| S2 | Lawrence Zhou, "How to Cut a Card," *Victory Briefs*, 2020-03-18. https://victorybriefs.substack.com/p/how-to-cut-a-card-by-lawrence-zhou | Full text read |
| S3 | Adam Torson, "The Basics of Evidence Ethics," *Victory Briefs*, 2012-03-29. https://victorybriefs.substack.com/p/201203the-basics-of-evidence-ethics-by-adam-torson | — |
| S4 | Akhil Gandra & Arjun Tambe, "Evidence Ethics in LD Debate: A Proposal," *Victory Briefs*, 2014-10-24. https://victorybriefs.substack.com/p/evidence-ethics-in-ld-debate-a-proposal-by-akhil-gandra-and-arjun-tambe | — |
| S5 | National Speech & Debate Association, *High School Unified Manual*, version 2027.1.2 per the Google Doc (the NSDA rules page lists 2027.1.0, updated 2026-08-01), §7 Evidence Rules. Landing page: https://www.speechanddebate.org/high-school-unified-manual/. Text via the linked Google Doc: https://docs.google.com/document/d/1hq7-DE6ls2ryVtOttxR4BNpRdP7xUbBr0M3SMYefek8/ | Read through a plain-text export. Appendix C (evidence scenarios) was **not** in the portion I could retrieve |
| S6 | NSDA, "2015–2016 Debate Evidence Rules" (*Rostrum*, Summer 2015). https://www.speechanddebate.org/wp-content/uploads/Debate-Evidence-Rules-2015-2016.pdf | Used for exact wording and 7.4 penalties |
| S7 | NSDA, "LD, PF, and Policy Debate Evidence Rules — Guide for Judges." https://www.speechanddebate.org/wp-content/uploads/Debate-Evidence-Guide.pdf | — |
| S8 | National Debate Tournament, "Standing Rules for the Operation of the National Debate Tournament," revised December 2025, Rule VII.B. https://nationaldebatetournament.org/wp-content/uploads/2026/01/Standing-Rules-Revised-December-2025.pdf | — |
| S9 | National Debate Coaches Association, "NDCA National Championship" tournament procedures (2021 edition), incl. "NDCA Clipping Guidelines." https://s3.amazonaws.com/tabroom-files/tourns/18780/postings/24648/NDCANationalChampionship-TournamentProcedures.pdf | Clipping definition adopted 2014-02-02 |
| S10 | Paperless Debate Manual (Verbatim), "Formatting Functions." https://docs.paperlessdebate.com/verbatim/cutting-evidence/formatting | — |
| S11 | Paperless Debate Manual (Verbatim), "Tools." https://docs.paperlessdebate.com/verbatim/advanced/tools | — |
| S12 | Paperless Debate Manual (Verbatim), "FAQ." https://docs.paperlessdebate.com/verbatim/faq | — |
| S13 | Paperless Debate Manual (Verbatim), "Paperless" (debating paperless). https://docs.paperlessdebate.com/verbatim/debating-paperless/paperless | — |
| S14 | Allen Roush & Arvind Balaji, "DebateSum: A large-scale argument mining and summarization dataset," ArgMining 2020. https://arxiv.org/abs/2011.07251 | PDF read. CC BY 4.0 |
| S15 | Allen Roush et al., "OpenDebateEvidence: A Massive-Scale Argument Mining and Summarization Dataset," NeurIPS 2024 Datasets & Benchmarks (current arXiv revision). https://arxiv.org/abs/2406.14657. Dataset card: https://huggingface.co/datasets/Hellisotherpeople/OpenDebateEvidence-Deduplicated-Anonymized | PDF and dataset card read |
| S16 | Bill Batterman, "How Fast Do 'Fast' Debaters Speak? A Study," *The 3NR*, 2021-05-04. https://the3nr.com/2021/05/04/how-fast-do-fast-debaters-speak-a-study/ | The percentile table is an image; I used only the text conclusions |
| S17 | Wikipedia, "Evidence (policy debate)." https://en.wikipedia.org/wiki/Evidence_(policy_debate) | CC BY-SA |
| S18 | Stefan Bauschard, "Debate Cards: Teaching Students to Think With Evidence," Substack, 2026-03-13. https://stefanbauschard.substack.com/p/debate-cards-teaching-students-to | — |
| S19 | NSD (National Symposium for Debate), "Lincoln-Douglas (LD) Debate First Negative Constructive (1NC)." https://www.nsdebatecamp.com/lincoln-douglas/first-negative-constructive | Reached via a redirect from the former DebateDrills URL; LD-oriented; undated |
| S20 | NSD Debate Glossary, "Clipping." https://www.nsdebatecamp.com/glossary/clipping | — |
| S21 | Scott Phillips, "PSA- you don't have to read it when you re-highlight someones card," *HS Impact*, 2019-11-25. https://hsimpact.wordpress.com/2019/11/25/psa-you-dont-have-to-read-it-when-you-re-highlight-someones-card/ | — |
| S22 | The Debate Guru, "Finding and Cutting Evidence." https://thedebateguru.weebly.com/finding-and-cutting-evidence.html | Undated |
| S23 | LD Debate Prep, "Formatting Evidence." https://lddebateprep.org/formatting-evidence/ | Undated |
| S24 | NSDA, "Handout — How to Cut Cards" (modified with permission from Tara Tate, Glenbrook South HS; posted by Lauren McCool, 2018-10-04). https://www.speechanddebate.org/handout-how-to-cut-cards/ | Linked .docx read |
| S25 | Bill Smelko & Will Smelko, *Debate 101: Everything You Need to Know About Policy Debate*, NSDA, 2013. https://www.speechanddebate.org/wp-content/uploads/Textbook-Debate-101.pdf | — |
| S26 | Scott C. Eagan, "Evidence and Debate," *Rostrum*, March 1994 (UVM archive). https://www.uvm.edu/~debate/NFL/rostrumlib/eviddebateegan0394.pdf | — |
| S27 | Sebastian Rao, "How to Use Chat GPT to Cut Cards (Version 1.0)," *DebateUS*, 2023-02-03. https://debateus.org/how-to-use-chat-gpt-to-cut-cards-version-1-0/ | AI-cutting risks: fabricated cites, ellipses, verify before reading |
| S28 | James Talley, "Why Speed Kills," *Rostrum*, October 1996 (UVM archive). https://www.uvm.edu/~debate/NFL/rostrumlib/cxtalley1096.pdf | Critique of spreading as a tactic; says nothing specific about highlighting |

### 7.2 Data sources

- **[D1]** Local camp files, read only:
  - `docs/research/samples/Climate Tradeoff DA - Michigan7 2021 BFPSW.docx`
  - `docs/research/samples/Fracking Neg Addendum - Northwestern 2021 DFW.docx`
  - `docs/research/samples/States CP - Berkeley 2021.docx`
- **[D2]** `Hellisotherpeople/OpenDebateEvidence-Deduplicated-Anonymized` (MIT license), via https://datasets-server.huggingface.co/rows.
  - Main pass: 170 random pages × 25 rows, seed 2026.
  - Review pass: 60 pages × 25 rows, seed 99.
  - Held in memory; only aggregates are reported.

### 7.3 Inaccessible or not found

- **Tabroom judge paradigms** (e.g. `tabroom.com/index/paradigm.mhtml?judge_person_id=…`) redirect to a login page with the message "Please login to view paradigms!". Search-engine snippets suggested paradigms on complete-sentence highlighting and on inserting rehighlightings. I could not open them, so nothing from them is used.
- **DebateUS "Lesson 9 – Cutting Cards"** is behind a login wall.
- **DebateDrills Academy "How to Cut a Card"** requires enrollment; only the syllabus was visible.
- **NSDA Unified Manual Appendix C** (evidence scenarios) was not in the retrieved export.
- **UIL:** the C&CR page I opened has no evidence rules, and `uiltexas.org/files/policy/academics-ccr-1000-1008.pdf` returned 404.
- **Prilo AI "How to Cut Evidence Cards"** did not render its content.
- **Planet Debate, Champion Briefs, Premier Debate:** my searches turned up no accessible highlighting guidance, so none is cited.
- **Global Debate Blog:** the Blogspot archive surfaced only in search results. Bauschard's current Substack [S18] was used instead.
- **Opened but not relied on:** the DebateCardAI blog ("How to Cut Debate Cards", 2026; commercial). The DeepDebater paper (arXiv 2511.17854) mentions "span-level extractive highlighting" only in passing. An "NDCA Rules & Regulations 2025" PDF turned out to belong to the National *Dance* Council of America.
