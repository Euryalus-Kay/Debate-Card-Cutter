import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Helper: stream a Claude request and collect the full text
async function streamMessage(params: {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const stream = client.messages.stream({
    model: params.model,
    max_tokens: params.max_tokens,
    system: params.system,
    messages: params.messages,
  });

  const response = await stream.finalMessage();
  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return content.text;
}

// Helper: extract JSON from text
function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) return match[0];
  return text;
}

export async function generateCard(
  query: string,
  sourceText: string,
  sourceUrl: string,
  sourceInfo: string,
  userContext: string
): Promise<{
  tag: string;
  cite_author: string;
  cite_year: string;
  cite_credentials: string;
  cite_title: string;
  cite_date: string;
  cite_url: string;
  cite_initials: string;
  evidence_html: string;
}> {
  const systemPrompt = `You are an expert high school policy debate card cutter. You create evidence cards in the standard format used in competitive policy debate.

CARD FORMAT RULES:
1. TAG: A bold, concise claim that summarizes the argument the evidence supports. Should be a complete sentence or phrase that a debater would read. Example: "Licensing fails-- we have no ability to administer the licenses"

2. CITATION: Must include:
   - Author last name(s) and year (e.g., "Hansen and Brooke 23")
   - In parentheses: Full name(s), credentials/title, article title in quotes, date, access date, URL
   - Followed by cutter's initials

3. EVIDENCE: This is the most critical part. You must:
   - Include a LARGE, CONTINUOUS block of text from the source (multiple paragraphs minimum)
   - The text must be VERBATIM from the source - never modify, paraphrase, or rearrange the original text
   - Use <mark> tags to highlight/underline key portions
   - Non-highlighted text should be present but will appear smaller/lighter
   - Include as much surrounding context as possible

HIGHLIGHTING RULES:
- Use <mark> tags to highlight the parts of the evidence that prove the argument.
- The highlighted portions, when read in sequence, should form coherent sentences.
- Highlight however much or little is right for this specific card — use your judgment.
- You can highlight single words, short phrases, or longer runs — whatever makes the best reading of the card.
- Non-highlighted text provides context but is not read aloud in a debate round.

EVIDENCE TEXT RULES:
- NEVER modify the source text. Copy it exactly as written.
- Include multiple consecutive paragraphs, not just cherry-picked sentences
- The more text included, the better - include the full relevant section
- Paragraph breaks should be preserved

OUTPUT FORMAT: Return a JSON object with these exact fields:
{
  "tag": "The tag line",
  "cite_author": "Last Name(s) and Year",
  "cite_year": "23",
  "cite_credentials": "Full credentials string in parentheses",
  "cite_title": "Article title",
  "cite_date": "Publication date",
  "cite_url": "URL",
  "cite_initials": "ai",
  "evidence_html": "The full evidence HTML with <mark> tags for highlighting"
}`;

  const text = await streamMessage({
    model: "claude-opus-4-20250514",
    max_tokens: 16000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Create a debate card for the following argument:
${query}

${userContext ? `Debate context: ${userContext}` : ""}

SOURCE INFORMATION:
${sourceInfo}

SOURCE URL: ${sourceUrl}

FULL SOURCE TEXT:
${sourceText}

Remember:
1. The evidence_html must contain a MASSIVE continuous block of the source text (not just a few sentences)
2. Use <mark> tags to highlight key parts that form coherent sentences when read alone
3. NEVER modify the source text - only add <mark> tags around existing text
4. The tag should be a strong, specific claim
5. Return valid JSON only`,
      },
    ],
  });

  return JSON.parse(extractJson(text));
}

export async function generateCardFast(
  query: string,
  sourceText: string,
  sourceUrl: string,
  sourceInfo: string,
  userContext: string
): Promise<{
  tag: string;
  cite_author: string;
  cite_year: string;
  cite_credentials: string;
  cite_title: string;
  cite_date: string;
  cite_url: string;
  cite_initials: string;
  evidence_html: string;
}> {
  const systemPrompt = `You create HS policy debate evidence cards. Return JSON with: tag, cite_author, cite_year, cite_credentials, cite_title, cite_date, cite_url, cite_initials, evidence_html.

Rules:
- Tag: bold claim summarizing the argument
- Citation: author last name + year, credentials, title, date, url
- Evidence: LARGE continuous block of VERBATIM source text with <mark> tags around key parts
- Highlight whatever proves the argument — use your judgment on how much or little to highlight
- Highlighted portions should read as coherent sentences when read in sequence
- NEVER modify source text, only add <mark> tags
- Return valid JSON only`;

  const text = await streamMessage({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Create a debate card for: ${query}
${userContext ? `Context: ${userContext}` : ""}
Source: ${sourceUrl}
Source info: ${sourceInfo}
Text: ${sourceText.substring(0, 12000)}

Return JSON only.`,
      },
    ],
  });

  return JSON.parse(extractJson(text));
}

export async function iterateCard(
  currentCard: {
    tag: string;
    evidence_html: string;
    cite: string;
  },
  instruction: string
): Promise<{
  tag: string;
  evidence_html: string;
}> {
  const systemPrompt = `You are an expert high school policy debate card editor. You help refine and improve debate cards.

CRITICAL RULES:
1. You MUST NOT modify the underlying evidence text. The source text must remain exactly as it was.
2. You CAN change which parts are highlighted (wrapped in <mark> tags)
3. You CAN modify the tag line
4. You CAN adjust highlighting to form better coherent sentences
5. You CANNOT add, remove, reword, or rearrange any of the source evidence text
6. You CANNOT paraphrase or summarize the evidence

When adjusting highlights:
- Highlighted portions (in <mark> tags) must still form coherent sentences when read in sequence
- Be strategic about what you highlight
- More highlighting = longer read time in a round
- Less highlighting = might miss key warrants

Return JSON with "tag" and "evidence_html" fields only.`;

  const text = await streamMessage({
    model: "claude-opus-4-20250514",
    max_tokens: 16000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Here is the current card:

TAG: ${currentCard.tag}

CITATION: ${currentCard.cite}

EVIDENCE:
${currentCard.evidence_html}

USER INSTRUCTION: ${instruction}

Modify the card according to the instruction. Remember: NEVER change the evidence text itself, only the tag and highlighting. Return JSON with "tag" and "evidence_html".`,
      },
    ],
  });

  return JSON.parse(extractJson(text));
}

export async function planArgument(
  query: string,
  userContext: string
): Promise<{
  title: string;
  description: string;
  cards: Array<{ query: string; purpose: string }>;
}> {
  const systemPrompt = `You are an expert high school policy debate strategist. Given a debate argument request, you plan out the individual evidence cards needed to construct a complete, competitive argument.

In policy debate, arguments typically need:
- A main claim/thesis card
- Warrant cards (evidence that explains WHY the claim is true)
- Impact cards (evidence showing the consequences/significance)
- Uniqueness cards (if applicable - showing the status quo condition)
- Link cards (if applicable - connecting the plan to the impact)
- Turn cards (if applicable - showing the opposing argument actually supports your side)

Plan 3-7 cards that together form a cohesive argument block.

Return JSON with:
{
  "title": "Name of the argument block",
  "description": "Brief description of the overall argument strategy",
  "cards": [
    {"query": "specific search query for this card", "purpose": "what this card does in the argument"},
    ...
  ]
}`;

  const text = await streamMessage({
    model: "claude-opus-4-20250514",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Plan a complete debate argument block for:\n${query}\n\n${userContext ? `Context: ${userContext}` : ""}`,
      },
    ],
  });

  return JSON.parse(extractJson(text));
}

export type ArgumentType = "aff" | "da" | "cp" | "k" | "t" | "theory" | "custom";

interface ArgumentComponent {
  type: "card" | "analytic" | "plan_text" | "interp_text";
  label: string;
  query?: string; // search query if type=card
  purpose: string;
  content?: string; // for analytic/plan_text/interp_text, the AI-written text
}

export interface AdvancedArgumentPlan {
  title: string;
  description: string;
  strategy_overview: string;
  argument_type: ArgumentType;
  components: ArgumentComponent[];
}

const CAMP_FILE_KNOWLEDGE: Record<ArgumentType, string> = {
  aff: `AFFIRMATIVE CAMP FILE STRUCTURE:
You are building a COMPLETE CAMP FILE for an Affirmative case. This should be tournament-ready, like what a top debate camp (Harvard, Michigan, Georgetown) would produce.

CAMP FILE SECTIONS:

**File Notes** — Strategic coaching notes: what topics this aff is strongest on, how to answer common neg args, tips for the 2AC/1AR.

**1AC Shell** — The complete 1AC:
- Plan Text (analytic)
- Contention 1: Inherency (1-2 cards)
- For each Advantage: Uniqueness card, Link card, Internal Link card, Impact card
- Solvency (2-3 cards, mechanism + sufficiency)

**2AC Add-Ons** — Additional advantages/cards to read in the 2AC:
- Extra impact cards with different framings
- Additional solvency evidence
- Turn cards against common DAs

**Answers to Common Off-Case** — AT blocks for what the neg will likely read:
- AT Topicality (we meet + counter-interp cards, standards analytics)
- AT [likely DA] (non-unique, no link, link turn, impact turn cards)
- AT [likely CP] (perm analytics, CP doesn't solve cards, theory analytics)
- AT [likely K] (framework cards, perm analytics, no link args)

Generate 20-30 cards across all sections with analytics between them.`,

  da: `DISADVANTAGE CAMP FILE STRUCTURE:
You are building a COMPLETE CAMP FILE for a Disadvantage. This should look like a top camp's DA file.

CAMP FILE SECTIONS:

**File Notes** — Strategic overview: which affs to read this DA against, how to extend in the block, what to collapse on in the 2NR.

**1NC Shell** — The shell to read in the 1NC:
- Uniqueness card (status quo is stable/good)
- Link card (plan triggers the DA)
- Internal Link card (chain of causation)
- Impact card (terminal impact)

**Additional Uniqueness** — Extra uniqueness evidence for the block:
- 2NC uniqueness cards from different angles
- "Brink" evidence (we're at the tipping point)

**Additional Links** — Link cards organized by aff type:
- "1nc --- [specific aff] link" format
- "2nc --- [topic area] link" format
- Generic and specific link cards

**Impact Extensions** — Additional impact evidence:
- Different impact framings (magnitude, timeframe, probability)
- Impact comparison cards (outweighs aff advantages)
- Scenario-specific impact cards

**Answers Section** — AT blocks:
- AT: No Uniqueness (uniqueness overwhelms the link)
- AT: No Link (link is empirically proven)
- AT: Link Turn (turn is wrong because...)
- AT: Impact Turn (their impact claims are false)
- AT: Non-Unique (the DA is still unique because...)

Generate 20-30 cards across all sections.`,

  cp: `COUNTERPLAN CAMP FILE STRUCTURE:
You are building a COMPLETE CAMP FILE for a Counterplan. Like a top camp would produce.

CAMP FILE SECTIONS:

**File Notes** — Strategy: which affs to read it against, how to pair with net benefits, 2NR strategy.

**1NC Shell** — The CP shell:
- CP Text (analytic — formal counterplan text)
- Solvency card (CP solves the aff's advantages)
- Competition card/analytic (why CP and plan are mutually exclusive)
- Net Benefit link (DA that links to plan but not CP)

**Extended Solvency** — Additional solvency for the block:
- Multiple solvency cards from different angles
- Mechanism-specific solvency
- Historical precedent for the CP

**Net Benefit** — The DA that is the net benefit:
- Uniqueness, link, impact cards for the net benefit DA
- Why the CP avoids the net benefit

**Competition** — Evidence for why CP competes:
- Mutual exclusivity evidence
- Functional competition cards

**Answers Section** — AT blocks:
- AT: Permutation Do Both (perm severs/is intrinsic)
- AT: CP Doesn't Solve (yes it does, here's why)
- AT: Theory (CP is theoretically legitimate)
- AT: Aff Solvency Deficit (CP solves 100%)

Generate 20-30 cards.`,

  k: `KRITIK CAMP FILE STRUCTURE:
You are building a COMPLETE CAMP FILE for a Kritik. This should mirror what top camps like Michigan 7-week or Harvard produce for K files.

CAMP FILE SECTIONS:

**File Notes** — Strategic coaching notes: what affs to read it against, framework strategy, how to handle the perm, 2NR tips.

**1NC Shell — [specific aff/topic]** — A complete 1NC K shell:
- Link card specific to the topic
- Impact/Implications card
- Alt Text (analytic — the alternative advocacy)
- Alt Solvency card

**Additional 1NC Shells** — If applicable, shells for other common affs with different link cards.

**Additional Links** — MANY link cards organized by topic:
- "1nc --- [topic] link" (read in the 1NC)
- "2nc --- [topic] link" (extend in the block)
- Generic links (state action, reform, discourse)
- Specific links for different affs

**Impact/Implications** — Extended impact evidence:
- Root cause arguments
- Structural violence framing
- Epistemological/ontological impact cards
- Impact comparison (K impacts outweigh)

**Alternative** — Extended alt evidence:
- Alt solvency cards
- Alt resolves the links
- Historical examples of the alt working

**Framework / Role of the Ballot** — Framework evidence:
- Why the judge should use K framework
- Role of the ballot cards
- Why policy simulation fails

**Answers Section** — AT blocks (this is CRITICAL for Ks):
- AT: Permutation (perm fails, severs the alt, links to the K)
- AT: Alt Fails / No Solvency (alt solves, historical proof)
- AT: Cap Good / Impact Turns (their impact claims reinforce the K)
- AT: Framework (our framework is better)
- AT: Cede the Political (engagement fails)
- AT: Floating PIK (alt is distinct from the plan)

Generate 25-35 cards. K files need DEPTH especially in the links and AT sections.`,

  t: `TOPICALITY CAMP FILE STRUCTURE:
You are building a COMPLETE CAMP FILE for a Topicality argument.

CAMP FILE SECTIONS:

**File Notes** — Strategy: which affs this T arg is for, how to handle counter-interps, 2NR strategy.

**1NC Shell** — The T shell:
- Interpretation card (definition of the key term)
- Violation (analytic — how the aff violates)
- Standards analytics (limits, ground, predictability, education)
- Voters analytic (education, fairness)

**Extended Standards** — Cards for each standard:
- Limits cards (their interp explodes the topic)
- Ground cards (their interp destroys neg ground)
- Predictability cards (education requires predictable limits)

**Answers Section** — AT blocks:
- AT: We Meet (no they don't, here's why)
- AT: Counter-Interpretation (our interp is better)
- AT: Reasonability (competing interpretations is better)
- AT: Overlimiting (limits are good, not overlimiting)

Generate 15-25 cards.`,

  theory: `THEORY CAMP FILE STRUCTURE:
You are building a COMPLETE CAMP FILE for a Theory argument.

CAMP FILE SECTIONS:

**File Notes** — When to read this theory arg, strategic context.

**Shell** — The theory shell:
- Interpretation (analytic)
- Violation (analytic)
- Standards analytics (fairness, education, ground, reciprocity)
- Voters (analytic)

**Extended Standards** — Cards supporting each standard:
- Fairness evidence
- Education evidence

**Answers Section** — AT blocks for likely responses.

Generate 10-20 cards.`,

  custom: `CUSTOM CAMP FILE STRUCTURE:
The user will describe their argument idea. Build a COMPLETE CAMP FILE appropriate to the argument type. Analyze what kind of argument this is and produce a full camp-quality file with:

- File notes (strategic coaching)
- 1NC/1AC shell(s) as appropriate
- Extended evidence sections
- AT (Answers To) blocks for common responses
- Analytics between cards

Determine the right structure based on the argument described. Generate 15-30 cards.`,
};

export interface CampFileSection {
  section_header: string;
  components: ArgumentComponent[];
}

export interface CampFilePlan {
  title: string;
  file_notes: string;
  argument_type: ArgumentType;
  sections: CampFileSection[];
}

// Keep the old interface for backward compat
export interface AdvancedArgumentPlan {
  title: string;
  description: string;
  strategy_overview: string;
  argument_type: ArgumentType;
  components: ArgumentComponent[];
}

export async function planArgumentAdvanced(
  argumentType: ArgumentType,
  description: string,
  userContext: string
): Promise<CampFilePlan> {
  const typeKnowledge = CAMP_FILE_KNOWLEDGE[argumentType];

  const systemPrompt = `You are an elite debate camp lab leader (think Michigan 7-week, Harvard, Georgetown, Gonzaga). You produce COMPLETE CAMP FILES — not just a few cards, but full tournament-ready files that a team could use at a national tournament.

${typeKnowledge}

CAMP FILE PLANNING RULES:
1. Structure the file into SECTIONS with clear headers (like "1NC Shell", "Additional Links", "AT: Permutation").
2. Each section contains multiple components — cards, analytics, plan/interp texts.
3. Each "card" component needs a SPECIFIC, searchable query that will find real academic/journalistic evidence.
4. "analytic" components are debater-written arguments — write the FULL text as an experienced debater would.
5. "plan_text" is the formal policy text. "interp_text" is the formal interpretation.
6. Search queries must be SPECIFIC — include author names, specific claims, journal-quality keywords.
7. Analytics should sound like a top-level debater wrote them: concise, strategic, persuasive.
8. Include AT (Answers To) sections — these are CRITICAL for camp files.
9. Label cards like camp files do: "1nc --- [topic] link", "2nc --- [topic] link", "AT: [argument name]".
10. Generate 15-35 components total across all sections. More for Ks and DAs, fewer for Theory.

Return a JSON object:
{
  "title": "File title (e.g., 'K - Capitalism', 'DA - Spending', 'Aff - Quantum Computing')",
  "file_notes": "Strategic coaching notes: what affs/negs to read it against, how to use the file, 2NR/2AR strategy, tips for the block. Write 3-5 sentences like a camp lab leader briefing their students.",
  "argument_type": "${argumentType}",
  "sections": [
    {
      "section_header": "Section name (e.g., '1NC Shell', 'Additional Links', 'AT: Permutation')",
      "components": [
        {
          "type": "card",
          "label": "Card label (e.g., '1nc --- Green Tech Link', '2nc --- Root Cause')",
          "query": "specific search query to find this evidence",
          "purpose": "what this card does in the argument"
        },
        {
          "type": "analytic",
          "label": "Analytic label (e.g., 'Alt Text', 'Perm: Do Both')",
          "purpose": "strategic purpose",
          "content": "Full text of the analytic as a debater would write it"
        }
      ]
    }
  ]
}`;

  const text = await streamMessage({
    model: "claude-opus-4-20250514",
    max_tokens: 12000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Build a complete camp file for:\n${description}\n\n${userContext ? `Topic/Context: ${userContext}` : ""}\n\nThis needs to be a FULL camp file with shells, extended evidence, and AT blocks. Return JSON only.`,
      },
    ],
  });

  return JSON.parse(extractJson(text));
}

export async function selectBestSource(
  query: string,
  searchResults: string,
  sources: Array<{ url: string; title: string }>
): Promise<{ selectedUrl: string; reason: string }> {
  const text = await streamMessage({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: "You select the best source for debate evidence cards. Return only valid JSON.",
    messages: [
      {
        role: "user",
        content: `For this debate argument: "${query}"

Here are search results:
${searchResults}

Available sources:
${sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join("\n")}

Select the BEST source for cutting a debate card. Consider:
1. Author credentials and expertise
2. Specificity and strength of claims
3. Recency
4. Quotability (long, detailed passages work better than short summaries)

Return JSON: {"selectedUrl": "the url", "reason": "why this source is best"}`,
      },
    ],
  });

  return JSON.parse(extractJson(text));
}

export async function parseSpeech(
  speechText: string,
  speechType: string,
  side: string,
  roundContext: string,
  hasHighlights: boolean
): Promise<Array<{
  id: string;
  type: string;
  arg_type: string;
  label: string;
  tag: string;
  cite?: string;
  evidence_html?: string;
  summary: string;
}>> {
  const systemPrompt = `You are an expert policy debate flow judge and analyst. You read debate speeches and identify every individual argument, card, and analytic within them.

You are analyzing a ${speechType} speech from the ${side === 'aff' ? 'affirmative' : 'negative'} team.

SPEECH CONTEXT:
- 1AC: Affirmative case presentation (plan, advantages, solvency)
- 1NC: Negative's full position (DAs, CPs, Ks, T, case attacks)
- 2AC: Answers everything in 1NC, rebuilds case
- 2NC: Part of neg block, extends some positions
- 1NR: Part of neg block, extends remaining positions
- 1AR: Must answer entire neg block
- 2NR: Collapses to strongest arguments
- 2AR: Final weighing, explains why judge should vote aff

For EACH argument/card you identify, classify it:
- card: Has a tag, citation, and evidence
- analytic: Debater-written argument without citation
- theory: Procedural argument about debate norms
- framework: Argument about how the judge should evaluate the round

Classify the argument type (arg_type):
- case-advantage, case-plan, case-solvency, case-inherency, case-impact
- da-uniqueness, da-link, da-impact, da-turn
- cp-text, cp-solvency, cp-net-benefit, cp-perm
- k-link, k-impact, k-alternative, k-framework
- t-interp, t-violation, t-standards, t-voters
- theory, framework, overview, underview

${hasHighlights ? 'The speech text has existing highlighting/formatting. PRESERVE it in the evidence_html field.' : 'The speech text has no highlighting. Add strategic <mark> tags around the key portions that prove each argument.'}

Return a JSON array of objects with these fields:
- id: a unique string identifier (use format "arg-1", "arg-2", etc.)
- type: "card" | "analytic" | "theory" | "framework"
- arg_type: classification string from the list above
- label: short 3-8 word label (e.g., "Spending DA - Uniqueness")
- tag: the tagline/claim of the argument
- cite: citation string if it's a card (empty string if analytic)
- evidence_html: the evidence HTML with <mark> tags if it's a card (empty string if analytic)
- summary: 1-2 sentence summary of what this argument claims

Return ONLY a JSON array, no other text.`;

  const text = await streamMessage({
    model: 'claude-opus-4-20250514',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `${roundContext ? `Round context: ${roundContext}\n\n` : ''}Identify every argument in this ${speechType} speech:\n\n${speechText}`,
    }],
  });

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

export async function generateFlow(
  speeches: Array<{ speech_type: string; parsed_content: unknown[] }>,
  side: string
): Promise<Array<{ row_index: number; category: string; label: string; entries: Record<string, unknown> }>> {
  const systemPrompt = `You are an expert policy debate flow expert. Given parsed arguments from each speech, construct a flow chart.

The user is on the ${side === 'aff' ? 'affirmative' : 'negative'} side.

FLOW RULES:
- Each ROW tracks one argument chain across the round
- Group rows by CATEGORY: case, da-[name], cp-[name], k-[name], t-[name], theory
- Each cell in a row corresponds to a speech column
- Match responses to the arguments they respond to (horizontal alignment)
- Mark dropped arguments (argument from speech N with no response in N+1 when one was required)
- Mark turns (where a response argues the opposite direction)
- Mark extensions (where a later speech develops an earlier argument)

For each row, provide entries as a map of speech_type to:
{
  "text": "Short 5-15 word description of the argument at this point",
  "status": "new" | "answered" | "dropped" | "turned" | "extended"
}

Return a JSON array of row objects:
{
  "row_index": number,
  "category": "case" | "da-spending" | "cp-states" | etc,
  "label": "Short label for this argument chain",
  "entries": { "1AC": {...}, "1NC": {...}, ... }
}`;

  const text = await streamMessage({
    model: 'claude-opus-4-20250514',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Generate the flow for this debate round. Here are the parsed arguments from each speech:\n\n${JSON.stringify(speeches, null, 2)}`,
    }],
  });

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

export async function planSpeech(
  speechType: string,
  side: string,
  previousSpeeches: Array<{ speech_type: string; parsed_content: unknown[] }>,
  flowEntries: unknown[],
  availableCards: Array<{ id: string; tag: string; cite_author: string; evidence_html: string }>,
  selectedCardIds: string[],
  roundContext: string,
  additionalInstructions: string
): Promise<{
  strategy: string;
  sections: Array<{ label: string; action: string; card_source: string; search_query?: string; card_id?: string; analytics: string }>;
}> {
  const speechInfo: Record<string, string> = {
    '1AC': `FIRST AFFIRMATIVE CONSTRUCTIVE — 8 minutes (you read highlighted portions of cards aloud + analytics)
Present the affirmative case. Structure:
- Plan text (formal policy proposal: agent, mandate, enforcement, funding, timeline)
- Contention 1: Inherency (1-2 cards showing SQ fails)
- Contention 2: Advantage 1 [Name] — internal links + impact cards
- Contention 3: Advantage 2 [Name] if applicable
- Solvency (2-3 cards showing plan fixes the problem)
Every advantage needs a clear causal chain: plan → internal link → impact.
Impacts should have magnitude, timeframe, and probability framing.`,

    '1NC': `FIRST NEGATIVE CONSTRUCTIVE — 8 minutes (cards can be long but only highlighted parts are read aloud)
Present ALL negative off-case positions plus case attacks. This is your only chance to introduce new arguments.
STRATEGIC STRUCTURE (order matters):
1. Topicality (if applicable) — interpretation, violation, standards, voters
2. Counterplan(s) — CP text, solvency, net benefit, competition
3. Disadvantage(s) — uniqueness, link, internal link, impact
4. Kritik (if running one) — link, impact, alternative, framework/ROTB
5. Case attacks — solvency takeouts, impact defense, internal link turns

HOW TO COUNTER SPECIFIC AFF TYPES:
- Against a K aff: Framework (must defend a topical plan), T-USFG, case turns
- Against a big-stick aff (large impacts): Impact defense, DA outweighs, CP solves better
- Against a small aff: T (not substantial), CP captures advantages
- Against advantage CPs: Theory, perm, solvency deficit

SHELLS should be concise — just enough to establish the argument. Extensions come in the block.
Read 4-7 off-case positions to create strategic pressure. Don't over-commit to any single argument.`,

    '2AC': `SECOND AFFIRMATIVE CONSTRUCTIVE — 8 minutes (cards can be long but only highlighted parts are read aloud)
Answer EVERY argument from the 1NC. Dropping = conceding. This speech makes or breaks the round.
MUST cover in order (off-case first, then case):
- Each DA: no link, no uniqueness, link turn, impact turn, impact defense (pick 2-3)
- Each CP: permutation (do both), solvency deficit, theory (if applicable), net benefit answers
- Topicality: we meet, counter-interp, standards turns, reasonability
- Kritik: framework (util > K), permutation, no link, alt fails, case outweighs
- Case defense: extend advantages, answer case attacks

HOW TO ANSWER SPECIFIC ARGUMENTS:
- DAs: "No link — our plan doesn't [X]" + link turn + impact comparison
- CPs: Perm do both (always), solvency deficit (CP can't access advantage), theory (condo bad, PICs bad)
- T: We meet (best answer), counter-interp + standards, reasonability voter
- Ks: Framework first (judge should evaluate policy outcomes), perm (embrace alt + do plan), alt fails (no solvency), case outweighs
- Theory: Counter-interp, "not a voter — just reject the arg"
- Case attacks: Extend warrant from 1AC, new evidence if needed, impact comparison

Use 4-5 analytics per off-case position + 1-2 cards. Efficiency is key.`,

    '2NC': `SECOND NEGATIVE CONSTRUCTIVE — 8 minutes (cards can be long but only highlighted parts are read aloud)
First half of the "negative block" (2NC + 1NR = 13 min to the aff's 5-min 1AR).
STRATEGY: Split the block with the 1NR. The 2NC covers the MOST IMPORTANT off-case positions in depth.
- Pick 2-3 positions to cover thoroughly
- Extend and deepen each one: answer 2AC responses, read new evidence, do impact comparison
- This speech should make your best arguments feel unbeatable

KICKING ARGUMENTS:
- Evaluate which 1NC arguments are winning vs losing after the 2AC. If the 2AC crushed a DA or CP, it may be strategic to KICK IT (stop going for it) and invest that time in your winners.
- Kicking is especially smart when: the 2AC had devastating answers (link turn + impact turn), the argument was only there to spread them thin, or you have stronger positions to go deep on.
- If you had 5 off-case positions in the 1NC, the neg block should probably go deep on 2-3 and kick the rest.
- Kicking requires conditionality — if they read condo bad and you're worried about it, don't kick.
- Signal your kicks: "We're going to focus on the [DA] and [CP] — the rest of the flow speaks for itself" — or just don't mention the kicked positions at all.

HOW TO EXTEND SPECIFIC ARGUMENTS:
- DA extensions: New uniqueness evidence, answer link defense, impact comparison (timeframe, magnitude, probability), turns case argument
- CP extensions: Answer perms (severance, intrinsic), extend solvency, strengthen net benefit
- K extensions: Extend framework, answer perms, root cause argument, new link evidence, alt solvency
- T extensions: Answer counter-interps, extend standards, impact T (limits collapse = no education)

CRITICAL: Read impact comparison evidence/analytics. "Even if they win [X], our [Y] outweighs because..."
The 2NC sets up the 2NR — whatever you go for here is likely what you'll collapse to.`,

    '1NR': `FIRST NEGATIVE REBUTTAL — 5 minutes (cards can be long but only highlighted parts are read aloud)
Second half of the neg block. Cover the positions NOT covered in the 2NC.
STRATEGY:
- Cover remaining off-case positions AND case attacks
- Be thorough but efficient — you have less time than the 2NC
- This speech should clean up everything the 2NC didn't touch
- Focus on rebuilding arguments the 2AC tried to answer
- If the 2NC kicked some arguments, DO NOT extend those — they're gone. Focus your time on what's still live.
- Evaluate what's worth keeping: if a position is weak after the 2AC, it's better to kick it here and go deeper on your strong arguments than to waste time on a loser.

COMMON ALLOCATION:
- If 2NC covered DA + CP: 1NR covers T, K, case attacks
- If 2NC covered K: 1NR covers DA, CP, case
- Case attacks are crucial — don't let the aff's advantages go unchallenged

TECHNIQUE: Line-by-line refutation. "They said [X], but [Y]." Go down the 2AC flow point by point.`,

    '1AR': `FIRST AFFIRMATIVE REBUTTAL — 5 minutes (cards can be long but only highlighted parts are read aloud)
THE HARDEST SPEECH IN DEBATE. You have 5 minutes to answer 13 minutes of neg block arguments.
STRATEGY:
- You CANNOT go line-by-line on everything — you must be efficient
- Group arguments: "On the DA, group their 4 uniqueness extensions — they all assume [X] which our [Y] evidence answers"
- Cross-apply: "Cross-apply our 2AC #3 — they never answered it"
- Extend key 2AC answers rather than making new arguments
- Smart drops: If they extended T but not well, quick coverage. If the DA is their A-game, spend time there.

PRIORITIZATION:
1. Whatever the 2NR will likely go for — answer that thoroughly
2. Case extensions — extend at least one advantage with impact comparison
3. Quick coverage of everything else — at least reference every flow
4. Impact comparison — "Even if they win [X], [Y] outweighs on [timeframe/magnitude/probability]"

TECHNIQUE: Group, cross-apply, extend, compare. Don't re-read evidence from the 2AC — reference it.`,

    '2NR': `SECOND NEGATIVE REBUTTAL — 5 minutes (cards can be long but only highlighted parts are read aloud)
COLLAPSE. Go for 1-2 arguments only. This is the neg's final speech.
STRATEGY:
- Pick your best argument(s) and go ALL IN. Reading 5 arguments for 1 minute each = losing strategy.
- Classic collapses: DA + case turns, CP + net benefit, K + case turns, T (rare but strong if extended well)
- Must answer 1AR responses thoroughly — this is a rebuttal, not a re-read of the block
- Impact comparison is EVERYTHING in this speech

COLLAPSE FRAMEWORK:
1. FRAMING: "The question in this round is..." — set up the judge's decision calculus
2. EXTEND your argument: re-explain the story with 1AR answers in mind
3. ANSWER 1AR: line-by-line on what they said about your collapse positions
4. IMPACT COMPARISON: magnitude, timeframe, probability, reversibility
5. CASE OUTWEIGHS/TURNS: explain why your argument matters more than their advantages

HOW TO COLLAPSE ON SPECIFIC ARGUMENTS:
- DA + case: "The DA turns the case — even if they solve, the DA means [impact]. And their advantage is non-unique because [X]"
- CP + DA: "The CP solves 100% of the aff + avoids the DA. Perm fails because [severance/intrinsic]. Vote neg on presumption."
- K: "The K is a prior question — the framework of the 1AC is [flawed] which means the plan reproduces [harm]. The alt solves."
- T: "T is a voter for fairness and education. Their interp allows [infinite affs] which destroys neg ground."`,

    '2AR': `SECOND AFFIRMATIVE REBUTTAL — 5 minutes (cards can be long but only highlighted parts are read aloud)
FINAL SPEECH. Tell the judge why aff wins. Must directly answer the 2NR.
STRATEGY:
- Focus ONLY on what the 2NR went for — everything else is already won by the aff (they dropped it)
- Point out drops: "They dropped [advantage 2] in the 2NR — that's a conceded impact of [X]"
- Do the judge's work: explain the decision in your favor step by step
- Impact comparison: "Even if they win every argument on the [DA], our [advantage] outweighs because..."

STRUCTURE:
1. BIG PICTURE FRAMING: "This round comes down to [X] vs [Y]"
2. ANSWER 2NR: point-by-point on their collapse arguments
3. EXTEND CASE: re-impact your advantages with comparison
4. WEIGH: magnitude, timeframe, probability, reversibility, scope
5. CLOSE: "For these reasons, an affirmative ballot is warranted"

KEY TECHNIQUE: "Even if" arguments — "Even if you buy their [X], you still vote aff because [Y]"
DO NOT introduce new arguments — only extend and compare.`,
  };

  const systemPrompt = `You are an elite policy debate strategist and coach with extensive experience at top debate camps (Michigan, Georgetown, Northwestern). You are planning a ${speechType} speech for the ${side === 'aff' ? 'affirmative' : 'negative'}.

SPEECH REQUIREMENTS:
${speechInfo[speechType] || 'Respond to existing arguments.'}

ADVANCED DEBATE STRATEGY KNOWLEDGE:

ANSWERING DISADVANTAGES:
- No link (plan doesn't trigger the DA), no internal link, no impact
- Link turn (plan actually HELPS, not hurts), impact turn (the DA's impact is actually GOOD)
- Non-unique (impact happening regardless of plan), uniqueness overwhelms (SQ trends are too strong)
- Never link turn AND impact turn the same DA (double turn = you've made their argument for them)

ANSWERING COUNTERPLANS:
- Perm do both (always the first answer — tests competition, CP must be net beneficial)
- Perm do the CP (if the CP is topical, this proves it's not competitive)
- Solvency deficit (CP can't access aff advantages because [specific mechanism])
- Theory: Condo bad (they can kick it, unfair), PICs bad (plan-inclusive CPs are unfair), 50 state fiat bad, international fiat bad, consult CPs bad (delay is bad process)
- Net benefit answers (the DA that's the net benefit has [problems])

ANSWERING KRITIKS:
- Framework/ROTB: judge should evaluate consequences of policy proposals (util framework), fairness args
- Permutation: "endorse the alt while doing the plan" — tests competition
- No link: our aff doesn't assume/rely on [problematic framework]
- Alt fails: no solvency — rejecting the aff doesn't solve the K's impacts, structural problems persist
- Alt causes: the alternative leads to worse outcomes (totalitarianism, paralysis)
- Case outweighs: material conditions of [aff harm] are more urgent than discursive/epistemological concerns
- Link of omission: their K links to everything including the SQ — not unique to the aff

ANSWERING TOPICALITY:
- We meet: the aff IS topical under their interpretation (strongest answer)
- Counter-interpretation: our definition of [term] from [source] — proves we're topical
- Standards: their limits are too strict (over-limits kills education), our interp has better ground/predictability
- Reasonability: as long as the aff is reasonably topical, reject T (prevents frivolous T args)

ANSWERING THEORY:
- Counter-interpretation: "the neg may run [X]" — our practice is fine
- Not a voter: reject the argument, not the team
- No abuse: they had sufficient ground despite our practice
- Standards outweigh: our interp promotes better debates

WRITING ANALYTICS:
- Cross-applications: "cross-apply our 2AC #3 which says [X]"
- Grouping: "group their 3 uniqueness cards — they all assume [Y] which..."
- Turns: "this turns the [DA] because [X] means the impact goes our direction"
- Even-if: "even if you buy their [X], you still vote [aff/neg] because..."
- Impact calc: "our [impact] outweighs on [timeframe/magnitude/probability] because..."

You have access to a card library. For each section of the speech, decide:
1. Use an existing library card (specify card_id)
2. Generate a new card (specify search_query for Perplexity)
3. Write an analytic (debater-written argument, no evidence needed)

Selected cards the user wants included: ${selectedCardIds.length > 0 ? selectedCardIds.join(', ') : 'None specified'}

Be SPECIFIC and STRATEGIC. Think like a top-16-at-TOC debater:
- Don't make broad generic arguments — target specific claims the opponent made
- For the 2NR, collapse strategically — don't go for everything
- For the 1AR, be efficient — you only have 5 minutes to answer 13+ minutes of neg arguments
- For the 2AC, have a specific answer to every off-case position
- For constructives, read enough off-case/on-case to create strategic flexibility
- Think about what you're setting up for later speeches

Return JSON:
{
  "strategy": "Brief 2-3 sentence overview of speech strategy",
  "sections": [
    {
      "label": "Section label (e.g., 'Spending DA - Uniqueness Answer')",
      "action": "use_card" | "generate_card" | "analytic",
      "card_source": "library" | "generate" | "analytic",
      "search_query": "if generating, the search query",
      "card_id": "if using library card, the card id",
      "analytics": "if analytic, the full text of the analytic argument"
    }
  ]
}`;

  const text = await streamMessage({
    model: 'claude-opus-4-20250514',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Plan the ${speechType} speech.

Round context: ${roundContext}
${additionalInstructions ? `Additional instructions: ${additionalInstructions}` : ''}

Previous speeches and their arguments:
${JSON.stringify(previousSpeeches, null, 2)}

Current flow state:
${JSON.stringify(flowEntries, null, 2)}

Available cards in library (${availableCards.length} total):
${availableCards.slice(0, 50).map(c => `- [${c.id}] ${c.tag} (${c.cite_author})`).join('\n')}
${availableCards.length > 50 ? `\n... and ${availableCards.length - 50} more cards` : ''}`,
    }],
  });

  return JSON.parse(extractJson(text));
}

export async function assembleSpeech(
  speechType: string,
  side: string,
  strategy: string,
  sections: Array<{ label: string; action: string; content: string; tag?: string; cite?: string; evidence_html?: string }>,
  roundContext: string
): Promise<string> {
  const speechTimeLimits: Record<string, string> = {
    '1AC': '8 minutes',
    '1NC': '8 minutes',
    '2AC': '8 minutes',
    '2NC': '8 minutes',
    '1NR': '5 minutes',
    '1AR': '5 minutes',
    '2NR': '5 minutes',
    '2AR': '5 minutes',
  };

  const systemPrompt = `You are an expert policy debate speech writer assembling a complete ${speechType} speech for the ${side === 'aff' ? 'affirmative' : 'negative'}.

TIME LIMIT: ${speechTimeLimits[speechType] || '5-8 minutes'}
Note: Cards contain long evidence blocks but debaters only READ the highlighted (marked) portions aloud. The full text is on the page for the judge to read. So a speech can contain many cards — what matters is that the highlighted portions + analytics fit the time.

FORMAT AS A REAL DEBATE SPEECH:
- Start with a roadmap: "I'll be going [order of off-case/on-case positions]"
- Each argument section starts with signposting: "On the [DA/CP/K/Case]..."
- Cards: tag (bold) → citation → evidence (with highlighting preserved)
- Analytics: bold assertions written as a debater would say them aloud
- Transitions: "Next, on the..." / "Turning to the..."
- Line-by-line numbering within each section: "First... Second... Third... Next..."

DEBATE SPEECH CONVENTIONS:
- Refer to opponent arguments by number/position: "Their 1NC #3 said [X]..."
- Cross-applications: "Cross-apply our earlier [X] argument"
- Grouping: "Group their [X] responses — they all fail because..."
- Impact framing: "Weigh this on [timeframe/magnitude/probability]"
- Tag evidence before reading it: "And our [Author Year] evidence says..."

The speech should be ready to read aloud in a competitive round. A debater should be able to print this and read it at the tournament.

OUTPUT: Return the complete speech as HTML. Use:
- <h3> for section headers (e.g., "On the Spending DA")
- <div class="card-block"> around each card
- <div class="card-tag"> for tags
- <div class="card-cite"> for citations
- <div class="card-evidence"> for evidence
- <p class="analytic"> for analytics (bold, numbered)
- <mark> preserved for highlighted evidence`;

  const text = await streamMessage({
    model: 'claude-opus-4-20250514',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Assemble this ${speechType} speech.

Strategy: ${strategy}
Context: ${roundContext}

Sections to include:
${JSON.stringify(sections, null, 2)}

Write the complete speech HTML.`,
    }],
  });

  // Return the HTML content (strip any markdown code fences)
  return text.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
}

export async function generateCXQuestions(
  opponentSpeech: unknown[],
  speechType: string,
  side: string,
  roundContext: string
): Promise<Array<{ question: string; target_argument: string; strategic_goal: string; follow_ups: string[] }>> {
  const systemPrompt = `You are an expert policy debate cross-examination strategist. Generate strategic CX questions targeting the ${speechType} speech.

You are the ${side === 'aff' ? 'affirmative' : 'negative'} team questioning the ${side === 'aff' ? 'negative' : 'affirmative'}.

CX STRATEGY RULES:
- Mix of broad strategic questions and specific targeted ones
- Questions should be REALISTIC — things you'd actually ask in a round
- Focus on: exposing contradictions, getting concessions, establishing link turns, clarifying positions
- Don't make questions overly specific or nitpicky unless strategically valuable
- Include follow-up questions that build on likely answers
- Order by strategic importance

Return a JSON array of objects:
{
  "question": "The CX question",
  "target_argument": "Which argument this targets",
  "strategic_goal": "What you're trying to accomplish",
  "follow_ups": ["Follow-up question 1", "Follow-up question 2"]
}`;

  const text = await streamMessage({
    model: 'claude-opus-4-20250514',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Generate CX questions for this ${speechType}:\n\n${roundContext ? `Context: ${roundContext}\n\n` : ''}Arguments:\n${JSON.stringify(opponentSpeech, null, 2)}`,
    }],
  });

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

export async function generateCXAnswers(
  userSpeech: unknown[],
  speechType: string,
  side: string,
  roundContext: string
): Promise<Array<{ likely_question: string; suggested_answer: string; strategy_note: string }>> {
  const systemPrompt = `You are an expert policy debate CX prep coach. Predict likely cross-examination questions the opponent will ask about the ${speechType} speech and prepare strategic answers.

You are prepping the ${side === 'aff' ? 'affirmative' : 'negative'} team to ANSWER questions about their own ${speechType}.

ANSWER STRATEGY:
- Be concise — don't give away more than asked
- Avoid concessions that hurt your position
- Redirect when possible
- Know when to simply say "yes" or "no"

Return a JSON array:
{
  "likely_question": "What the opponent will probably ask",
  "suggested_answer": "How to answer strategically",
  "strategy_note": "Why this answer is strategic"
}`;

  const text = await streamMessage({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Prepare CX answers for this ${speechType}:\n\n${roundContext ? `Context: ${roundContext}\n\n` : ''}Arguments:\n${JSON.stringify(userSpeech, null, 2)}`,
    }],
  });

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

export async function explainArgument(
  argument: string,
  context: string
): Promise<string> {
  const text = await streamMessage({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You explain policy debate arguments in extremely simple, easy-to-understand language. No jargon. Use analogies. Write 2-3 short paragraphs that a non-debater could understand. Be concise.`,
    messages: [{
      role: 'user',
      content: `Explain this debate argument simply:\n\n${argument}\n\n${context ? `Context: ${context}` : ''}`,
    }],
  });

  return text;
}

export async function iterateSpeech(
  speechHtml: string,
  instruction: string
): Promise<string> {
  const text = await streamMessage({
    model: 'claude-opus-4-20250514',
    max_tokens: 16000,
    system: `You refine policy debate speeches. You can:
- Reorder arguments
- Adjust highlighting (<mark> tags)
- Modify analytics (debater-written arguments)
- Add transitions
- Adjust emphasis

You CANNOT:
- Modify evidence text within cards (only highlighting)
- Remove cards entirely (only reorder)
- Change citations

Return the complete updated speech HTML.`,
    messages: [{
      role: 'user',
      content: `Current speech:\n${speechHtml}\n\nInstruction: ${instruction}\n\nReturn the updated speech HTML.`,
    }],
  });

  return text.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();
}

export async function parseBulkCards(
  documentText: string,
  collectionName: string
): Promise<Array<{
  tag: string;
  cite_author: string;
  cite_year: string;
  cite_credentials: string;
  cite_title: string;
  cite_date: string;
  cite_url: string;
  cite_initials: string;
  evidence_html: string;
}>> {
  const text = await streamMessage({
    model: 'claude-opus-4-20250514',
    max_tokens: 16000,
    system: `You are an expert at parsing debate card collections. Given a document that contains multiple debate cards (like a camp file, theory bible, or evidence packet), split it into individual cards.

Each card has:
- A tag (bold claim/argument heading)
- A citation (author, year, credentials, title, URL)
- Evidence body (the quoted text, often with highlighting)

For each card, extract the structured fields. If evidence has bold/underline text, convert those to <mark> tags.

Return a JSON array of card objects with: tag, cite_author, cite_year, cite_credentials, cite_title, cite_date, cite_url, cite_initials, evidence_html`,
    messages: [{
      role: 'user',
      content: `Parse all individual debate cards from this ${collectionName} document:\n\n${documentText.substring(0, 60000)}`,
    }],
  });

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  return JSON.parse(match[0]);
}
