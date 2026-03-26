const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY!;

interface PerplexitySource {
  title: string;
  url: string;
  snippet: string;
}

interface PerplexityResult {
  answer: string;
  sources: PerplexitySource[];
}

export async function searchEvidence(query: string, context: string, rapid?: boolean): Promise<PerplexityResult> {
  const systemPrompt = `You are a research assistant for high school policy debate. Your job is to find specific, high-quality evidence from academic papers, policy analyses, government reports, think tank publications, law review articles, and expert testimony that can be used as evidence cards in competitive debate.

When searching, prioritize:
1. Specific claims with data, statistics, or expert analysis
2. Sources from credible authors with relevant credentials
3. Recent publications (within last 5 years preferred)
4. Sources that make strong, quotable claims

For each source you find, provide:
- The full author name(s) and their credentials/affiliations
- The exact publication title
- The publication date
- The URL
- A substantial excerpt that contains the key argument

Return the most relevant 3-5 sources.`;

  const userPrompt = `Find debate evidence for the following argument:
${query}

${context ? `Additional context: ${context}` : ""}

I need sources with substantial, quotable text that can be used as evidence in a competitive policy debate round. The evidence should directly support or provide warrants for the argument described above.`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: rapid ? "sonar" : "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: rapid ? 2000 : 4000,
      return_citations: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const answer = data.choices[0].message.content;
  const citations = data.citations || [];

  const sources: PerplexitySource[] = citations.map((url: string, i: number) => ({
    title: `Source ${i + 1}`,
    url,
    snippet: "",
  }));

  return { answer, sources };
}

export async function deepSearchSource(url: string, query: string): Promise<string> {
  const systemPrompt = `You are a research assistant. Given a URL and a research query, find and return the COMPLETE, UNMODIFIED text of the most relevant article/document at that URL. Include the full text - do not summarize or truncate. If the source has an author bio or credentials section, include that too.`;

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Get the full text from this source: ${url}\n\nRelevant to this debate argument: ${query}` },
      ],
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Perplexity deep search error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
