"use client";

import { useState, useRef } from 'react';

interface Props {
  onSubmit: (content: string, sourceType: 'paste' | 'upload', filename?: string, hasHighlights?: boolean) => void;
  isLoading?: boolean;
}

export default function DocumentUpload({ onSubmit, isLoading }: Props) {
  const [mode, setMode] = useState<'paste' | 'upload'>('paste');
  const [text, setText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/parse-document', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    onSubmit(data.html || data.text, 'upload', file.name, data.has_highlights);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => setMode('paste')}
          className={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
            mode === 'paste' ? 'bg-[#1a1a1a] text-white' : 'text-[#666] hover:text-[#aaa]'
          }`}
        >
          Paste Text
        </button>
        <button
          onClick={() => setMode('upload')}
          className={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
            mode === 'upload' ? 'bg-[#1a1a1a] text-white' : 'text-[#666] hover:text-[#aaa]'
          }`}
        >
          Upload File
        </button>
      </div>

      {mode === 'paste' ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste speech content here..."
            className="w-full h-48 px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-[#ddd] placeholder:text-[#777] focus:outline-none focus:border-[#333] resize-y"
          />
          <button
            onClick={() => text.trim() && onSubmit(text, 'paste')}
            disabled={isLoading || !text.trim()}
            className="px-4 py-2 text-[13px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors"
          >
            {isLoading ? 'Processing...' : 'Submit Speech'}
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            dragOver ? 'border-blue-500/50 bg-blue-500/5' : 'border-[#1a1a1a] hover:border-[#333]'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.pdf,.txt,.doc"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {fileName ? (
            <span className="text-[13px] text-[#ccc]">{fileName}</span>
          ) : (
            <>
              <span className="text-[24px] mb-2">📄</span>
              <span className="text-[13px] text-[#666]">Drop a .docx, .pdf, or .txt file</span>
              <span className="text-[11px] text-[#888] mt-1">or click to browse</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
