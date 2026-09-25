/**
 * Minimal streaming XML tokenizer for OOXML parts. Single pass, no DOM, so
 * large camp files (tens of MB of document.xml) parse with little memory.
 */

export type XmlToken =
  | { type: "open"; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: "close"; name: string }
  | { type: "text"; text: string };

const TAG_RE = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|([^<]+)/g;
const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e: string) => {
    switch (e) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
        if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
        return m;
    }
  });
}

export function* tokenize(xml: string): Generator<XmlToken> {
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(xml))) {
    if (m[2]) {
      if (m[1] === "/") {
        yield { type: "close", name: m[2] };
      } else {
        const attrs: Record<string, string> = {};
        if (m[3]) {
          ATTR_RE.lastIndex = 0;
          let a: RegExpExecArray | null;
          while ((a = ATTR_RE.exec(m[3]))) attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? "");
        }
        yield { type: "open", name: m[2], attrs, selfClosing: m[4] === "/" };
      }
    } else if (m[5] !== undefined) {
      yield { type: "text", text: m[5] };
    } else if (m[6] !== undefined) {
      yield { type: "text", text: decodeEntities(m[6]) };
    }
  }
}
