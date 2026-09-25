"use client";

import { Fragment } from "react";
import type { BodyBlock, BodyText } from "@/domain/card";
import { normalizeHighlights, normalizeSpans } from "@/domain/card";
import { highlightCss } from "@/shared/draft-model";
import { cn } from "@/components/ui";

/** Read-only rendering of verbatim text with underline / emphasis / highlight spans. */
export function BodyTextView({ block }: { block: BodyText }) {
  const len = block.text.length;
  const ul = normalizeSpans(block.underline, len);
  const em = normalizeSpans(block.emphasis, len);
  const hl = normalizeHighlights(block.highlight, len);
  const cuts = new Set<number>([0, len]);
  for (const s of [...ul, ...em, ...hl]) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const parts: React.ReactNode[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (b <= a) continue;
    const seg = block.text.slice(a, b);
    const isEm = em.some((s) => a >= s.start && a < s.end);
    const isUl = isEm || ul.some((s) => a >= s.start && a < s.end);
    const h = hl.find((s) => a >= s.start && a < s.end);
    let node: React.ReactNode = seg;
    if (isEm) node = <span className="mark-emphasis">{node}</span>;
    else if (isUl) node = <u>{node}</u>;
    if (h) node = <mark style={{ background: highlightCss(h.color) }}>{node}</mark>;
    parts.push(<Fragment key={i}>{node}</Fragment>);
  }
  return <>{parts}</>;
}

export function CardBodyView({ body, className, shrink }: { body: BodyBlock[]; className?: string; shrink?: boolean }) {
  const paras: React.ReactNode[][] = [];
  let cur: React.ReactNode[] | null = null;
  body.forEach((b, i) => {
    if (b.kind === "text") {
      if (b.newParagraph || !cur) {
        cur = [];
        paras.push(cur);
      } else cur.push(" ");
      cur.push(<BodyTextView key={i} block={b} />);
    } else if (b.kind === "omission") {
      if (!cur) {
        cur = [];
        paras.push(cur);
      }
      cur.push(
        <span key={i} className="node-omission">
          {" "}
          {b.marker}{" "}
        </span>,
      );
    } else {
      if (!cur) {
        cur = [];
        paras.push(cur);
      }
      cur.push(
        <span key={i} className="node-insertion">
          [{b.text}]
        </span>,
      );
    }
  });
  return (
    <div className={cn("card-view card-body space-y-1.5 text-[14px] leading-relaxed", shrink && "shrink-unread", className)}>
      {paras.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
