"use client";

/**
 * Bind a plain <textarea> to a shared Y.Text. Local typing is written as a
 * minimal diff (so a partner's concurrent typing elsewhere survives); remote
 * edits update the box and keep the cursor where it was relative to the text
 * around it.
 */

import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { applyTextDiff } from "@/shared/round-doc";

export function useBoundText(text: Y.Text | null) {
  const [value, setValue] = useState(() => text?.toString() ?? "");
  const [bound, setBound] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  if (bound !== text) {
    setBound(text);
    setValue(text?.toString() ?? "");
  }
  useEffect(() => {
    if (!text) return;
    const onChange = (e: Y.YTextEvent, tr: Y.Transaction) => {
      const el = ref.current;
      const next = text.toString();
      if (tr.local || !el || document.activeElement !== el) {
        setValue(next);
        return;
      }
      let pos = 0;
      let start = el.selectionStart;
      let end = el.selectionEnd;
      for (const d of e.delta) {
        if (d.retain) pos += d.retain;
        else if (typeof d.insert === "string") {
          if (pos <= start) start += d.insert.length;
          if (pos <= end) end += d.insert.length;
          pos += d.insert.length;
        } else if (d.delete) {
          if (pos < start) start -= Math.min(d.delete, start - pos);
          if (pos < end) end -= Math.min(d.delete, end - pos);
        }
      }
      setValue(next);
      requestAnimationFrame(() => el.setSelectionRange(start, end));
    };
    text.observe(onChange);
    return () => text.unobserve(onChange);
  }, [text]);
  return {
    ref,
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      if (text) applyTextDiff(text, e.target.value);
    },
  };
}
