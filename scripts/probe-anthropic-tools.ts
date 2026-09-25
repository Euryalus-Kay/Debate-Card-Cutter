import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: "https://api.anthropic.com" });
const t0 = Date.now();
const res = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 2000,
  tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 } as never],
  messages: [{ role: "user", content: "Find 5 credible sources (think tanks, government, academic) on whether federal Clean Water Act protection of ephemeral streams is needed versus state-level protection. Just search; list the URLs." }],
});
console.log("search ms", Date.now() - t0, "stop", res.stop_reason, "usage", JSON.stringify(res.usage));
for (const b of res.content as unknown as { type: string; content?: unknown }[]) {
  if (b.type === "web_search_tool_result") {
    const items = (b.content as { type: string; url: string; title: string; page_age?: string }[]) ?? [];
    for (const it of items.slice(0, 8)) console.log("  RESULT", it.type, it.title?.slice(0, 70), "|", it.url, "|", it.page_age ?? "");
  }
}
const url = "https://www.epa.gov/wotus/about-waters-united-states";
const t1 = Date.now();
const f = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1000,
  tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 1 } as never],
  messages: [{ role: "user", content: `Fetch ${url} and reply only with the word DONE.` }],
});
console.log("fetch ms", Date.now() - t1, "stop", f.stop_reason);
for (const b of f.content as unknown as { type: string; content?: { type: string; url?: string; content?: { source?: { type: string; data?: string; media_type?: string }; title?: string }; error_code?: string } }[]) {
  if (b.type === "web_fetch_tool_result") {
    const c = b.content!;
    console.log("  FETCH", c.type, c.url, c.error_code ?? "", "title:", c.content?.title, "media:", c.content?.source?.media_type, "chars:", c.content?.source?.data?.length);
    console.log("  SAMPLE:", c.content?.source?.data?.slice(0, 300).replace(/\n/g, " "));
  }
}
