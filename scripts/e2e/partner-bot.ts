/**
 * Simulated partner: a second client (user B) edits the same draft through the
 * real HTTP sync while a human edits in the browser. Appends a paragraph to a
 * named section repeatedly, then reports its final view of the document.
 */
import { readFileSync } from "node:fs";
import * as Y from "yjs";
import { DocSync } from "@/client/sync/doc-sync";
import { DRAFT_FRAGMENT } from "@/shared/editor/schema";
import { fragmentText } from "@/shared/doc-text";

const [docId, cookieFile, sectionTitle, rounds = "12"] = process.argv.slice(2);
const cookie = readFileSync(cookieFile, "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#") || l.startsWith("#HttpOnly_"))
  .map((l) => l.replace(/^#HttpOnly_/, "").split("\t"))
  .filter((p) => p.length >= 7)
  .map((p) => `${p[5]}=${p[6]}`)
  .join("; ");
const base = "http://localhost:3100";
const sync = new DocSync(docId, new Y.Doc(), {
  persistence: false,
  endpoint: (id) => `${base}/api/docs/${id}/sync`,
  fetch: ((url: string, init?: RequestInit) => fetch(url, { ...init, headers: { ...(init?.headers ?? {}), cookie } })) as typeof fetch,
  idleIntervalMs: 800,
  debounceMs: 100,
});
await sync.start();
sync.setPresence({ section: "", activity: "editing", name: "Partner Bot" });
const frag = sync.doc.getXmlFragment(DRAFT_FRAGMENT);

function findSection(el: Y.XmlFragment | Y.XmlElement): Y.XmlElement | null {
  for (const child of el.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === "section") {
      const heading = child.toArray().find((c) => c instanceof Y.XmlElement && c.nodeName === "heading") as Y.XmlElement | undefined;
      if (heading && fragmentText(heading).trim() === sectionTitle) return child;
    }
    const inner = findSection(child);
    if (inner) return inner;
  }
  return null;
}

const section = findSection(frag);
if (!section) throw new Error(`section "${sectionTitle}" not found`);
const para = new Y.XmlElement("paragraph");
const text = new Y.XmlText();
para.insert(0, [text]);
sync.doc.transact(() => section.insert(section.length, [para]));
for (let i = 0; i < Number(rounds); i++) {
  sync.doc.transact(() => text.insert(text.length, `[partner edit ${i}] `));
  await new Promise((r) => setTimeout(r, 500));
}
await sync.flush();
await new Promise((r) => setTimeout(r, 3000));
await sync.sync();
console.log(JSON.stringify({ status: sync.snapshot.status, pending: sync.snapshot.pending, text: fragmentText(frag) }));
sync.stop();
process.exit(0);
