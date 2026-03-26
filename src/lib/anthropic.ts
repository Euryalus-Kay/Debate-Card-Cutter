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
