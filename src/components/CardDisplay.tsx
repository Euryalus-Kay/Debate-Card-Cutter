"use client";

import { useRef, useState } from "react";

interface CardDisplayProps {
  id: string;
  tag: string;
  cite: string;
  citeAuthor?: string;
  evidenceHtml: string;
  authorName: string;
  createdAt?: string;
  onIterate?: (instruction: string) => void;
  onDelete?: () => void;
  isLoading?: boolean;
  showActions?: boolean;
}

// Convert card HTML to Google Docs-friendly format with inline styles
function toGoogleDocsHtml(tag: string, cite: string, citeAuthor: string | undefined, evidenceHtml: string): string {
  // Format tag as bold
  const tagHtml = `<p style="font-family:Georgia,serif;font-size:13px;font-weight:bold;margin:0 0 4px 0;">${tag}</p>`;

  // Format citation with bold author
  let citeHtml = cite;
  if (citeAuthor) {
    const idx = cite.indexOf(citeAuthor);
    if (idx >= 0) {
      citeHtml = cite.substring(0, idx) +
        `<b><u>${citeAuthor}</u></b>` +
        cite.substring(idx + citeAuthor.length);
    }
  } else {
    const parenIdx = cite.indexOf("(");
    if (parenIdx > 0) {
      citeHtml = `<b><u>${cite.substring(0, parenIdx).trim()}</u></b> ${cite.substring(parenIdx)}`;
    }
  }
  const citeBlock = `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 4px 0;">${citeHtml}</p>`;

  // Convert <mark> to bold+underline with inline styles for evidence
  // Non-highlighted text should be smaller
  const evidence = evidenceHtml
    .replace(/<mark>/g, '</span><b><u><span style="font-family:Georgia,serif;font-size:11px;">')
    .replace(/<\/mark>/g, '</span></u></b><span style="font-family:Georgia,serif;font-size:8px;color:#666;">');

  const evidBlock = `<p style="font-family:Georgia,serif;font-size:8px;color:#666;margin:0;line-height:1.4;"><span style="font-family:Georgia,serif;font-size:8px;color:#666;">${evidence}</span></p>`;

  return tagHtml + citeBlock + evidBlock;
}

export default function CardDisplay({
  id,
  tag,
  cite,
  citeAuthor,
  evidenceHtml,
  authorName,
  createdAt,
  onIterate,
  onDelete,
  isLoading,
  showActions = true,
}: CardDisplayProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [iterateInput, setIterateInput] = useState("");
  const [showIterate, setShowIterate] = useState(false);

  const copyToClipboard = async () => {
    try {
      // Build Google Docs-friendly HTML with inline styles
      const html = toGoogleDocsHtml(tag, cite, citeAuthor, evidenceHtml);
      const text = cardRef.current?.innerText || "";

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select and copy
      if (cardRef.current) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(cardRef.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand("copy");
        selection?.removeAllRanges();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatCite = () => {
    if (citeAuthor && cite.includes(citeAuthor)) {
      const parts = cite.split(citeAuthor);
      return (
        <>
          {parts[0]}
          <span className="author-name">{citeAuthor}</span>
          {parts.slice(1).join(citeAuthor)}
        </>
      );
    }
    const parenIdx = cite.indexOf("(");
    if (parenIdx > 0) {
      return (
        <>
          <span className="author-name">{cite.substring(0, parenIdx).trim()}</span>{" "}
          {cite.substring(parenIdx)}
        </>
      );
    }
    return cite;
  };

  return (
    <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] overflow-hidden">
      {/* Header */}
      {showActions && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2 text-[11px] text-[#444]">
            <span>{authorName}</span>
            {createdAt && (
              <>
                <span className="text-[#222]">/</span>
                <span>{new Date(createdAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={copyToClipboard}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                copied
                  ? "text-green-400"
                  : "text-[#555] hover:text-white hover:bg-[#1a1a1a]"
              }`}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            {onIterate && (
              <button
                onClick={() => setShowIterate(!showIterate)}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                  showIterate
                    ? "text-white bg-[#1a1a1a]"
                    : "text-[#555] hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                Iterate
              </button>
            )}
            <a
              href={`/card/${id}`}
              className="px-2.5 py-1 text-[11px] text-[#555] hover:text-white hover:bg-[#1a1a1a] rounded-md transition-colors"
            >
              View
            </a>
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-2.5 py-1 text-[11px] text-[#555] hover:text-red-400 hover:bg-[#1a1a1a] rounded-md transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Card content */}
      <div ref={cardRef} className="p-4 space-y-2">
        <div className="card-tag">{tag}</div>
        <div className="card-cite">{formatCite()}</div>
        <div
          className="card-evidence mt-2"
          dangerouslySetInnerHTML={{ __html: evidenceHtml }}
        />
      </div>

      {/* Iterate panel */}
      {showIterate && onIterate && (
        <div className="px-4 py-3 border-t border-[#1a1a1a]">
          <div className="flex gap-2">
            <input
              type="text"
              value={iterateInput}
              onChange={(e) => setIterateInput(e.target.value)}
              placeholder="e.g., Highlight more about costs, shorten the tag..."
              autoFocus
              className="flex-1 px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors"
              onKeyDown={(e) => {
                if (e.key === "Enter" && iterateInput.trim()) {
                  onIterate(iterateInput);
                  setIterateInput("");
                  setShowIterate(false);
                }
              }}
            />
            <button
              onClick={() => {
                if (iterateInput.trim()) {
                  onIterate(iterateInput);
                  setIterateInput("");
                  setShowIterate(false);
                }
              }}
              disabled={isLoading || !iterateInput.trim()}
              className="px-4 py-2 text-[13px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors"
            >
              {isLoading ? "..." : "Go"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-[#333]">
            Adjusts highlights and tag only. Evidence text is never modified.
          </p>
        </div>
      )}
    </div>
  );
}
