import { extractText, getDocumentProxy, getMeta } from "unpdf";
import Anthropic from "@anthropic-ai/sdk";
const which = process.argv[2];
if (which === "pdf") {
  const res = await fetch(process.argv[3]);
  const buf = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(buf, { verbosity: 0 } as never);
  const meta = await getMeta(pdf);
  console.log("META", JSON.stringify(meta.info).slice(0, 600));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text as string[];
  console.log("pages", pages.length);
  console.log(JSON.stringify(pages[1].slice(0, 1500)));
} else {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: "https://api.anthropic.com" });
  const res = await client.messages.create({ model: "claude-haiku-4-5", max_tokens: 100, tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 1 } as never], messages: [{ role: "user", content: `Fetch ${process.argv[3]} and reply only with DONE.` }] });
  for (const b of res.content as any[]) if (b.type === "web_fetch_tool_result") { const d = b.content?.content?.source?.data ?? ""; console.log("TITLE", b.content?.content?.title); console.log(d.slice(0, 2500)); console.log("..."); }
}
