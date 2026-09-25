# Evidence Formatting Research: Cards, Verbatim, and DOCX Interop

**Scope:** HS policy debate evidence ("cards"): how they are cut, cited, marked, and stored in Word (`.docx`) files built with the Verbatim template, plus what our importer, exporter, and validator need to do.
**Prepared:** 2026-09-25 by the evidence-formatting research agent.
**Evidence labels used below**

| Label | Meaning |
|---|---|
| **[V]** | Verified: I fetched and read the source or inspected the file myself |
| **[S]** | Observed in the three real Open Evidence camp files I downloaded (53 cards) |
| **[E]** | I ran it: an experiment against the project's installed `docx` 9.7.2, `fast-xml-parser` 5.11.1 and `fflate` 0.8.3 |
| **[I]** | Inferred from verified facts, not directly confirmed |
| **[U]** | Unverified or not accessible. Treat as a hypothesis |

I have paraphrased copyrighted rulebooks (NSDA, NDT) and guides rather than quoting them. I did not reproduce text from the camp files: in XML snippets the text content is replaced with role placeholders such as `[underlined highlighted text]`, while every element and attribute is copied exactly from the file. The one fully rendered example card uses a Congressional Research Service report. CRS reports are works of the U.S. government and are not under copyright (the report says so itself).

---

## 0. Key findings for implementers

1. **Open Evidence is now login-gated.** `openev.debatecoaches.org` no longer resolves (NXDOMAIN). The project moved to `opencaselist.com/openev`, and its API returns `401 Not Authorized` without a Tabroom login. I did not log in. I retrieved three real 2021 camp files from Internet Archive captures of the old site. **[V]**
2. **The canonical style IDs are stable.** Verbatim 6.0.0 and every 2021 camp file use these (built-in names are lowercase, and aliases are stored in `w:aliases`): **[V][S]**
   - `Heading1` "heading 1" (alias `Pocket`)
   - `Heading2` "heading 2" (alias `Hat`)
   - `Heading3` "heading 3" (alias `Block`)
   - `Heading4` "heading 4" (alias `Tag`)
   - `Normal` (alias `Normal/Card`)
   - `Style13ptBold` "Style 13 pt Bold" (alias `Cite`)
   - `StyleUnderline` "Style Underline" (alias `Underline`)
   - `Emphasis` (the built-in style, redefined as bold + underline + not italic, with an optional box border)
3. **Highlight and shrink are direct run formatting, not styles.** Highlighting is `<w:highlight w:val="…"/>` on the run. The three camps used cyan, green and yellow respectively. Shrinking is a direct `<w:sz w:val="16"/>` (8 pt) on non-underlined runs; 6, 7 and 9 pt also appear. **[S]**
4. **Real files do not keep their style tables clean.**
   - Alias lists accumulate junk. `heading 4` can carry aliases such as `Card` and `heading 2`, and `Hyperlink` can carry `Card Text` and `Read`.
   - Older (2013, Verbatim 4-era) files use different IDs: `StyleStyleBold12pt` for Cite, `StyleBoldUnderline` for Underline, and 8 pt Normal text.
   - Resolve styles by ID first, then by primary name or first alias, then by formatting heuristics. Never match against the whole alias list. **[S]**
5. **Google Docs exports use shading, not highlight, for most colors.** The NSDA manual (a Google Doc) exported to .docx shows a highlight color `#ffe599` as `<w:shd w:fill="ffe599" w:val="clear"/>`, and white as `w:highlight="white"`. Google exports have no character styles at all, so Cite, Underline and Emphasis arrive as direct formatting. The importer must treat both `w:highlight` and non-white `w:shd` as highlighting. **[V][E]**
6. **The `docx` npm library (9.7.2) has four problems for Verbatim-compatible output.** **[E]**
   - It always emits its own `Heading1`–`Heading6`, `Title`, `Strong` and similar styles.
   - Supplying `externalStyles` therefore produces duplicate style IDs (verified: `Heading4` appears twice).
   - It cannot write `w:aliases`, and it names the heading styles "Heading 4" (capitalized).
   - It emits `<w:highlightCs>` next to every `<w:highlight>`. That element is not among the children of `w:rPr` in Microsoft's Open XML SDK documentation.

   **Recommendation:** write our own small OOXML serializer on top of a fixed, clean-room, Verbatim-compatible `styles.xml`, and zip with `fflate`. Section 8.5 has the details.
7. **`fast-xml-parser` corrupts card text with its default options.** **[E]**
   - A whitespace-only `<w:t xml:space="preserve"> </w:t>` is dropped.
   - `"007"` becomes the number 7, and `"1e3"` becomes 1000.
   - Trailing spaces are trimmed.
   - `&#x2019;` is left undecoded unless `htmlEntities: true`.

   Use `trimValues:false, parseTagValue:false, parseAttributeValue:false, htmlEntities:true, preserveOrder:true`.
8. **mammoth is the wrong tool for import.** **[V]**
   - It ignores font size.
   - It maps highlights only if you add an explicit mapping (supported since 1.8.0).
   - Its `u` and `b` matchers see only direct formatting, not formatting inherited from styles.
   - It ignores `w:shd`.
9. **NSDA rules (Unified Manual 2026–27, Version 2027.1.2), Section 7:** **[V]**
   - 7.1.C lists the required written-cite elements.
   - 7.1.E bans internal ellipses and requires that skipped text stay present in the card.
   - 7.1.G requires the read portion to be marked in the text; underlining, highlighting and minimizing are named as definitive.
   - 7.2.A–D define distortion (including unbracketed additions), non-existent evidence, clipping and straw arguments.
   - 7.4 sets the penalties: a loss for clipping, straw arguments or ellipses; a loss plus disqualification for distortion or non-existent evidence.
   - The National Tournament section says generative AI must not be cited as a source, and the original source of AI-assisted evidence must be available on request. This is directly relevant to an AI cutting tool.
10. **Empirical norms from 53 real cards:** **[S]**
    - Median card: 466 words.
    - Underlined share: median 49%.
    - Highlighted share, among the 31 highlighted cards: median 16.9%, interquartile range 10.6–23.4%, full range 7–52%. Median 100 highlighted words per card.
    - In 30 of 31 highlighted cards, every highlighted word is also underlined.
    - Tags have a median of 11 words.
    - One camp starter file leaves 22 of its 26 cards unhighlighted.

---

## 1. Sources of truth and the samples

### 1.1 Status of the Open Evidence Project

- **The old site is gone.** `openev.debatecoaches.org` returns NXDOMAIN (checked 2026-09-25). WebFetch and curl both fail to resolve it. **[V]**
- **It moved to openCaselist.** The openCaselist source (`ashtarcommunications/caselist`, GPL-3.0) serves Open Ev from `GET /v1/openev?year=` and downloads from `GET /v1/download?path=`. Both are declared with `security: [{ cookie: [] }]`. Downloads are rate-limited to 10 per minute per user and 5 bulk ("weekly") downloads per day. A live unauthenticated call to `https://api.opencaselist.com/v1/openev?year=2025` returned `401 {"message":"Not Authorized"}`. **[V]**
- **What the page says about use.** The openCaselist Open Ev page (`client/src/openev/OpenEvHome.jsx`) and the 2021 archived page describe the files as freely shared by the summer camps, downloadable by anyone at no cost, for teaching, competing or learning the topic. **Neither page states an explicit license** (no Creative Commons or other). **[V]**
- **A CC BY 4.0 claim you may run into is misattributed.** Search engines attribute CC BY 4.0 to the Open Ev Project. That license statement belongs to the *DebateSum paper* (ACL Anthology 2020.argmining-1.1), not to Open Ev. **[V]** The brief's premise that Open Ev is Creative Commons-licensed is **not verified**.
- **NSDA recognizes Open Ev as an original source.** Manual 7.1.F.2.d lists the NDCA Open Evidence Project (and similar sites) as an acceptable form of "original source" when evidence is challenged. Appendix C confirms that showing the OEP download satisfies the original-source burden, although the debater is still responsible for the evidence's validity. **[V]**

### 1.2 Samples saved in `docs/research/samples/`

All three were fetched from the Internet Archive's raw (`id_`) captures of the old OpenEv site, captured 2022-04-04, and are 2021 camp releases.

| File | Camp | Bytes | SHA-256 | Source URL (Wayback raw) |
|---|---|---|---|---|
| `States CP - Berkeley 2021.docx` | Berkeley / CNDI starter packet (neg) | 78,004 | `3e565d7f…d349b6d1` | `http://web.archive.org/web/20220404102211id_/https://openev.debatecoaches.org/bin/download/2021/Berkeley/States%20CP%20-%20Berkeley%202021.docx` |
| `Climate Tradeoff DA - Michigan7 2021 BFPSW.docx` | Michigan 7-week (lab BFPSW) | 39,394 | `ad22f5ef…5b52df1d78fd` | `http://web.archive.org/web/20220404102248id_/https://openev.debatecoaches.org/bin/download/2021/Michigan7/Climate%20Tradeoff%20DA%20-%20Michigan7%202021%20BFPSW.docx` |
| `Fracking Neg Addendum - Northwestern 2021 DFW.docx` | Northwestern (lab DFW) | 78,523 | `e5eaffa8…939ffeed4c72` | `http://web.archive.org/web/20220404101639id_/https://openev.debatecoaches.org/bin/download/2021/Northwestern/Fracking%20Neg%20Addendum%20-%20Northwestern%202021%20DFW.docx` |

Full hashes:
- Berkeley: `3e565d7f0f8606c066927f230e4775726b647802193e8c844a745d37d349b6d1`
- Michigan7: `ad22f5efd4ab5c646cccaac68b4308c866928c965faa933358cc5b52df1d78fd`
- Northwestern: `e5eaffa8cc7480c4f95558a0f2d59a8f6ca50dc6b5f436c8fe14939ffeed4c72`

**License and terms recorded for these samples**
- Terms: Open Ev's stated terms, "freely shared by the summer debate camps", free to download and use for teaching, competing or learning. No explicit license was found on the archived 2021 page or inside the files.
- Copyright: the quoted article text in each card remains the property of its original publishers.
- Recommendation: use these files **only as internal test fixtures**. Do not redistribute them, ship them in the product, or publish them in a public repository without clearance.

**Privacy note [S].** The files carry personal metadata:
- `docProps/core.xml` includes the creator's name.
- `word/_rels/settings.xml.rels` includes local template paths that reveal OS usernames, for example `file:///C:\Users\<name>\AppData\Roaming\Microsoft\Templates\Debate.dotm`.

Our importer should not surface or propagate these fields. Our exporter should write neutral metadata and no `attachedTemplate` path.

### 1.3 Other artifacts inspected

- **Verbatim 6.0.0 template**: `desktop/release/6.0.0/Debate.dotm` from `github.com/ashtarcommunications/verbatim` (GPL-3.0), 486,284 bytes, SHA-256 `3e553d07…09608`. I unzipped it and read only `styles.xml`, `settings.xml` and `document.xml`. No macros were run. **[V]**
- **Verbatim VBA source** in `desktop/src/*.bas` (Formatting, Condense, Shrink, Paperless, Caselist, View, Startup, Settings) and `frmSettings.frm`. **[V]**
- **An older 2013 OpenEv file** (Berkeley, "Cuba Negative Supplement – Oil"), inspected in scratch space only (not saved to `samples/`). It shows the legacy style IDs. **[V]**
- **The NSDA Unified Manual**, exported from its public Google Doc as both `.txt` and `.docx`. This told me how Google Docs serializes highlight in `.docx`. **[V]**
- **An experiment with the project's installed `docx` 9.7.2**, generating Verbatim-style cards. **[E]**

---

## 2. Card anatomy and conventions

### 2.1 Document hierarchy (the "expando" model)

Verbatim's four organizing levels are aliases of Word's built-in Heading 1–4, and the Word Navigation Pane shows them as an outline. **[V]**

| Level | Verbatim name | Word style | Default key | Default look (Verbatim 6) |
|---|---|---|---|---|
| 1 | **Pocket** | Heading 1 | F4 | 26 pt bold, centered, 3 pt box, new page |
| 2 | **Hat** | Heading 2 | F5 | 22 pt bold, double underline, centered, new page |
| 3 | **Block** | Heading 3 | F6 | 16 pt bold, underline, centered, new page |
| 4 | **Tag** | Heading 4 | F7 | 13 pt bold, left-aligned |

Files may use only some of these levels; Verbatim's docs say to "let the content dictate the structure". In the samples, Blocks typically hold several cards, for example `1NC – Tradeoff` or `AT: Uniformity`. **[V][S]**

### 2.2 Tag

- **What it is:** the debater's one-sentence argumentative claim, which sits above the cite. It is stored as a Heading 4 / Tag paragraph. **[V][S]**
- **Length [S]:** median 11 words, range 4–53.
- **Formatting inside tags:** some tags have direct underlining on key words (`<w:u w:val="single"/>` on runs). This appeared in the Northwestern and Michigan7 files.
- **Plan and counterplan texts, and analytic arguments,** are also written as Tag paragraphs with no cite or body after them. The Berkeley file has 22 such tag-only entries. **[S]**
- **Power-tagging.** A tag that claims more than the evidence supports. Community sources call it inadvisable and a common cross-examination target, but it is not in itself an NSDA rule violation (the quote is accurate). **[V]** (NCPA Debate Central, "Shady Six"; Victory Briefs guides)

### 2.3 Cite

- **Short cite:** author last name plus two-digit year, e.g. "Deighton 19" or "Newburger21". It is the part read aloud. NSDA 7.1.B sets the oral minimum at the primary author's last name and the year. **[V]**
- **How it is marked:** the short cite is in the **Cite** character style (`Style13ptBold`, 13 pt bold). Verbatim's docs say the Cite style applies only to the last name and date, not the whole line. **[V]**
- **Verbatim's recommended format:** one line, with Cite style on the last name and on the date, e.g. Aaron **Hardy**, creator of Verbatim, 1-1-**3000**, "…," URL.
  - Verbatim's own processing assumes three paragraphs per card: tag, cite, card.
  - Two-line cites and notes wedged between tag and cite break its automation.
  - **The two Cite-styled pieces are non-contiguous** in this format, so the importer must build the short cite by concatenating every Cite-styled run. **[V]**
- **Auto Format Cite (Ctrl+F8)** styles the last name, plus the **year for older cites or the month-day for current-year cites** (e.g. "Smith 9-25"). **[V]** (from `Formatting.bas` AutoFormatCite)
- **Real patterns in the samples [S]:**
  - `Lastname YY [Full Name, quals, "Title," Pub, M-D-YYYY, URL]`, e.g. "Specktor 19 [Brandon Specktor, Senior Writer, …]"
  - `Lastname ’YY (First, quals, "Title," …)` with a curly apostrophe before the year, e.g. "Roper ’15 (Cindy, Doctoral Student, …)"
  - `First **Last YY**, quals, date, "Title" URL`, e.g. "Ben **Deighton 19**, …"
  - Organization as author: "**ELI, 2013** (Environmental Law Institute, …)"
  - Multiple authors: "Berry & Huckins ’19", "Creed et al. ’17", "Sundaram and Popov 2019"
  - Cutter's initials or accessed date appended: "…/ck", "…, accessed 5-24-2021, cut by <name>"
- **Cite Creator** (the browser extension from Verbatim's author, GPL-3.0) outputs these formats: **[V]**
  - Standard: `Name, Quals, M-D-YYYY, "Title", Publication, URL`
  - Frontloaded: `Name YY, Quals, M-D-YYYY, "Title", Publication, URL`
  - Two-line: `Last YY` then a line break and `(Name, Quals, …)`
  - Custom, with placeholders `%author% %first% %last% %y% %quals% %date% %title% %publication% %url% %accessed% %linebreak%`
  - When a field is missing it writes `No Author`, `xx-xx-xxxx` and `No Publication`.

### 2.4 Card body

- **What it contains:** verbatim source text. The NAUDL glossary notes that cards keep all the surrounding text so opponents can see the context, even though only part is read. **[V]**
- **Condensing (F3).** Verbatim's Condense turns page breaks, tabs, non-breaking spaces, section, line and column breaks into spaces and collapses double spaces. **[V]** (Condense.bas)
  - It can **retain paragraph integrity** in one of two ways: keep the original paragraph breaks, or replace each break with a **pilcrow "¶ "** in **6 pt** type, leaving one block of text.
  - The pilcrow is `Chr(182)` on Windows and `Chr(166)` on Mac, which is U+00B6 either way.
- **When to turn integrity off:** Verbatim says to turn it off temporarily for PDFs, which put a hard line break after every line. Otherwise every line would get a pilcrow. **[V]**
- **Samples [S]:** 12 of 53 bodies have more than one paragraph (11 of them in the Northwestern file), and 3 contain pilcrows.
- **Guidance:** one guide recommends starting and ending cards at full paragraph boundaries. **[V]** (Zhou 2020, Victory Briefs)

### 2.5 Underline, emphasis, highlight and shrink

| Mark | Meaning in practice | How Verbatim stores it | Default look |
|---|---|---|---|
| **Underline (F9)** | Relevant text, a candidate for reading | Character style `StyleUnderline` ("Style Underline", alias "Underline") | 11 pt, underline single, bold off (option `BoldUnderline`) |
| **Emphasis (F10)** | The most important words inside underlined text; a visual cue | Built-in character style `Emphasis`, redefined | 11 pt **bold** + underline single, **italic off**; optional **box** border |
| **Highlight (F11)** | **What is actually read aloud** | Direct `w:highlight` (WordBasic.Highlight) in the chosen color | Yellow by default. Verbatim warns against light gray because a Word bug can lose it on save |
| **Shrink (Alt+F3 / Ctrl+8)** | Minimizes unread context | Direct `w:sz` on **non-underlined** runs. Cycles 8→7→6→5→4 pt→normal. Leaves omission notes like `[ Table Omitted ]` full size by default. Pilcrows go to 6 pt | 8 pt first press |

Sources: Verbatim docs, `Shrink.bas`, `Formatting.bas` and `frmSettings.frm`. **[V]**

**Emphasis box: the docs and the code disagree.** The docs say Emphasis adds a box by default. The Verbatim 6 code defaults `EmphasisBox = False`, and the shipped template has `<w:bdr w:val="none" …/>`. **[V]** In real files both variants occur: the Northwestern file has `w:bdr single sz=8` (1 pt) and the 2013 file has `sz=18` (2.25 pt). **[S]**

- The settings form offers box widths of 1, 1.5, 2.25 and 3 pt, which are `w:bdr w:sz` 8, 12, 18 and 24 (eighths of a point).
- Emphasis size and bold/italic are also user settings.

### 2.6 Card vs analytic

- **Card:** tag, cite and body, attributed to an external source.
- **Analytic:** the debater's own argument, with no source.
  - NSDA 7.1.A treats unattributed ideas as the student's own opinion, not evidence. **[V]**
  - Verbatim has **no Analytic style by design**. Its FAQ argues analytics should stay visible in shared speech docs, so analytics are formatted as Tags. The *Convert Analytics To Tags* macro turns any paragraph style beginning "analytic…" into Tag. **[V]**
- Third-party extensions such as Advanced Verbatim (now folded into CardMirror) add "Analytic" and "Undertag" styles. **[V]**
- Our exporter should write analytics as **Heading 4 (Tag)**, the lowest common denominator.

### 2.7 Numbers from the real samples (53 cards) **[S]**

| Metric | Value |
|---|---|
| Words per card body | min 53, **median 466**, max 2,856 |
| Underlined share of body words | median **49%** (IQR 31–59%) |
| Highlighted share (31 highlighted cards) | min 7.1%, p25 10.6%, **median 16.9%**, p75 23.4%, max 51.9% |
| Highlighted words per card | min 45, **median 100**, max 190 |
| Highlight ⊆ underline | **30 of 31** highlighted cards; the exception had 10 non-underlined highlighted words |
| Highlight colors | Berkeley **cyan**, Michigan7 **green**, Northwestern **yellow** (one color per file) |
| Non-underlined text sizes | 8 pt dominant; also 6, 7 and 9 pt; one card left unshrunk at 11 pt |
| Unhighlighted cards | 22 of 26 in the Berkeley *starter* file |

### 2.8 Two example cards

**(a) A real card's structure** (Northwestern file, paragraphs 2–4; text replaced with placeholders; see §4 for the XML):

```
[Heading 4]  tag words, with key words directly underlined
[Normal]     First-name  **Deighton 19** (Cite style) , quals, M/D/YY, “Title” URL
[Normal]     8-pt plain context … [Emphasis+yellow] … [Underline+yellow] … [Underline] … [Emphasis] … 8-pt plain …
[Normal]     (continues: 8 paragraphs of body, paragraph integrity retained, no pilcrows)
```

**(b) A fully rendered example cut from public-domain text.** Congressional Research Service report RL34391, updated 4-21-2025; CRS reports are not under U.S. copyright.

Notation: `__underlined__`, `**emphasis**` (bold + underline), `==…==` = highlighted (read aloud). Unmarked text is un-underlined and would be shrunk to 8 pt on export.

```
TAG:  The first Polar Security Cutter is about six years late — the Coast Guard now expects delivery in 2030,
      and much of the delay comes from how long the design took
CITE: O’Rourke 25 [Ronald O’Rourke, Specialist in Naval Affairs, Congressional Research Service,
      “Coast Guard Polar Security Cutter (PSC) and Arctic Security Cutter (ASC) Icebreaker Programs:
      Background and Issues for Congress,” CRS Report RL34391, updated 4-21-2025,
      https://www.congress.gov/crs_external_products/RL/PDF/RL34391/RL34391.281.pdf, accessed 9-25-2026] //XX
      ("O’Rourke 25" in Cite style)
BODY: ==__The PSC program has experienced__== ==**significant cost growth and schedule delay**==__.__ In March 2025,
      the Coast Guard reportedly awarded the shipbuilder a contract modification for an additional $951.6 million
      for the first PSC to account for increasing time and cost to build the ship. Much or all of this figure might
      constitute cost growth above the Coast Guard’s 2021 estimate for the total procurement cost of the ship.
      ==__The ship’s delivery date has been delayed repeatedly, and the Coast Guard now expects it to be delivered in__==
      ==**2030, about six years later**== ==__than the originally scheduled date__==__.__ ==__Much of the__== __schedule__
      ==__delay is due to the time it has taken to fully develop the design__== __for the ship.__ As a result of the PSC
      program’s cost growth and schedule delay, the PSC program has become a prominent oversight item in
      congressional reviews of Coast Guard budgets and programs.
READ ALOUD: "The PSC program has experienced significant cost growth and schedule delay. The ship’s delivery date has
      been delayed repeatedly, and the Coast Guard now expects it to be delivered in 2030, about six years later than
      the originally scheduled date. Much of the delay is due to the time it has taken to fully develop the design"
```

The source PDF puts a hard line break after every line of this paragraph. That is exactly the case where Verbatim tells you to condense *without* pilcrows (§2.4). Section 7.4 reuses this passage for good and bad highlighting.

---

## 3. The Verbatim template

### 3.1 What it is, who maintains it, versions **[V]**

- **What:** a free, open-source (GPL-3.0) Word template plus VBA macros for paperless debate. It is the de facto standard in U.S. HS and college policy debate.
- **Maintainer:** Aaron Hardy (Ashtar Communications), who also runs openCaselist.
- **Where:**
  - Downloads: `paperlessdebate.com` (full installer, "Verbatim Mini", manual-install templates, plugins).
  - Code and docs: `github.com/ashtarcommunications/verbatim`.
  - Manual: `docs.paperlessdebate.com`.
- **Current version: 6.0.0**, released 2023-05-01. A **6.0.0-mini** followed on 2025-08-13; it strips network features that trip antivirus software.
  - The homepage offers v6.0.0 installers for PC and Mac. The downloads page calls versions before 6.0.0 outdated.
  - The GitHub repo has no formal releases. The last commit was 2026-08-31.
- **Files:**
  - `Debate.dotm` goes in the Word Templates folder.
  - `DebateStartup.dotm` goes in Word's STARTUP folder.
  - Mac also needs `Verbatim.scpt` in `~/Library/Application Scripts/com.microsoft.Word/`.
  - **Verbatim Flow** is a separate **Excel** flowing template (`Debate.xltm`). It is *not* a Google Docs equivalent.
- **Requirements:** a full desktop Word with VBA (designed on Word 2019/365). It does **not** run in Office Online, Microsoft Store Office, iPad, Android, Office RT, Mac Word 2008 or 2011, Chromebooks, OpenOffice or Pages.
- **Mac:**
  - Since v6 there is a single cross-platform codebase, with Cmd in place of Ctrl.
  - F-keys need the "use F1, F2… as standard function keys" setting.
  - On some Mac Word builds **F6 is hard-wired** to "switch pane", so use Cmd+Alt+6 instead.
  - Draft view is recommended on Mac because Web view has a Navigation Pane scrolling bug.
- **Styles update when a file is opened.** On open, Verbatim runs `ActiveDocument.UpdateStyles` when *Auto Update Styles* is on (the default), which re-copies style definitions from the user's attached template **by style name**. It also sets `Application.RestrictLinkedStyles = True` to stop Word inventing styles. **[V]** (Startup.bas)

  Implication: if **our style names match Verbatim's**, each user's own formatting preferences (sizes, box, font) take over automatically once the file is attached or "Verbatimized". **[I]**
- The "Verbatimize" button (Home tab, in DebateStartup.dotm) converts any document into a Verbatim document. **Its exact mechanism is not verified**: that code is compiled into the `.dotm` and not in `src/`. **[U]**

### 3.2 Style table (Verbatim 6.0.0 `Debate.dotm` → `word/styles.xml`) **[V]**

| styleId | w:name | w:aliases | Type | Key properties (half-points for sz) |
|---|---|---|---|---|
| `Normal` | Normal | Normal/Card | paragraph | Calibri; size 11 pt from docDefaults (`sz=22`); spacing after 160, line 259 auto |
| `Heading1` | heading 1 | **Pocket** | paragraph | b; sz 52; box `pBdr` single sz 24; centered; `pageBreakBefore`; keepNext/keepLines; before 240 after 0; **`outlineLvl 0`**; link `Heading1Char` |
| `Heading2` | heading 2 | **Hat** | paragraph | b; sz 44; **u double**; centered; pageBreakBefore; before 40 after 0; `outlineLvl 1` |
| `Heading3` | heading 3 | **Block** | paragraph | b; sz 32; u single; centered; pageBreakBefore; before 40 after 0; `outlineLvl 2` |
| `Heading4` | heading 4 | **Tag** | paragraph | b; iCs; sz 26; keepNext/keepLines; before 40 after 0; `outlineLvl 3` (no page break, left-aligned) |
| `Style13ptBold` | Style 13 pt Bold | **Cite** | character (custom) | b; bCs; sz 26; u none |
| `StyleUnderline` | Style Underline | **Underline** | character (custom) | b=0; sz 22; u single |
| `Emphasis` | Emphasis | *(none)* | character (built-in, redefined) | Calibri; b; **i=0**; iCs; sz 22; u single; `bdr none` |
| `Heading1Char`…`Heading4Char` | Heading N Char | Pocket Char … Tag Char | character (linked) | mirror the headings |
| also | Heading5, Strong, BookTitle, Hyperlink, NoSpacing, Header, Footer, BodyText, … | | | not used for cards |

**Default values in the settings form** (`frmSettings.frm`): **[V]**
- Normal 11 pt Calibri; Pocket 26; Hat 22; Block 16; Tag 13; Cite 13; Underline 11; Emphasis 11.
- `UnderlineCite = False`, `BoldUnderline = False`.
- `EmphasisBold = True`, `EmphasisItalic = False`, `EmphasisBox = False` (box sizes 1, 1.5, 2.25, 3 pt).
- `ParagraphIntegrity = True`, `UsePilcrows = True` (per Globals.bas).
- Spacing "Wide": Normal 0 pt before, 8 pt after, line 1.08.

**Legacy and polluted variants seen in the wild** **[S]**
- **2013 (Verbatim 4 era):**
  - Cite: `StyleStyleBold12pt` ("Style Style Bold + 12 pt", aliases `Cite, …`, basedOn `StyleBold`, 12 pt).
  - Underline: `StyleBoldUnderline` ("Style Bold Underline", aliases `Underline, …`, 12 pt).
  - Emphasis: 12 pt with a 2.25 pt box.
  - **Normal is 8 pt**, so un-underlined text is small by default rather than shrunk directly.
- **2021:**
  - Alias lists grow long and cross-contaminated. Examples: `heading 4` aliases include `Tag, heading 2, …, Card, …`. `Hyperlink` aliases include `Card Text, Important, Read, Analytic Text`. `Emphasis` aliases include `Evidence, Minimized, Highlighted, …`.
  - Stray styles: `text bold` (linked to Emphasis), `Card`, `card text`, a lowercase `underline` character style, `Box`, and Gmail artifacts (`m_-…gmail-style13ptbold`).
  - The Northwestern file sets Normal to **Cambria**. The Berkeley file sets docDefaults to 12 pt with Normal at 11 pt.
- **Takeaway:** users customize style definitions, so **never infer meaning from exact sizes**. Identify styles by ID or name, then compare sizes *relative* to the Normal and Underline sizes.

### 3.3 Exact style XML (Verbatim 6.0.0, GPL-3.0) **[V]**

```xml
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:aliases w:val="Tag"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:link w:val="Heading4Char"/><w:uiPriority w:val="3"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="40" w:after="0"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:rFonts w:eastAsiaTheme="majorEastAsia" w:cstheme="majorBidi"/><w:b/><w:iCs/><w:sz w:val="26"/></w:rPr></w:style>

<w:style w:type="character" w:customStyle="1" w:styleId="Style13ptBold"><w:name w:val="Style 13 pt Bold"/><w:aliases w:val="Cite"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="6"/><w:qFormat/><w:rPr><w:b/><w:bCs/><w:sz w:val="26"/><w:u w:val="none"/></w:rPr></w:style>

<w:style w:type="character" w:customStyle="1" w:styleId="StyleUnderline"><w:name w:val="Style Underline"/><w:aliases w:val="Underline"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="7"/><w:qFormat/><w:rPr><w:b w:val="0"/><w:sz w:val="22"/><w:u w:val="single"/></w:rPr></w:style>

<w:style w:type="character" w:styleId="Emphasis"><w:name w:val="Emphasis"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="8"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:b/><w:i w:val="0"/><w:iCs/><w:sz w:val="22"/><w:u w:val="single"/><w:bdr w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:rPr></w:style>
```

(Heading1 additionally has `<w:pageBreakBefore/><w:pBdr>` with top, left, bottom and right each `single w:sz="24"` (space 1/4/1/4), `<w:jc w:val="center"/>` and `<w:outlineLvl w:val="0"/>`.)

The Verbatim template's `settings.xml` sets `compatibilityMode = 15` (Word 2013+). **[V]**

### 3.4 Keyboard shortcuts (defaults; Cmd replaces Ctrl on Mac) **[V]**

| Key | Function | Alternate |
|---|---|---|
| F1 | Verbatim Help | Ctrl/Cmd+Alt+1 |
| **F2** | **Paste Text** (unformatted; always use this, not Ctrl+V) | Ctrl/Cmd+Alt+2 |
| **F3** | **Condense** (current pilcrow/integrity mode) | Ctrl/Cmd+Alt+3; Ctrl+F3 = no pilcrows; Ctrl+Alt+F3 = with pilcrows; Ctrl+Alt+Shift+F3 = uncondense |
| F4 / F5 / F6 / F7 | **Pocket / Hat / Block / Tag** | Ctrl/Cmd+Alt+4/5/6/7 |
| **F8** | **Cite** | Ctrl/Cmd+Alt+8; Ctrl+F8 Auto Format Cite; Alt+F8 Copy Previous Cite |
| **F9** | **Underline** (toggles) | Ctrl/Cmd+Alt+9; Alt+F9 Auto Underline (uses the tag's words) |
| **F10** | **Emphasis** | Ctrl/Cmd+Alt+0; Ctrl+Alt+F10 Auto-Emphasize First letters |
| **F11** | **Highlight** (toggle, current color) | Ctrl/Cmd+Alt+- |
| **F12** | **Clear formatting** (keeps highlight) | Ctrl/Cmd+Alt+=; Ctrl+F12 Update Styles |
| Alt+F3 / Ctrl+8 | **Shrink** | Shrink All / Unshrink All in the menu |
| **Backtick/tilde key** (next to 1) | **Send to Speech** (selection, or the current card/block/hat/pocket). In the speech doc it **marks the card** instead | Ctrl/Cmd+Alt+Right; Alt+backtick = send to end of speech doc |
| Ctrl/Cmd+Alt+Up/Down/Left | Move heading up/down; delete heading | Ctrl+Alt+Shift+Down = move to bottom; Ctrl+Alt+A = select heading and contents |
| Ctrl/Cmd+Shift+N / U / S | New speech / copy to USB / share to Tabroom | |
| Ctrl/Cmd+Shift+Q | Cite-request card (caselist) | |
| Alt+F1 | Verbatim Settings | |

The docs are internally inconsistent here. The shortcut list says Ctrl+F3 is "Condense No Pilcrows", while the intro paragraph gives Alt+F3 as an example of condensing without pilcrows, and the list assigns Alt+F3 to Shrink. The source code (`Settings.bas`) binds Ctrl+F3 to `CondenseNoPilcrows` and Ctrl+Alt+F3 to `CondenseWithPilcrows`. **[V]**

### 3.5 Macro behaviors our tools must mirror or undo **[V]** (from VBA source)

- **Finding the card text** (`Paperless.SelectCardTextRange` / `IdentifyCite`):
  - Start from the Tag and take paragraphs until the next heading.
  - Then drop leading paragraphs while at least two paragraphs remain *and* the paragraph looks like a cite. A paragraph looks like a cite if any of these hold:
    - it has a heading outline level;
    - it starts with `[`, `(`, `<` or `*`;
    - it contains `http://` or `https://`;
    - it is under 50 characters and contains "omitted", "edited", "modified" or "sic";
    - it contains any Cite-styled run.
- **Speech-doc marker.** In the active speech doc, the backtick/tilde key inserts the text `~ Marked HH:MM ~` (plus a trailing space) in **red, 16 pt** at the cursor.
- **Speech docs** are any document whose file name contains "speech" (case-insensitive).
  - The ribbon names new ones `Speech <2AC|1NC…> <Tournament> <Round> vs <Opponent>`, or `Speech 2AC M-D <h>AM|PM` when there is no Tabroom data.
  - The "Strip Speech When Sharing" setting removes "Speech" from the name when sharing.
- **Invisibility Mode** sets `Font.Hidden` (i.e. `w:vanish`) on non-highlighted card text and clears it when switched off. If a file is saved mid-mode it will contain `w:vanish` runs. The importer must **not drop hidden text**; flag it instead.
- **Cite Request / "Citeify"** (for caselist disclosure): a card over 50 words keeps its first 15 and last 15 words, replaces the middle with `AND` on its own line, and removes highlighting.
- **Convert To Default Styles** heuristics (worth reusing in our importer):
  - Any paragraph at outline level 1–4 becomes Heading 1–4.
  - A custom style name containing "cite" becomes Cite, unless the name starts with underline, emphasis, normal, card, analytic or body.
  - A name containing "emphasi" becomes Emphasis.
  - A name containing "underline" becomes Underline, unless it says no, not, un-, non or non- underline.
  - A paragraph style starting with "analytic" becomes Tag.
  - *Fix Fake Tags*: a body paragraph that is entirely bold and larger than the Underline size becomes Tag.
- **Omission notes** that Shrink skips: square- or angle-bracketed text with a word plus the capitalized word "Omitted", e.g. `[ Table Omitted ]` or `< Figure Omitted >`.
- **Standardize Highlighting** (optionally with one exception color) converts every `w:highlight` in the document to one color. Verbatim's color names map to `w:highlight` values as follows (inferred by lining up Word's `WdColorIndex` enumeration with `ST_HighlightColor`; consistent with the samples, where Berkeley's cyan is "Turquoise" and Michigan7's green is "Bright Green"): **[I]**
  - Yellow → `yellow`
  - Bright Green → `green`
  - Turquoise → `cyan`
  - Pink → `magenta`
  - Blue → `blue`
  - Red → `red`
  - Dark Blue → `darkBlue`
  - Teal → `darkCyan`
  - Green → `darkGreen`
  - Violet → `darkMagenta`
  - Dark Red → `darkRed`
  - Dark Yellow → `darkYellow`
  - Dark Gray → `darkGray`
  - Light Gray → `lightGray`
  - Black → `black`
  - White → `white`

### 3.6 Navigation Pane

- Word's Navigation Pane lists paragraphs whose outline level is 1–9. Built-in Heading N styles are wired to outline level N; custom styles need an explicit outline level. **[V]** (Microsoft support page; Office Watch 2025)
- Verbatim relies on this for its Pocket/Hat/Block/Tag outline, drag-and-drop reordering and "Show Heading Levels". Empty heading paragraphs show up as blank lines, which Verbatim's *Remove Blanks* fixes. **[V]**
- **Exporter rule:** emit `Heading1`–`Heading4` with explicit `w:outlineLvl` 0–3 in the style's `pPr`, as Verbatim does. Never write empty heading paragraphs.

### 3.7 Google Docs and other equivalents

- **"Debate Template" Google Docs add-on** (Matthew Fahrenbacher). Google Workspace Marketplace shows 420,000+ installs, last updated 2026-06-08. **[V]**
  - Mapping, per the Atlanta Urban Debate League how-to: Pocket, Hat, Block and Tag are nested outline headings; Cite has no outline entry; Emphasis = underline + bold; Shrink takes non-underlined text to 8 pt; there is a speech doc with "send to". **[V]**
  - Reviews complain about lag and missing keyboard shortcuts. **[V]**
- **Verbatim's own Google Docs port** exists only on the **`dev` branch**, as Apps Script `gdocs/src/server/format.js`. It is unreleased. **[V]** Its mapping:
  - Pocket/Hat/Block/Tag → Google `HEADING1`–`HEADING4`.
  - cite → direct **bold + 13 pt**.
  - underline → direct underline.
  - emphasis → **bold**.
  - highlight → `setBackgroundColor(#ffff00)` by default.
  - clear → bold off, underline off, 11 pt.

  In other words, Google Docs versions store **direct formatting only**. The dev branch also holds an Office Web Add-in port (`owa/`) and a `browser/` folder, both unreleased. **[V]**
- **Others listed on the Verbatim docs "Other projects" page:** **[V]**
  - DebateX and Docs Hotkey (Google Docs).
  - LibreDebate (LibreOffice, unmaintained) and Synergy (deprecated Word template).
  - Verbatim for Obsidian.
  - **CardMirror**, a ProseMirror-based editor that claims lossless .docx round-trip with Verbatim / Advanced Verbatim. Its license is **PolyForm Noncommercial 1.0.0**, so do not copy its code into a commercial product.
  - Card-cutting tools: Cite Creator, Collage, Cut-It.Cards, Evidencer, CardCutPro, and OpenAI Card Cutting (beta).
  - Card search: Logos, Vault.
  - Evidence sharing: share.tabroom.com, SpeechDrop.

---

## 4. Real OOXML from the camp files **[S]**

Text content is replaced with placeholders. Every element and attribute is verbatim from the file, except that `w:rsid*`, `w14:paraId`/`textId`, `w:proofErr` and `w:lang` noise was removed, and in the Michigan7 excerpts the repeated `<w:rFonts w:asciiTheme="minorHAnsi" …/>` was removed.

### 4.1 Tag paragraph (Northwestern; tag words directly underlined)

```xml
<w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr>
  <w:r><w:t xml:space="preserve">[plain text]</w:t></w:r>
  <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>[underlined text]</w:t></w:r>
  <w:r><w:t>[plain text]</w:t></w:r>
  <w:r><w:t xml:space="preserve">[plain text]</w:t></w:r>
  <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">[underlined text]</w:t></w:r>
  <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>[underlined text]</w:t></w:r>
</w:p>
```

The Berkeley tags are plain: `<w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr><w:r><w:t xml:space="preserve">[tag]</w:t></w:r></w:p>`.

### 4.2 Cite paragraphs

Northwestern (first name plain, "Last YY" in Cite style, rest plain on the same line):

```xml
<w:p>
  <w:r><w:t xml:space="preserve">[first name] </w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="Style13ptBold"/></w:rPr><w:t>Deighton 19</w:t></w:r>
  <w:r><w:t>[, qualifications, date, “title” URL]</w:t></w:r>
</w:p>
```

Berkeley (short cite split across three Cite runs, then a parenthetical full cite):

```xml
<w:p>
  <w:r><w:rPr><w:rStyle w:val="Style13ptBold"/></w:rPr><w:t xml:space="preserve">Berry &amp; </w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="Style13ptBold"/></w:rPr><w:t>Huckins</w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="Style13ptBold"/></w:rPr><w:t xml:space="preserve"> ’19</w:t></w:r>
  <w:r><w:t xml:space="preserve"> ([first author, quals, and second author's first name] </w:t></w:r>
  <w:r><w:t>[second author's last name]</w:t></w:r>
  <w:r><w:t xml:space="preserve">[, quals, “title,” date, publisher] </w:t></w:r>
  <w:r><w:t>[URL]</w:t></w:r>
  <w:r><w:t>)</w:t></w:r>
</w:p>
```

Michigan7 (the paragraph mark is set to 8 pt; the short cite is followed by a bracketed full cite):

```xml
<w:p><w:pPr><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:pPr>
  <w:r><w:rPr><w:rStyle w:val="Style13ptBold"/></w:rPr><w:t xml:space="preserve">Specktor 19 </w:t></w:r>
  <w:r><w:t>[full cite, itself wrapped in square brackets: Full Name, quals, "title," publication, M-D-YYYY, URL]</w:t></w:r>
</w:p>
```

### 4.3 Card body runs

Northwestern (yellow; **8 pt** shrink; Emphasis and StyleUnderline; the first eight runs, contiguous):

```xml
<w:p><w:pPr><w:rPr><w:rStyle w:val="StyleUnderline"/></w:rPr></w:pPr>
  <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>[plain 8pt text]</w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="Emphasis"/><w:highlight w:val="yellow"/></w:rPr><w:t>[emphasis highlighted text]</w:t></w:r>
  <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">[plain 8pt text]</w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="StyleUnderline"/><w:highlight w:val="yellow"/></w:rPr><w:t>[underlined highlighted text]</w:t></w:r>
  <w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">[plain 8pt text]</w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="Emphasis"/><w:highlight w:val="yellow"/></w:rPr><w:t>[emphasis highlighted text]</w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="StyleUnderline"/><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">[underlined highlighted text]</w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="StyleUnderline"/></w:rPr><w:t xml:space="preserve">[underlined text]</w:t></w:r>
  …  (later runs include <w:rStyle w:val="Emphasis"/> with no highlight = emphasized but not read)
</w:p>
```

Berkeley (**cyan**): the same pattern, e.g. `<w:r><w:rPr><w:rStyle w:val="StyleUnderline"/><w:highlight w:val="cyan"/></w:rPr>…` and `<w:r><w:rPr><w:sz w:val="16"/></w:rPr>…`.

Michigan7 (**green**, **7 pt** shrink): `<w:r><w:rPr><w:sz w:val="14"/></w:rPr>…`, `<w:rPr><w:rStyle w:val="StyleUnderline"/><w:highlight w:val="green"/></w:rPr>`, `<w:rPr><w:rStyle w:val="Emphasis"/><w:highlight w:val="green"/></w:rPr>`.

### 4.4 Gotchas visible in these snippets

- **The paragraph-mark `pPr/rPr` is not run formatting.** `<w:pPr><w:rPr>…</w:rPr></w:pPr>` (e.g. `sz 16` or `rStyle StyleUnderline`) formats only the paragraph mark. Never apply it to the runs.
- **Highlighting is always direct formatting** in Verbatim files, never part of a style. Shrinking is direct `w:sz` (+`w:szCs`).
- **Emphasis implies underline.** The Emphasis style includes `u single`, so emphasized text counts as underlined for "what could be read".
- **Runs often sit inside wrappers.** Cites can wrap runs in `<w:hyperlink r:id=…>` (20 in the Michigan7 file). Also expect `w:smartTag`, `w:sdt`, `w:fldSimple`, `w:ins`/`w:del` and `mc:AlternateContent`.
- **Verbatim artifacts to strip on import:** pilcrows `¶` (U+00B6, 6 pt), `~ Marked HH:MM ~` markers (red, 16 pt) and omission notes.
- **Brackets and ellipses are often in the source itself.** `[the SDGs]` inside a quotation and "…" in quoted academic prose both come from the original authors [S]. You cannot tell a debater's insertion from the source's own without the source text.

---

## 5. Citation conventions

### 5.1 NSDA (High School Unified Manual 2026–27) **[V]**

The NSDA web page lists version 2027.1.0 (updated 2026-08-01). The live Google Doc read on 2026-09-25 shows **Version 2027.1.2**. Evidence Rules are **Section 7**.

- **7.1.A Evidence defined.** Debaters answer for the validity of all evidence they introduce. Evidence means facts, statistics or examples attributable to a specific, identifiable, authoritative source. Unattributed ideas are the student's opinion.
- **7.1.B Oral citation.** At minimum the primary author's last name and year of publication. For later cards from the same source, the author's name is enough. The full written citation must be supplied on request.
- **7.1.C Written citation.** Required *to the extent the original source provides it*:
  1. full name of the primary author and/or editor;
  2. publication date;
  3. source;
  4. article title;
  5. date accessed (digital evidence);
  6. full URL, if applicable;
  7. author qualifications;
  8. page numbers.
- **7.1.D Paraphrasing.** Held to the same citation and accuracy standard as quoted text. The original text being paraphrased must be available.
- **7.1.F Availability.** Material presented must be provided on request. Acceptable original sources include:
  - a live web page or a copy of it;
  - for print, **a copy of the evidence page plus the pages before and after** it;
  - published handbooks;
  - institute or **Open Evidence Project** pages.

  Debaters answer for the accuracy of evidence they got from others.
- **Appendix C:**
  - Reading only the name and year aloud is an accepted cite format, provided the full cite is available.
  - Two works by the same author must each be cited.
  - MLA and APA are *not* required.
  - Private correspondence is inadmissible (7.1.H).

### 5.2 College (NDT Standing Rule VII.B.1) **[V]**

- A full source citation must be available (on the card or in a master file): the author's name if given, the name of the publication, the **full date** and the **page number**.
- Paraphrases must be marked on the artifact and orally.
- Ellipses should follow MLA.

This **conflicts with NSDA 7.1.E**, which bans internal ellipses unless they are in the original. **HS debate follows NSDA, so our validator should ban ellipses we introduce.**

### 5.3 Community conventions **[V]** unless noted

- **Short cite forms:**
  - `Last YY`
  - `Last and Last YY` for two authors
  - `Last et al. YY` for three or more (LD Debate Prep)
  - The organization as author, e.g. "ELI, 2013"
  - `Anonymous YY` when there is no author (LD Debate Prep). Cite Creator instead falls back to the publication name, or "No Author".
  - `Last ND` / `No Date` when there is no date (LD Debate Prep). Cite Creator writes `xx-xx-xxxx`.
  - Current-year cards may use month/day, e.g. `Smith 5/19` or Verbatim's `9-25`.
- **Dates:** `M-D-YYYY` with dashes is the Verbatim and Cite Creator default (slashes optional). The samples also show `2/18/19` and `April 2019`. **[S]**
- **Qualifications:** give the credential relevant to the claim, not the most flattering one (Fiveable, LD Debate Prep, DebateCardAI). Samples show both "Senior Writer" style and full academic titles. **[S]**
- **Cutter attribution:** `//initials`, `/ck`, "cut by <name>". **[S]**
- **Accessed date:** "accessed 5-24-2021". **[S]** NSDA requires it for digital evidence.
- **Where to put it:** one-line cites are strongly preferred for machine processing (Verbatim docs).

### 5.4 Per-source-type templates (our recommendation, built on 7.1.C) **[I]**

| Type | Required beyond author, date and title | Notes |
|---|---|---|
| Journal article | journal, volume(issue), pages or article no., DOI/URL, accessed | Cite the page range actually quoted if available. Peer-reviewed flag |
| Think-tank / NGO report | organization (publisher), report number, URL, accessed | Organization-as-author when there is no byline ("CSIS 24") |
| News / magazine | outlet, full date, URL, accessed | Mark wire copy (AP/Reuters) as such |
| Government document | agency, document or report number (e.g. CRS RL34391), "updated" date, URL, accessed | Most U.S. federal works are public domain, which is useful for our own examples |
| Congressional testimony / hearing | committee, hearing title, date | Speaker's title as the qualification |
| Book / chapter | publisher, city (optional), edition, **page numbers**, editors for chapters | 7.1.F.2.b: keep the pages before and after available |
| Court opinion / statute | court, case name, reporter citation or docket, date / U.S.C. section | Author = judge for opinions |
| Podcast / video / speech transcript | show or channel, episode, **timestamp range**, URL, accessed; transcript source | Verbatim text must come from a transcript we store; flag auto-generated captions |
| Social media post | display name + **@handle**, platform, **date and time posted**, URL (permalink), accessed | Archive it (posts get deleted); the "qualifications" of the account holder |
| Preprint | server (arXiv/SSRN/medRxiv/bioRxiv), identifier + **version**, "preprint — not peer reviewed" | Link the published version if one exists |
| Dataset / web page with no date | site owner, page title, "ND", accessed (**required**) | Store an archived snapshot URL |

### 5.5 Qualifications policy (our recommendation) **[I]**

- Only credentials with a stored evidence URL, such as a byline, author bio page or institutional page, count as verified.
- AI may *suggest* a qualification but must never insert one unverified. Mark unverified qualifications visibly, or leave them out.
- Always use the credential as of the publication date. For example, "former" titles should be written as they stood when the piece was published.

---

## 6. Evidence ethics

### 6.1 NSDA rules **[V]**

- **7.1.E Ellipses.** Internal ellipses (…) are prohibited unless they reproduce the original document. A debater may skip words when reading, but the skipped text must still be present in the written card. The start and end of the read portion must be clearly marked (see 7.1.G.2).
- **7.1.G Marking.** Reading must be marked in two ways:
  1. **orally**, with a clear pause or "quote/unquote" or "mark the card";
  2. **in the written text**, where underlining what is read, highlighting what is read, and/or minimizing what is not read are named as definitive.
- **7.2.A Distortion.** Words added to or deleted from the text that significantly change the author's conclusion (e.g. deleting or adding "not"). **Unbracketed added words are distortion.**
- **7.2.B Non-existent evidence.** Any of:
  - the original source (or copies of the relevant pages) cannot be produced;
  - the source does not contain the evidence;
  - a paraphrase has no source to check it against;
  - the source is withheld on request.
- **7.2.C Clipping.** Claiming to have read all the highlighted and/or underlined text while actually skipping parts.
- **7.2.D Straw argument.** Presenting a position the author sets up in order to refute it as the author's own. This is allowed only if acknowledged when first read.
- **7.3 Procedure.** Formal in-round allegations are allowed for distortion, non-existent evidence and clipping. The round stops. The loser is whichever side is wrong about the allegation. Clipping decisions cannot be appealed.
- **7.4 Penalties.**
  - **Clipping, straw arguments and ellipses:** a loss and zero speaker points.
  - **Distortion and non-existent evidence:** a loss and **disqualification**. Producing the evidence within the post-round window may avoid disqualification.
- **Appendix C.** Cutting the first and last parts of one paragraph as two cards and omitting the middle, or paraphrasing with omissions, requires the full original language to be available.
- **Generative AI** (National Tournament section of the manual): generative AI **must not be cited as a source**. It may point students to articles, ideas and sources, but the original source of any quoted or paraphrased evidence must be available on request.

### 6.2 NDT Standing Rule VII.B (college; for context) **[V]**

- Misrepresenting which part of a quotation was read is prohibited.
- Examples given:
  - stopping before the end of a marked section without indicating where;
  - repeatedly skipping words or lines;
  - speaking too unclearly to tell what was read, in order to gain an advantage;
  - distributing documents after the speech that do not match what was read.
- Judges award a loss and zero speaker points for distortion or falsification.

### 6.3 Community norms (not codified) **[V]**

- **Marking** (The 3NR, Batterman 2014):
  1. Say "marked at <last word>".
  2. Insert a marker in the speech doc (Verbatim's backtick/tilde key).
  3. Send the **marked copy** before cross-examination or prep.
  4. Record yourself to catch clarity problems.
- **Highlighting to avoid clipping:** avoid fragmentary, multi-color highlighting and abbreviated fragments; highlight complete sentences in one color (3NR).
- **Miscutting:** underlining that changes the author's meaning, e.g. skipping a negation, is misrepresentation (NCPA "Shady Six"; Gandra & Tambe, Victory Briefs). The Victory Briefs proposal says a card as read must fairly represent the author as asserting everything that is read. It also says ellipses should never appear, and brackets should be avoided except for grammar.
- **Missing dates:** hurt credibility but should not cost the round (Gandra & Tambe).
- **Tournament of Champions:** I could not access TOC-specific rules (Tabroom pages need a login). One secondary source says the TOC uses NSDA rules. **[U]**

### 6.4 Where these rules land in our design

Section 12 turns them into automatic checks. The key principles are:

1. **Store the body as an exact excerpt** of a stored source snapshot.
2. **Represent every alteration explicitly** (insertion, omission) rather than editing text.
3. **Derive "what is read" from highlights**, falling back to underlines when there are no highlights.
4. **Check tag against body** as an advisory, never silently.
5. **Never let AI text into the body or cite as if it were a source.**

---

## 7. Highlighting practice

### 7.1 What good highlighting looks like **[V]**

- **Reads as grammatical-ish sentences** and keeps the **warrant** (the reason), not just the conclusion. It should be the shortest version that keeps the warrants. Highlighting part of a word is acceptable when it does not change the meaning (Zhou 2020).
- **Uses one color and highlights complete sentences.** Sparse or fragmentary highlighting, and abbreviations such as "prolif" for "proliferation", cause clipping and confusion (3NR).
- **Stays inside the underlined text.** Standard practice nests highlighting within underlining; 30 of 31 real cards comply. **[S]**
- **Is re-highlighted sparingly.** Re-highlighting the same card repeatedly over a season muddies which part was read (Wikipedia, *Evidence (policy debate)*, CC BY-SA). A search-engine summary also described a paper-era custom of re-highlighting over yellow with a darker color. I did not find that in the page text I read. **[U]**

### 7.2 Colors

- **No universal default.** Verbatim ships with yellow, but each camp standardized on its own color: cyan (Berkeley), green (Michigan7), yellow (Northwestern). **[S][V]**
- **Two-color conventions exist.** Verbatim's *Standardize Highlighting with Exception* exists precisely to reduce a document to two colors (default plus exception), e.g. for a partner's alternate reading or a shorter rebuttal version. **[V]**
- **Avoid light gray.** Verbatim warns of a Word save bug. **[V]**
- **Recommendation:**
  - Allow any of Word's 15 highlight colors.
  - Default to yellow, with the default configurable per team.
  - Support named highlight **layers** (e.g. "default", "1AR short") with one color per layer.
  - On export, write only one layer (or two, clearly distinguished) to avoid ambiguity. **[I]**

### 7.3 Ratio and "highlighting down"

- There is no codified ratio. The real-sample distribution in §2.7 (median ~17% of words, most cards 10–25%) is a usable **informational** baseline, not a rule.
- "Highlighting down" means making a shorter-read version of a card for later speeches. It is common practice but I found no authoritative write-up **[U]**. Model it as another markup layer on the *same* body; never cut the body text.

### 7.4 Good vs bad highlighting (public-domain CRS passage from §2.8)

| Version | Highlighted text as read aloud | Verdict |
|---|---|---|
| **A (good)** | "The PSC program has experienced significant cost growth and schedule delay. The ship’s delivery date has been delayed repeatedly, and the Coast Guard now expects it to be delivered in 2030, about six years later than the originally scheduled date. Much of the delay is due to the time it has taken to fully develop the design" | Grammatical. Keeps the magnitude (six years) **and the warrant** (the design took time). No qualifier dropped |
| **B (bad: conclusion-only / fragmentary)** | "cost growth … delay … 2030 … six years … oversight" | Not a sentence and no warrant. Invites clipping disputes, and an opponent cannot tell what the author claimed |
| **C (bad: qualifier stripped)** | "the Coast Guard … awarded the shipbuilder … an additional $951.6 million … all of this figure … constitute cost growth" | Drops "Much or" and "might" from *"Much or all of this figure might constitute cost growth"*, turning a hedged estimate into a certainty. With a tag like "PSC is $951.6M over budget" this is a **power tag** and close to distortion. Our validator flags hedge words skipped inside a highlighted sentence (rule V-7) and a tag number presented as certain when the body hedges it (V-8) |
| **D (hypothetical negation, not from a source)** | Source: "Sanctions are not likely to change the regime’s behavior." Highlighted: "Sanctions are … likely to change the regime’s behavior" | **Reverses the meaning.** The negation sits between two highlighted fragments of the same sentence, so the validator must return an **error** (NSDA 7.2.A spirit) |

---

## 8. DOCX technical details and implementation plan

### 8.1 `w:highlight` vs `w:shd`

- **`w:highlight`** (`ST_HighlightColor`) allows exactly: `black 000000, blue 0000FF, cyan 00FFFF, green 00FF00, magenta FF00FF, red FF0000, yellow FFFF00, white FFFFFF, darkBlue 000080, darkCyan 008080, darkGreen 008000, darkMagenta 800080, darkRed 800000, darkYellow 808000, darkGray 808080, lightGray C0C0C0, none`. **[V]** (ECMA-376 Part 4 via c-rex.net; Microsoft `HighlightColorValues`)
- **When both are present, highlight wins.** ISO 29500: if a run has both `w:shd` and `w:highlight`, the highlight supersedes the shading on display. **[V]**
- **Verbatim and Word files** use `w:highlight` only. None of the samples use `w:shd`. **[S]**
- **Google Docs `.docx` export** (tested on the NSDA manual, counting run-level `w:rPr` only):
  - a light-yellow background → `<w:shd w:fill="ffe599" w:val="clear"/>` (161 runs);
  - a gray background → `w:shd fill="d9d9d9"` (120 runs);
  - white → `<w:highlight w:val="white"/>` (186 runs);
  - no run-level `w:highlight="yellow"` at all;
  - `styles.xml` contains **no character styles**, and Heading 4 (`heading 4`) has **no `w:outlineLvl`**. **[V]**
- **Hypothesis:** Google writes `w:highlight` when the background exactly equals one of the 16 highlight RGBs and `w:shd` otherwise. The Verbatim Docs port's default `#ffff00` would then round-trip as `w:highlight="yellow"`. **[U]** This needs a controlled test in a scratch Google account.
- **Importer rule:** highlighted = `w:highlight ≠ none` **or** `w:shd/@w:fill` not in {`auto`, `FFFFFF`, empty}. Keep the hex value and map it to the nearest highlight color for display.
- **Exporter rule:** always write `w:highlight`. Verbatim macros (Standardize Highlighting, Remove Non-Highlighted Underlining, Invisibility Mode) and Word's highlighter only recognize `w:highlight`. **[V]**

### 8.2 Underline, emphasis, sizes, borders, toggles

- **`ST_Underline`** values: single, words, double, thick, dotted, dottedHeavy, dash, dashedHeavy, dashLong, dashLongHeavy, dotDash, dashDotHeavy, dotDotDash, dashDotDotHeavy, wave, wavyHeavy, wavyDouble, none. Treat everything except `none`, an absent element, and `w:val="0"`/`"false"` as underlined. Verbatim uses `single` (and `double` for Hat). **[V]**
- **Emphasis** is character style `Emphasis`: bold, italic explicitly off, underline single, same size as Underline. The box is `w:bdr` (`w:sz` in eighths of a point: 8 = 1 pt, 12 = 1.5, 18 = 2.25, 24 = 3). In Google-origin files emphasis arrives as direct bold+underline. **[V][S]**
- **Sizes** are `w:sz` in half-points (16 = 8 pt). Also emit `w:szCs` to match Word.
- **Toggle properties.** `w:b`, `w:i`, `w:caps`, `w:vanish` and others are *toggle properties* (ISO 29500 §17.7.3): across paragraph and character styles they toggle rather than override, while direct formatting sets them absolutely. `w:u`, `w:sz` and `w:highlight` are plain overrides. The importer's bold computation must follow toggle semantics; underline and size are simple overrides. **[V]**
- **`w:rPr` child order** follows a sequence schema (EG_RPrBase): rStyle, rFonts, b, bCs, i, iCs, caps, smallCaps, strike, dstrike, outline, shadow, emboss, imprint, noProof, snapToGrid, vanish, webHidden, color, spacing, w, kern, position, **sz, szCs, highlight, u**, effect, **bdr, shd**, fitText, vertAlign, rtl, cs, em, lang, eastAsianLayout, specVanish, oMath. The serializer must write children in this order. **[V]** (datypic schema)

### 8.3 Navigation Pane requirements for exports

- Use `w:pStyle` Heading1–4.
- Define the styles with **lowercase built-in names** (`heading 1` …; Verbatim, Word and Google all do this) and explicit `w:outlineLvl` 0–3.
- Add `w:aliases` Pocket, Hat, Block and Tag, so the style gallery shows "Heading 4,Tag" and so that VBA `Selection.Style = "Tag"` and Verbatim's name-based lookups resolve. **[V]** (Verbatim's RemoveExtraStyles expects names such as "Heading 4,Tag", "Style 13 pt Bold,Cite", "Style Underline,Underline")

### 8.4 Exact XML our exporter should write

A card in `document.xml`:

```xml
<w:p><w:pPr><w:pStyle w:val="Heading4"/></w:pPr><w:r><w:t xml:space="preserve">TAG TEXT</w:t></w:r></w:p>
<w:p>
  <w:r><w:rPr><w:rStyle w:val="Style13ptBold"/></w:rPr><w:t xml:space="preserve">O’Rourke 25</w:t></w:r>
  <w:r><w:t xml:space="preserve"> [Ronald O’Rourke, Specialist in Naval Affairs, …, accessed 9-25-2026] //XX</w:t></w:r>
</w:p>
<w:p>
  <w:r><w:rPr><w:rStyle w:val="StyleUnderline"/><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">The PSC program has experienced </w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="Emphasis"/><w:highlight w:val="yellow"/></w:rPr><w:t>significant cost growth and schedule delay</w:t></w:r>
  <w:r><w:rPr><w:rStyle w:val="StyleUnderline"/></w:rPr><w:t>.</w:t></w:r>
  <w:r><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t xml:space="preserve"> In March 2025, … </w:t></w:r>
  …
</w:p>
```

**Rules:**
- **Formatting sources:** character styles only for Cite, Underline and Emphasis. Direct `w:highlight` for highlighting. Direct `w:sz` only for shrinking non-underlined runs (if the user has shrink on).
- **Text runs:** always `xml:space="preserve"`. Escape `& < >`. Never emit `w:vanish`.
- **Condense modes:**
  - (a) paragraphs: one `w:p` per source paragraph;
  - (b) pilcrows: `¶ ` runs at `w:sz=12`, not underlined;
  - (c) merged: one paragraph.
- **Marked copy:** insert `<w:r><w:rPr><w:color w:val="FF0000"/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">~ Marked 10:32 ~ </w:t></w:r>` at the mark, matching Verbatim.
- **Metadata:** neutral `docProps/core.xml`; **no `w:attachedTemplate`**. Whether a bare "Debate.dotm" relative target helps Verbatim attach automatically is **[U]**; test before adding it. Include `w:compat/compatibilityMode=15` in `settings.xml`.

**Recommended clean-room `styles.xml` core.**
- Values mirror Verbatim 6 defaults for interoperability; names, IDs and aliases must match exactly.
- Because the Verbatim template is GPL-3.0, **write our own `styles.xml`** rather than copying `Debate.dotm`'s file wholesale, and have counsel confirm. **[I]**
- Ship: `docDefaults` (Calibri via theme or explicit; `sz 22`; spacing after 160, line 259); `Normal` (aliases Normal/Card); `Heading1`–`Heading4` exactly as tabled in §3.2; `Heading1Char`–`Heading4Char` (linked); `Style13ptBold`; `StyleUnderline`; `Emphasis` (with optional `w:bdr` from a user preference); `Hyperlink` (so URLs render); `DefaultParagraphFont`/`TableNormal`/`NoList` defaults.

### 8.5 Generating .docx in Node: evaluation **[E][V]**

| Option | Verdict | Evidence |
|---|---|---|
| **`docx` 9.7.2** (MIT; already a dependency) via `styles.default.headingN` + `characterStyles` | Works for runs, but **not faithful**. Heading names come out as "Heading 4" (capitalized), with **no `w:aliases`** and no `outlineLvl` unless added. It always adds Title, Heading5/6, Strong, ListParagraph, Hyperlink and footnote styles (its defaults color headings blue unless overridden). **Emits `<w:highlightCs>` next to every highlight** unless you pass `highlightComplexScript:false`. I found no `highlightCs` child of `w:rPr` in the Open XML SDK documentation, so it is a probable schema deviation whose effect on Word is untested **[U]** | Generated `exp_a.docx`; inspected `styles.xml` and `document.xml` |
| **`docx` + `externalStyles`** (our own `styles.xml`) | **Produces duplicate style IDs**, because `docx` prepends its defaults. Verified: `Heading4` twice. Needs a post-processing de-duplication step | `exp_b.docx` |
| **Own serializer + fixed package template** (recommended) | Full control: aliases, lowercase names, outline levels, rPr order, no stray elements, deterministic bytes that are easy to snapshot-test. Card documents only need `p`/`r`/`t`/`rPr`/`pPr`/`hyperlink`, and optionally `comments.xml`. Zip with **`fflate`** (already a dependency) | Card structure matches the real files in §4 |
| docxtemplater 3.71 (MIT per npm) | Fine for fill-in templates, but a speech doc is dynamic run-level markup, so the serializer is still needed | npm registry |
| html-to-docx 1.8.0 | Last published 2023; HTML → OOXML mapping would lose style semantics | npm registry |

**Recommendation.**
- Build `exportDocx(nodes)` on a vendored minimal package: `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml`, `word/settings.xml`, `word/_rels/document.xml.rels`, `docProps/core.xml`, `docProps/app.xml`, plus optional `fontTable.xml`, `theme1.xml`, `comments.xml`.
- If the team prefers `docx` for other document types, **isolate** speech-doc export from it, or post-process with fflate.
- **Test matrix before shipping:**
  - Word for Windows and Mac, with and without Verbatim 6: Navigation Pane, F-keys on our styles, Condense, Shrink, Send to Speech, Standardize Highlighting, "Auto Format Cite".
  - Word Online (viewing only).
  - Google Docs import and re-export.
  - LibreOffice.
  - Open XML SDK schema validation.

  None of this was possible in this environment (no Word or LibreOffice installed). **[U]**

### 8.6 Parsing .docx in Node

- **mammoth 1.12.3** (BSD-2) **[V]**:
  - Semantic HTML only.
  - Reads `w:sz` but **never outputs size**.
  - Outputs highlights only via an explicit `highlight[color='…']` mapping (added in 1.8.0).
  - Ignores `w:shd` and borders.
  - Its `u`, `b` and `highlight` matchers see **explicit** formatting only, not formatting inherited from styles, so StyleUnderline needs an `r[style-name='Style Underline']` mapping.
  - Recent releases fixed DoS and prototype-pollution issues. Its changelog advises processing untrusted documents in a separate thread with a timeout.
  - Verdict: fine for previews, **not** for lossless card import.
- **docx-preview 0.4.1** (Apache-2.0): renders to HTML in the browser with styles. Good for a "view original" pane, not for extraction. **[V]** (npm metadata; capability claim from its README not re-verified)
- **Recommended: direct OOXML parsing** with **fflate** (`unzipSync` with a `filter` limited to `word/document.xml`, `styles.xml`, `numbering.xml`, `_rels`, `comments.xml`) and **fast-xml-parser 5.11.1** configured as below. `@xmldom/xmldom` 0.9 or `saxes` are strict-XML alternatives.

  ```ts
  new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true,
    trimValues: false,        // keep " " runs and trailing spaces   [E]
    parseTagValue: false,     // "007" must not become 7             [E]
    parseAttributeValue: false,
    processEntities: true, htmlEntities: true, // decode &#x2019; etc. [E]
    ignoreDeclaration: true, ignorePiTags: true,
  })
  ```

  The three samples parsed in 15–28 ms each (Node 22). **[E]**
- **Security:**
  - Reject `<!DOCTYPE`.
  - Cap entry count, uncompressed size and compression ratio before inflating (zip bombs).
  - Parse in a worker with a timeout.
  - Ignore or strip `vbaProject.bin` (`.docm`/`.dotm`).
  - Never follow external relationships.
  - Discard `attachedTemplate` paths and `docProps` personal data.

**Style resolution algorithm (per run):**
1. Start from `docDefaults/rPrDefault`.
2. Apply the paragraph style chain (`basedOn`, from the root down).
3. Apply the character style chain.
4. Apply direct `rPr`.
5. Apply toggle semantics for `b`, `i`, `caps`, `vanish`.
6. **Ignore `pPr/rPr`** (the paragraph mark).

**Role classification (per style), in order:**
1. **ID table:**
   - `Heading1`–`Heading4` → levels 1–4
   - `Style13ptBold`, `StyleStyleBold12pt` → cite
   - `StyleUnderline`, `StyleBoldUnderline`, `underline` → underline
   - `Emphasis` → emphasis
2. **Primary name** (`w:name`), then **first alias only**: `heading N`, `Pocket`/`Hat`/`Block`/`Tag`, `Cite`, `Underline`, `Emphasis`.
3. **Verbatim's substring heuristics** (§3.5).
4. **Outline level** of the paragraph or style.
5. **Formatting fallback:**
   - a body paragraph that is entirely bold and larger than the underline size → Tag;
   - leading bold runs at or above body size in the paragraph after a tag → short cite;
   - direct bold+underline in the body → emphasis (Google-origin files).

**Card segmentation:** mirror Verbatim's `SelectCardTextRange`/`IdentifyCite` (§3.5):
- tag = H4;
- cite paragraph(s) = leading cite-like paragraphs, while at least two paragraphs remain;
- body = the rest, up to the next heading;
- empty after the tag → analytic.
- Build the short cite by concatenating all Cite-styled runs (they may be non-contiguous). The full cite is the whole cite paragraph.

**Artifact normalization during import:**
- pilcrow `¶` → paragraph break;
- `~ Marked … ~` (red, large) → remove and record a mark;
- omission notes → Omission objects;
- `w:br` → newline, `w:tab` → space, `w:noBreakHyphen` → `-`, `w:softHyphen` → drop;
- `w:vanish` text kept, with a flag;
- tracked changes: include `w:ins`, drop `w:del`, and flag;
- hyperlinks: keep the text and capture the URL from the relationships.

### 8.7 Compatibility summary

| Target | Headings / Nav Pane | Cite / Underline / Emphasis | Highlight | Shrink | Box | Confidence |
|---|---|---|---|---|---|---|
| Word + Verbatim 6 | Yes (Heading1–4 + outlineLvl) | Yes (style names match; Verbatim may re-apply the user's style settings) | Yes | Yes | Yes (user setting) | [V] for structure; runtime behavior [U] until tested |
| Word, no Verbatim | Yes | Yes (our embedded definitions) | Yes | Yes | if defined | [I] |
| Google Docs | Heading 1–4 → Google headings | Flattened to direct bold, underline and size | Background color | Yes | **Lost** (no text borders) | [U] import direction; [V] export shape |
| LibreOffice | expected yes | expected yes | expected yes | yes | expected yes | [U] |

---

## 9. Other formats and workflows

- **Speech doc.** The single document a debater reads from, holding cards, analytics and blocks in speaking order, built by "Send to Speech". It is shared **before** the speech via share.tabroom.com (Verbatim-integrated), an email chain, USB or SpeechDrop. **[V]**
- **Marked copy.** The speech doc after the speech with `~ Marked HH:MM ~` wherever reading stopped. It is sent immediately after the speech (3NR). **[V]**
- **Card doc / post-round doc.** A compilation of cards (often from several speech docs) for the judge after the round. Verbatim's **Merge** button exists to assemble one. The term "card doc" itself comes from community usage in judge paradigms, which I could not read (Tabroom login). **[V]/[U]**
- **Open source disclosure.** Speech docs uploaded to openCaselist are renamed to `{School}-{Team}-{Side}-{Tournament}-{Round}.docx`; spaces become hyphens; "All" becomes "All-Rounds". Allowed extensions: `.docx .doc .pdf .rtf .txt`. **[V]** (caselist `postRound.js`) Cite entries use the "first 15 words / AND / last 15 words" format. **[V]**
- **File naming.** Verbatim generates names like `Speech 1NC Tournament Round vs Opponent`. **[V]**
  - Recommended defaults:
    - working copy: `Speech 1NC - {Tournament} - R{n} - vs {Opp}.docx` (keeping "Speech" lets Verbatim users treat it as a speech doc);
    - shared copy: `1NC - {Tournament} - R{n} - vs {Opp}.docx`;
    - marked copy: `… - Marked.docx`;
    - post-round compilation: `Card Doc - {Tournament} - R{n}.docx`.
- **Google Docs.** Some teams work in Docs with the Debate Template add-on and download `.docx` to exchange. Expect direct formatting and `w:shd` highlights (§8.1). **[V]**
- **PDF.** Occasionally used to share with judges or on Chromebooks, **[U]** for how common this is. Treat PDF as a *source* format for cutting (extract text; dehyphenate line-end breaks carefully), not as an evidence-import format: highlight and style semantics are lost.

---

## 10. Recommended card data model

Principles:
- **The body is immutable verbatim text** plus a source mapping.
- **All marking is stored as ranges** over that text, in versioned layers.
- **Citation data is structured** and rendered through templates.
- **AI output is kept separate**, and provenance is complete.

```ts
// Offsets: UTF-16 code units into CardBody.text (JS-native). Invariant: never split a surrogate pair.
type Range = { start: number; end: number };            // half-open [start, end)
type HighlightColor =
  | 'yellow' | 'green' | 'cyan' | 'magenta' | 'blue' | 'red' | 'darkBlue' | 'darkCyan'
  | 'darkGreen' | 'darkMagenta' | 'darkRed' | 'darkYellow' | 'darkGray' | 'lightGray' | 'black' | 'white';

interface Card {
  id: string; kind: 'card'; version: number;
  tag: { text: string; underline?: Range[] };           // tag-internal underline kept for import fidelity
  citation: Citation;
  body: CardBody;
  markups: Markup[];                                     // ≥1; one is `isDefault`
  aiAnnotations: AiAnnotation[];                         // never rendered into body/cite
  provenance: Provenance;
  validation?: ValidationReport;                         // last run of §12 rules
  createdBy: string; createdAt: string; updatedAt: string;
}

interface Analytic { id: string; kind: 'analytic'; text: string; authorId: string; aiGenerated: boolean }

interface CardBody {
  text: string;                  // NFC; paragraph breaks = '\n'; no pilcrows, markers, or omission notes
  segments: Array<{ body: Range; source: Range }>;       // map into SourceSnapshot.normalizedText (usually 1 segment)
  omissions: Array<{
    at: number;                  // body offset where the gap sits
    kind: 'figure' | 'table' | 'image' | 'footnote' | 'paragraphs' | 'text';
    note: string;                // rendered, Verbatim-compatible: "[ Table Omitted ]"
    omittedSource?: Range;       // what was skipped (for audit/validation)
  }>;
  insertions: Array<{            // debater-added bracketed text (discouraged; always rendered in [ ])
    at: number; text: string;
    kind: 'clarification' | 'grammar' | 'gendered-language' | 'sic' | 'other';
    replacesSource?: Range;      // if it substitutes words
  }>;
}

interface Markup {               // a "cut"/highlighting layer; re-highlighting = new Markup, never new body
  id: string; label: string;     // 'default', '1AR short', partner name…
  isDefault: boolean; authorId: string; createdAt: string;
  underline: Range[];            // merged, sorted, non-overlapping
  emphasis: Range[];             // ⊆ underline (normalized on save)
  highlight: Array<Range & { color: HighlightColor; sourceHex?: string }>; // sourceHex keeps w:shd fill on import
  readMode: 'highlight' | 'underline' | 'all';           // derived default: highlight if any, else underline
  presentation: { shrinkNonUnderlined: boolean; shrinkPt: 8 | 7 | 6 | 5 | 4; condense: 'paragraphs' | 'pilcrows' | 'merge'; emphasisBox: 0 | 1 | 1.5 | 2.25 | 3 };
}

interface Citation {
  sourceType: 'journal' | 'news' | 'magazine' | 'thinkTank' | 'government' | 'testimony' | 'legislation' | 'court'
    | 'book' | 'bookChapter' | 'podcast' | 'video' | 'socialPost' | 'preprint' | 'blog' | 'report' | 'dataset' | 'website' | 'other';
  authors: Array<
    | { kind: 'person'; given?: string; family: string; suffix?: string; qualifications: Qualification[] }
    | { kind: 'org'; name: string; abbreviation?: string; qualifications: Qualification[] }>;
  editors?: Citation['authors'];
  published: { year: number; month?: number; day?: number; precision: 'day' | 'month' | 'year'; raw?: string } | null; // null ⇒ "ND"
  updated?: Citation['published'];
  title?: string; containerTitle?: string; publisher?: string;
  volume?: string; issue?: string; pages?: string; edition?: string;
  identifiers?: { doi?: string; isbn?: string; arxiv?: string; ssrn?: string; reportNumber?: string };
  url?: string; archivedUrl?: string; accessed?: string;  // ISO date; required for digital sources
  timestamp?: string;                                     // AV: "00:12:31–00:13:05"
  social?: { handle: string; platform: string; postedAt: string };
  peerReview?: 'peer-reviewed' | 'preprint' | 'not-peer-reviewed' | 'unknown';
  cutter?: { initials: string; userId?: string };
  notes?: string[];                                       // e.g. "Modified for gendered language", "Table omitted"
  overrides?: { shortCite?: string; fullCite?: string };  // user edits win; validator still checks elements
}

interface Qualification { text: string; evidenceUrl?: string; source: 'byline' | 'bio-page' | 'user' | 'ai-suggested'; verified: boolean; verifiedAt?: string }

interface Provenance {
  origin: 'cut' | 'import-docx' | 'import-gdocs' | 'manual';
  source?: { snapshotId: string; url: string; finalUrl: string; retrievedAt: string; httpStatus: number;
             contentType: string; sha256: string; extractor: { name: string; version: string }; archiveUrl?: string };
  import?: { fileName: string; fileSha256: string; paragraphIndex: number; importerVersion: string;
             styleRoles: Record<string, 'tag' | 'cite' | 'underline' | 'emphasis' | 'pocket' | 'hat' | 'block'>;
             warnings: string[] };                        // e.g. "w:vanish text present", "unverified brackets"
  ai?: { model: string; promptVersion: string; tasks: Array<'find-passage' | 'suggest-tag' | 'suggest-underline'
         | 'suggest-highlight' | 'extract-citation' | 'suggest-quals'>; generatedAt: string; userAccepted: boolean; userEdited: boolean };
  verification: { status: 'exact' | 'normalized' | 'fuzzy' | 'unverified' | 'failed'; checkedAt: string; diff?: string };
  history: Array<{ at: string; by: string; change: string }>;
}

interface AiAnnotation { id: string; kind: 'summary' | 'warrants' | 'weaknesses' | 'answers' | 'context'; text: string;
  model: string; createdAt: string; visibility: 'private' | 'team' }  // export only on request (e.g. as Word comments)

interface SourceSnapshot { id: string; url: string; retrievedAt: string; sha256: string;
  normalizedText: string; rawStorageKey: string; license?: string } // store for verification; don't redistribute

interface SpeechDoc { id: string; speech: '1AC' | '1NC' | '2AC' | '2NC' | '1NR' | '1AR' | '2NR' | '2AR' | 'other';
  tournament?: string; round?: string; opponent?: string; side?: 'aff' | 'neg';
  items: Array<{ kind: 'pocket' | 'hat' | 'block'; text: string }
    | { kind: 'card'; cardId: string; markupId: string } | { kind: 'analytic'; analyticId: string }>;
  marks: Array<{ itemIndex: number; bodyOffset: number; at: string }> } // → "marked copy" export
```

**How this maps to .docx:**

| Model field | .docx rendering |
|---|---|
| Tag | `Heading4` |
| Short cite | `Style13ptBold` run |
| Rest of cite | plain run on the same line |
| Underline | `StyleUnderline` |
| Emphasis | `Emphasis` |
| Highlight | direct `w:highlight` |
| Non-underlined text | direct `w:sz` if `presentation.shrinkNonUnderlined` is on |
| Omissions | rendered as the stored note, not shrunk |
| Insertions | rendered inside `[ ]` |
| Analytics | `Heading4` |
| AI annotations | never written, except as optional Word comments |

---

## 11. Default citation template (editable)

Use **Cite Creator's placeholder syntax** so users can paste their existing custom formats, and add a few placeholders of our own. Empty placeholders drop out together with their adjacent punctuation, as Cite Creator's cleanup does.

- **From Cite Creator:** `%author% %first% %last% %y% %quals% %date% %title% %publication% %url% %accessed% %linebreak%`
- **Ours:** `%short%` (computed short cite), `%month% %day% %year%` (date parts), `%publisher% %volume% %issue% %pages% %doi% %report% %timestamp% %handle% %posted% %peer% %initials% %notes%`
- **Default** (one line, per Verbatim's machine-readability advice; the `{{…}}` part is written in **Cite** style):

```
{{%short%}} [%author%, %quals%, "%title%," %publication%, %date%, %pages%, %url%, accessed %accessed%] //%initials%
```

- **`%short%` rules:**
  - family name (1 author) / `A and B` (2) / `A et al.` (3+) / organization abbreviation;
  - then `YY`, or `M-D` for current-year sources if the team opts in;
  - `ND` if undated;
  - `Anonymous` (or the publication name, as a user option) if there is no author.
- **Date format:** `M-D-YYYY`, with slashes optional. Precision follows the source: `April 2019` → `4-2019`, a year alone → `2019`.
- **Alternates to offer:**
  - *Verbatim style:* `%first% {{%last%}}, %quals%, %month%-%day%-{{%year%}}, "%title%," %url%` (Cite style on the last name and the year, as in Verbatim's manual)
  - *Frontloaded (Cite Creator):* `%first% {{%last% %y%}}, %quals%, %date%, "%title%", %publication%, %url%`
  - *Two-line:* `{{%short%}}%linebreak%(%author%, …)`, marked "not recommended" because it hurts Verbatim processing.
- **Worked output** (from real metadata):
  `**O’Rourke 25** [Ronald O’Rourke, Specialist in Naval Affairs, Congressional Research Service, "Coast Guard Polar Security Cutter (PSC) and Arctic Security Cutter (ASC) Icebreaker Programs: Background and Issues for Congress," CRS Report RL34391, 4-21-2025 (updated), https://www.congress.gov/crs_external_products/RL/PDF/RL34391/RL34391.281.pdf, accessed 9-25-2026] //XX`

---

## 12. Validation rules (automatically enforceable)

Severity: **E** = error (blocks export as "compliant"), **W** = warning (shown to the user), **I** = info.

| ID | Rule | Sev | Basis |
|---|---|---|---|
| V-1 | **Verbatim integrity:** for each segment, `N(body[segment])` must equal `N(snapshot[source])`. `N` = NFC; collapse any whitespace (space, tab, NBSP, line or paragraph break, U+2028/9) to one space; curly↔straight quotes and apostrophes; U+2010–2015 dashes compared as a class; drop soft hyphens, zero-width characters and BOM; expand ligatures (ﬁ, ﬂ); PDF line-end hyphenation `-\n` tolerated both ways. Store the diff on failure | E | NSDA 7.2.A/B |
| V-2 | **Gaps are explicit:** consecutive segments must be separated by an `omission`. A gap *inside a sentence* is E. A gap at a paragraph boundary is W ("content between paragraphs omitted; NSDA 7.1.E expects skipped text to stay present if it lies between read portions"). Figure or table omissions use Verbatim syntax `[ X Omitted ]` | E/W | NSDA 7.1.E; App. C |
| V-3 | **No introduced ellipses:** any `…`/`...` in the body must exist at the same position in the source | E | NSDA 7.1.E |
| V-4 | **Brackets:** every debater insertion must be an `insertion` rendered in `[ ]`. Unbracketed added text is E. An insertion that contains or removes a negation or hedge is E. Any other insertion is W (norm: avoid; grammar only). Brackets imported without a source are flagged "unverified" | E/W | NSDA 7.2.A; Gandra & Tambe |
| V-5 | **Mark containment:** every underline, emphasis and highlight range must lie within `[0, body.length)`; emphasis ⊆ underline (auto-normalize); highlight ⊆ underline, otherwise W (30 of 31 real cards comply) | E/W | [S] |
| V-6 | **Something is marked as read:** a card placed in a speech doc must have highlight or underline ranges | W | NSDA 7.1.G.2 |
| V-7 | **Skipped negation or hedge inside a read sentence:** for each sentence containing highlighted text, if a token from NEG = {not, no, never, none, nor, neither, cannot, can't, n't, without, fail(s/ed) to, unlikely, hardly, rarely, seldom} or HEDGE = {may, might, could, possibly, perhaps, potentially, probably, likely, some, suggests, appears, seems, if, unless, except, only} lies *between* two highlighted spans of that sentence (or immediately before the first one in its clause) and is not highlighted → NEG: **E**, HEDGE: **W**. If the tag contains no negation but the sentence does → escalate W→E for NEG | E/W | NSDA 7.2.A (spirit); norms |
| V-8 | **Tag ⇄ body claims:** every number or quantity in the tag (normalize %, "percent", $, "billion", years, "twice"/"2x") must appear in the body, ideally in the read text. Missing from the body → E; present but hedged there (V-7 hedge in the same sentence) → W. Tag named entities not in the body → W. Absolute words in the tag (all, every, always, never, guarantees, certain, inevitable, only, extinction, collapse) with no support in the read text → W "possible power tag". An optional LLM entailment check (tag vs read text vs full body) is advisory, and must cite spans | E/W | Power-tagging norms |
| V-9 | **Straw-argument cue:** read text sits in a clause introduced by attribution cues (critics/opponents/some argue/it is claimed/myth/conventional wisdom), and is followed by a rebuttal cue (however, but, yet, in fact) → W "possible straw argument; acknowledge when reading" | W | NSDA 7.2.D |
| V-10 | **Citation completeness (7.1.C):** full author name or organization, date (or explicit ND), source or publication, title, URL + accessed date (digital), qualifications, pages (print or paginated PDF). Each is checked "to the extent the source provides it": if our extractor found the field but the cite omits it → E; if unknown → W | E/W | NSDA 7.1.C |
| V-11 | **Short cite** = last name(s) + year (or ND) and is written in Cite style; the same author with different works must carry distinct cites | E/W | NSDA 7.1.B; App. C |
| V-12 | **Qualifications provenance:** an unverified or `ai-suggested` qualification must not be exported silently; require user confirmation or mark "(unverified)" | E | [I]; honesty norm |
| V-13 | **Dates sane:** published ≤ accessed ≤ today; flag age beyond a user threshold for uniqueness-type blocks | W | [I] |
| V-14 | **AI is never the source:** `provenance.source` must be a retrieved document snapshot with a URL, and AI annotation text must not appear in the body, cite or tag unless the user edited it in explicitly (the tag is the debater's own claim) | E | NSDA National Tournament gen-AI rule |
| V-15 | **Private correspondence** (emails, DMs to the debater) is not admissible as a source type | E | NSDA 7.1.H |
| V-16 | **Export hygiene:** highlight colors ∈ `ST_HighlightColor`; no `w:vanish`; no empty heading paragraphs; highlighted runs not shrunk below body size (W); only one highlight layer per exported card unless the user picks "two-color" | E/W | [V] Verbatim behaviors |
| V-17 | **Readability of the read text** (advisory): fragment count per 100 highlighted words, fragments under 3 characters, partial-word highlights (allowed if they are obvious abbreviations), missing verb in the read text; show the "read aloud" preview string | I/W | Zhou 2020; 3NR |
| V-18 | **Ratio info:** show highlighted/underlined share against the empirical baseline (median ~17%, IQR ~11–23%) and estimated read time (words ÷ user WPM) | I | [S] |
| V-19 | **Boundaries:** a body that starts or ends mid-word → E; mid-sentence → W (recommend full paragraphs) | E/W | Zhou 2020 |
| V-20 | **Speech-doc clipping aid:** at export, the "read" text for every card equals the highlights of its chosen markup; marked copies must include a mark wherever the user stopped early | E | NSDA 7.2.C; 3NR |

---

## 13. Open questions and unverified items

1. **Open Ev licensing.** No explicit license was found (old site, openCaselist UI, and the files themselves). Current-year (2025/2026) files need a Tabroom login, which I did not use. Ask the NDCA or Aaron Hardy if we want to bundle or redistribute camp files. **[U]**
2. **How Word treats `w:highlightCs`** (emitted by `docx` 9.7.2) and duplicate style IDs (`externalStyles`). Test in Word on Windows and Mac; avoid both regardless.
3. **Whether `w:attachedTemplate` with a bare "Debate.dotm" target helps Verbatim** auto-attach, versus requiring the user to click "Verbatimize". Not testable here.
4. **Google Docs round-trip:** exact-match highlight colors → `w:highlight` (hypothesis); loss of the `w:bdr` box; flattening of character styles. Needs a controlled test in a scratch Google account.
5. **TOC-specific evidence rules** and "card doc" definitions in judge paradigms: behind Tabroom login; not verified.
6. **GPL-3.0 exposure** from mirroring Verbatim's style definitions (names, IDs and values are interoperability facts; the file itself is GPL). Legal review recommended. Also **do not** reuse CardMirror code (PolyForm Noncommercial).
7. **Sample files in git:** `.gitignore` does not exclude `docs/research/samples/`. They contain third-party copyrighted text and personal metadata. Decide whether to keep them in a private repo only, or git-ignore them and fetch them in a test setup script from the Wayback URLs above.

---

## 14. Sources

All were accessed **2026-09-25** unless noted. "Used for" says what I took from each source.

**Verbatim and related (Ashtar Communications)**
- https://github.com/ashtarcommunications/verbatim (repo, README, `desktop/CHANGELOG.md`, `desktop/release/6.0.0/Debate.dotm` → `word/styles.xml`/`settings.xml`/`document.xml`; `desktop/src/Formatting.bas`, `Condense.bas`, `Shrink.bas`, `Paperless.bas`, `Caselist.bas`, `View.bas`, `Startup.bas`, `Settings.bas`, `Globals.bas`, `frmSettings.frm`; GitHub API tree, branches, commits). Used for: style definitions, defaults, macro behavior, versions. **License GPL-3.0.**
- Same repo, `dev` branch: `gdocs/README.md`, `gdocs/src/server/format.js`; tree showing `owa/` and `browser/`. Used for: Google Docs port mapping. GPL-3.0.
- Verbatim docs source (served at docs.paperlessdebate.com): `docs/docs/verbatim/1-getting-started/{1-installation,3-requirements,5-whats-new,6-quickstart}.md`, `2-cutting-evidence/{1-organization,2-formatting,3-citations}.md`, `3-debating-paperless/1-paperless.md`, `4-advanced/{1-shortcuts,4-settings,5-other-projects}.md`, `5-faq.md`. Used for: hierarchy, shortcuts, cite format advice, speech docs, FAQ (no Card or Analytic style), other projects. GPL-3.0.
- https://paperlessdebate.com/ and https://paperlessdebate.com/verbatim/ — current v6.0.0 installers, Mini, maintainer, Cite Creator.
- https://github.com/ashtarcommunications/cite-creator (`README.md`, `src/cite.js`) — cite formats, placeholders, missing-field defaults. GPL-3.0.
- https://github.com/ashtarcommunications/caselist (`server/v1/controllers/openev/getFiles.js`, `download/getDownload.js`, `rounds/postRound.js`, `client/src/openev/OpenEvHome.jsx`) — auth requirement, rate limits, open-source file naming, OpenEv terms text. GPL-3.0.
- https://api.opencaselist.com/v1/openev?year=2025 — live `401 Not Authorized` (no login attempted).
- https://opencaselist.com/openev — single-page app; content not readable without JavaScript and login.

**Open Evidence archive and samples**
- `openev.debatecoaches.org` — DNS NXDOMAIN (checked with nslookup and curl).
- http://web.archive.org/web/2021id_/https://openev.debatecoaches.org/Main/ — 2021 OpenEv page text (terms, no license).
- Wayback CDX API `http://web.archive.org/cdx/search/cdx?url=openev.debatecoaches.org/bin/download/{2013,2019,2020,2021}/*` — file inventories.
- Sample downloads: the three Wayback `id_` URLs in §1.2, plus `…/20220404111151id_/…/2013/Berkeley/Cuba%20Negative%20Supplement%20-%20Oil%20-%20Berkeley%202013.docx` (inspected only). License: see §1.2 (no explicit license found).
- https://github.com/rtao258/openev-downloader (`openev.py`) — confirms the old site's URL scheme.

**Rules**
- https://www.speechanddebate.org/high-school-unified-manual/ (lists v2027.1.0, 2026-08-01) and the linked Google Doc exported as text and .docx: `https://docs.google.com/document/d/1hq7-DE6ls2ryVtOttxR4BNpRdP7xUbBr0M3SMYefek8/export?format=txt|docx` (Version 2027.1.2). Used for: Section 7 Evidence Rules, Appendix C, the generative-AI rule, and the Google Docs → .docx highlight experiment. © NSDA; paraphrased.
- https://www.speechanddebate.org/wp-content/uploads/Debate-Evidence-Guide.pdf — judge guide (ellipses, clipping, distortion).
- https://www.speechanddebate.org/wp-content/uploads/Handout-How-to-Cut-Cards.docx — NSDA handout (underline or bold what's read; shrink the rest to 8 pt; older "Author in Year writes" + MLA format).
- https://nationaldebatetournament.org/about/standing-rules/ — NDT Standing Rule VII.B (citation minimums, MLA ellipses, examples of misrepresentation, penalties).

**Community guides (norms)**
- https://the3nr.com/2014/08/20/how-to-never-clip-cards-a-guide-for-debaters/ — Bill Batterman, 2014: marking, marked copies, highlighting to avoid clipping.
- https://victorybriefs.substack.com/p/how-to-cut-a-card-by-lawrence-zhou — Lawrence Zhou, 2020: full paragraphs, grammatical and warranted highlighting, partial-word highlighting.
- https://victorybriefs.substack.com/p/evidence-ethics-in-ld-debate-a-proposal-by-akhil-gandra-and-arjun-tambe — Gandra & Tambe: miscutting, brackets, ellipses, missing dates.
- http://debate-central.ncpathinktank.org/what-good-debaters-dont-do-the-shady-six/ — Rachel Stevens, 2014: clipping, misrepresentation, power-tagging.
- https://lddebateprep.org/formatting-evidence/ — short-cite conventions (et al., ND, Anonymous, month/day).
- https://www.wcdebate.com/2ld/7evidence.htm — cite elements; tag length.
- https://assets.urbandebate.org/wp-content/uploads/20190916152745/Glossary-of-Debate-Terms.pdf — NAUDL glossary: card, cite, tag, highlighting.
- https://en.wikipedia.org/wiki/Evidence_(policy_debate) — re-highlighting history, clipping. CC BY-SA.
- https://www.atlantadebate.org/debate-template-extension-howto — Google Docs "Debate Template" add-on mapping.
- https://workspace.google.com/marketplace/app/debate_template/712515658695 — add-on developer, installs, update date.
- https://debate-decoded.ghost.io/leveling-up-verbatim/ — Advanced Verbatim folded into CardMirror (July 2024).
- https://github.com/ant981228/cardmirror (+ `MANUAL.md`) — prior art: round-trip, Analytic/Undertag styles. PolyForm Noncommercial 1.0.0.
- https://debatecard.ai/blog/how-to-cut-debate-cards — competitor blog (low authority; illustrative only).

**Datasets and papers**
- https://aclanthology.org/2020.argmining-1.1.pdf — DebateSum. The paper is CC BY 4.0; this is *not* the Open Ev license.
- https://arxiv.org/pdf/2406.14657 — OpenDebateEvidence (NeurIPS 2024 D&B): field schema (tag, cite, fullcite, summary = underlined, spoken = highlighted, markup, pocket/hat/block), docx parsing pipeline, privacy column removal.
- https://huggingface.co/api/datasets/Yusuf5/OpenCaselist (+ README) — dataset tagged MIT; the underlying evidence text keeps third-party copyrights.

**OOXML / Word technical**
- https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.highlight — ISO 29500 remarks: highlight supersedes shading.
- https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.highlightcolorvalues — `w:highlight` values.
- https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.runproperties?view=openxml-3.0.1 — `w:rPr` children (no `highlightCs`).
- https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.bold — toggle property (§17.7.3).
- https://learn.microsoft.com/en-us/office/vba/api/word.wdcolorindex — Word color index names.
- https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_ST_HighlightColor_topic_ID0E4PY2.html — `ST_HighlightColor` RGB values.
- https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_highlight_topic_ID0E13LO.html — highlight vs shading.
- http://www.datypic.com/sc/ooxml/t-w_ST_Underline.html — underline values.
- http://www.datypic.com/sc/ooxml/g-w_EG_RPrBase.html — `w:rPr` child order.
- https://support.microsoft.com/en-us/office/use-the-navigation-pane-in-word-394787be-bca7-459b-894e-3f8511515e55 — Navigation Pane.
- https://office-watch.com/2025/word-headings-vs-outline-levels/ — built-in headings ↔ outline levels.

**Node libraries**
- `https://registry.npmjs.org/{docx,mammoth,docx-preview,docxtemplater,jszip,fast-xml-parser,@xmldom/xmldom,officeparser,docx4js,pizzip,saxes,xml-js,docxml,html-to-docx,redocx,fflate}` — versions, licenses, publish dates.
- mammoth.js: https://raw.githubusercontent.com/mwilliamson/mammoth.js/master/README.md, `NEWS`, `lib/options-reader.js`, `lib/docx/body-reader.js`, `lib/document-to-html.js`. BSD-2-Clause.
- docx (dolanmiu): `src/file/styles/{style/style.ts, style/components.ts, style/character-style.ts, style/default-styles.ts, external-styles-factory.ts, factory.ts, styles.ts}`, `src/file/paragraph/run/properties.ts`, `src/file/file.ts`, plus the installed `node_modules/docx/dist/index.mjs` (9.7.2). MIT.
- Experiments (scratch space, not committed): generated `exp_a.docx` / `exp_b.docx` with docx 9.7.2; fast-xml-parser 5.11.1 option tests; Python prototype card extractor over the samples (statistics in §2.7).

**Public-domain example source**
- https://www.congress.gov/crs_external_products/RL/PDF/RL34391/RL34391.281.pdf — CRS RL34391 (Ronald O'Rourke, updated 4-21-2025). Its notice says CRS reports are works of the U.S. government and not subject to copyright in the U.S. Used for the §2.8 and §7.4 examples.

**Could not access / not used:** Tabroom judge paradigms and tournament pages (login wall); TOC rules; GAO report PDFs (Akamai "Access Denied" to curl); the current openCaselist Open Ev file lists (login).
