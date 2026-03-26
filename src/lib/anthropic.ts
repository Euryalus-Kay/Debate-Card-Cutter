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
    '1AC': 'Present the affirmative case: plan text, advantages with inherency/harms/solvency. 8 minutes.',
    '1NC': 'Present all negative positions: DAs, CPs, Ks, T, case attacks. 8 minutes.',
    '2AC': 'Answer EVERY argument from 1NC. Extend case advantages. 8 minutes. Must not drop anything.',
    '2NC': 'First half of neg block. Cover some off-case positions in depth. 8 minutes.',
    '1NR': 'Second half of neg block. Cover remaining positions not in 2NC. 5 minutes.',
    '1AR': 'Answer the ENTIRE neg block (2NC + 1NR). 5 minutes. Most time-pressured speech.',
    '2NR': 'Collapse to 1-2 strongest arguments. Extend thoroughly with impact comparison. 5 minutes.',
    '2AR': 'Final speech. Weigh arguments. Explain why judge should vote aff. 5 minutes.',
  };

  const systemPrompt = `You are an elite policy debate strategist planning a ${speechType} speech for the ${side === 'aff' ? 'affirmative' : 'negative'}.

SPEECH REQUIREMENTS: ${speechInfo[speechType] || 'Respond to existing arguments.'}

You have access to a card library. For each section of the speech, decide:
1. Use an existing library card (specify card_id)
2. Generate a new card (specify search_query for Perplexity)
3. Write an analytic (debater-written argument, no evidence needed)

Selected cards the user wants included: ${selectedCardIds.length > 0 ? selectedCardIds.join(', ') : 'None specified'}

Be SPECIFIC and STRATEGIC. Think like an experienced debater:
- Don't make broad generic arguments — target specific claims the opponent made
- For the 2NR, collapse strategically — don't go for everything
- For the 1AR, be efficient — you only have 5 minutes to answer 13+ minutes of neg arguments
- For the 2AC, have a specific answer to every off-case position

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
  const systemPrompt = `You are an expert policy debate speech writer. Assemble a complete ${speechType} speech for the ${side === 'aff' ? 'affirmative' : 'negative'}.

FORMAT THE SPEECH IN PROPER DEBATE FORMAT:
- Each argument section starts with the section label as a heading
- Cards must have: tag (bold), citation, evidence (with <mark> highlighting preserved)
- Analytics are written as regular bold assertions
- Include transitions between sections
- Include time allocation suggestions as comments

The speech should read like an actual debate speech that could be delivered in a round.

OUTPUT: Return the complete speech as HTML. Use:
- <h3> for section headers
- <div class="card-block"> around each card
- <div class="card-tag"> for tags
- <div class="card-cite"> for citations
- <div class="card-evidence"> for evidence
- <p class="analytic"> for analytics
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
