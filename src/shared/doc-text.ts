import * as Y from "yjs";
import { roundDocText } from "./round-doc";
import { DRAFT_FRAGMENT } from "./editor/schema";

/** Plain text of an XmlFragment (block elements separated by newlines). */
export function fragmentText(frag: Y.XmlFragment | Y.XmlElement): string {
  const out: string[] = [];
  const walk = (node: Y.XmlElement | Y.XmlText | Y.XmlFragment, depth: number) => {
    if (node instanceof Y.XmlText) {
      out.push(node.toString().replace(/<[^>]+>/g, ""));
      return;
    }
    if (node instanceof Y.XmlElement) {
      const name = node.nodeName;
      if (name === "cardCite") {
        const a = node.getAttributes();
        out.push(`${a.short ?? ""} ${a.full ?? ""}`);
      } else if (name === "insertion") {
        out.push(`[${node.getAttribute("text") ?? ""}]`);
      } else if (name === "omission") {
        out.push(String(node.getAttribute("marker") ?? "…"));
      }
    }
    for (const child of (node as Y.XmlElement).toArray()) walk(child as Y.XmlElement, depth + 1);
    if (node instanceof Y.XmlElement && ["paragraph", "heading", "cardPara", "cardTag", "cardCite", "note"].includes(node.nodeName)) out.push("\n");
  };
  walk(frag, 0);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractDocText(doc: Y.Doc, kind: string): string {
  if (kind === "round_state") return roundDocText(doc);
  return fragmentText(doc.getXmlFragment(DRAFT_FRAGMENT));
}
