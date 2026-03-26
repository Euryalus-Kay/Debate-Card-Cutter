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
    if (!cardRef.current) return;

    try {
      // Get the HTML content for clipboard (preserves formatting in Google Docs)
      const html = cardRef.current.innerHTML;

      // Also get plain text version
      const text = cardRef.current.innerText;

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(cardRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("copy");
      selection?.removeAllRanges();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format the citation with bold author name
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
    // Try to bold the first part before the parenthesis
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
    <div className="border border-[var(--border)] rounded-lg bg-[var(--card-bg)] overflow-hidden">
      {/* Card header with actions */}
      {showActions && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[#0d0d0d]">
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>{authorName}</span>
            {createdAt && (
              <>
                <span>-</span>
                <span>{new Date(createdAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyToClipboard}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-[var(--border)] hover:bg-[var(--accent)] text-[var(--fg)]"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            {onIterate && (
              <button
                onClick={() => setShowIterate(!showIterate)}
                className="px-3 py-1 text-xs rounded bg-[var(--border)] hover:bg-[var(--accent)] text-[var(--fg)] transition-colors"
              >
                Iterate
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-1 text-xs rounded bg-[var(--border)] hover:bg-red-600 text-[var(--fg)] transition-colors"
              >
                Delete
              </button>
            )}
            <a
              href={`/card/${id}`}
              className="px-3 py-1 text-xs rounded bg-[var(--border)] hover:bg-[var(--accent)] text-[var(--fg)] transition-colors"
            >
              View
            </a>
          </div>
        </div>
      )}

      {/* The actual card content (this is what gets copied) */}
      <div ref={cardRef} className="p-4 space-y-2">
        {/* Tag */}
        <div className="card-tag">{tag}</div>

        {/* Citation */}
        <div className="card-cite">{formatCite()}</div>

        {/* Evidence */}
        <div
          className="card-evidence mt-2"
          dangerouslySetInnerHTML={{ __html: evidenceHtml }}
        />
      </div>

      {/* Iterate panel */}
      {showIterate && onIterate && (
        <div className="px-4 py-3 border-t border-[var(--border)] bg-[#0d0d0d]">
          <div className="flex gap-2">
            <input
              type="text"
              value={iterateInput}
              onChange={(e) => setIterateInput(e.target.value)}
              placeholder="e.g., Highlight more about costs, shorten the tag, emphasize the impact..."
              className="flex-1 px-3 py-2 text-sm bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
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
              className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded disabled:opacity-50 transition-colors"
            >
              {isLoading ? "..." : "Go"}
            </button>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            AI will adjust highlights and tag only. Evidence text is never modified.
          </p>
        </div>
      )}
    </div>
  );
}
