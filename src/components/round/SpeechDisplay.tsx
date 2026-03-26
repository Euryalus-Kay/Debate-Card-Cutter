"use client";

import { useState, useRef } from 'react';

interface Props {
  speechType: string;
  html: string;
  rawContent: string;
  sourceType?: string;
  sourceFilename?: string;
  onIterate?: (instruction: string) => void;
  onExplain?: (text: string) => void;
  isLoading?: boolean;
}

export default function SpeechDisplay({ speechType, html, rawContent, sourceType, sourceFilename, onIterate, onExplain, isLoading }: Props) {
  const [copied, setCopied] = useState(false);
  const [showIterate, setShowIterate] = useState(false);
  const [iterateInput, setIterateInput] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const content = html || rawContent;
  const wordCount = (rawContent || '').split(/\s+/).filter(Boolean).length;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([content], { type: 'text/html' }),
          'text/plain': new Blob([contentRef.current?.innerText || ''], { type: 'text/plain' }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (contentRef.current) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(contentRef.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('copy');
        selection?.removeAllRanges();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] overflow-hidden">
      {/* Header with status */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-white">{speechType}</span>
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-[11px] text-green-500/80">Uploaded</span>
          </div>
          <span className="text-[10px] text-[#555]">
            {wordCount.toLocaleString()} words
            {sourceFilename ? ` · ${sourceFilename}` : sourceType === 'paste' ? ' · pasted' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyToClipboard}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
              copied ? 'text-green-400' : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {onIterate && (
            <button
              onClick={() => setShowIterate(!showIterate)}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                showIterate ? 'text-white bg-[#1a1a1a]' : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
              }`}
            >
              Iterate
            </button>
          )}
          {onExplain && (
            <button
              onClick={() => onExplain(contentRef.current?.innerText || rawContent)}
              className="px-2.5 py-1 text-[11px] text-[#888] hover:text-white hover:bg-[#1a1a1a] rounded-md transition-colors"
            >
              Explain
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className="p-4 prose prose-invert prose-sm max-w-none card-evidence overflow-auto"
        style={{ fontSize: '12px', lineHeight: '1.5', maxHeight: '600px' }}
        dangerouslySetInnerHTML={{ __html: content }}
      />

      {/* Iterate panel */}
      {showIterate && onIterate && (
        <div className="px-4 py-3 border-t border-[#1a1a1a]">
          <div className="flex gap-2">
            <input
              type="text"
              value={iterateInput}
              onChange={(e) => setIterateInput(e.target.value)}
              placeholder="e.g., Add more impact comparison, extend the DA..."
              autoFocus
              className="flex-1 px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#777] focus:outline-none focus:border-[#333]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && iterateInput.trim()) {
                  onIterate(iterateInput);
                  setIterateInput('');
                  setShowIterate(false);
                }
              }}
            />
            <button
              onClick={() => {
                if (iterateInput.trim()) {
                  onIterate(iterateInput);
                  setIterateInput('');
                  setShowIterate(false);
                }
              }}
              disabled={isLoading || !iterateInput.trim()}
              className="px-4 py-2 text-[13px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30"
            >
              {isLoading ? '...' : 'Go'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
