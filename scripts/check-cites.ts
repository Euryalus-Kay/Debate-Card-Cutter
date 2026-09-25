import { db } from "@/server/db/client";
import { cards } from "@/server/db/schema";
const rows = await db().select({ shortCite: cards.shortCite, citation: cards.citation, tag: cards.tag }).from(cards).limit(60);
for (const r of rows) {
  const c = r.citation as { authors: { name: string }[]; date?: { year?: number }; url?: string; title?: string; raw?: string };
  console.log(JSON.stringify(r.shortCite).padEnd(34), "year:", c.date?.year ?? "—", "| url:", c.url ? "yes" : "no", "| title:", c.title ? c.title.slice(0, 40) : "—");
}
