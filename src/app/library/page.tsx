"use client";

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/components/AppShell';
import CardDisplay from '@/components/CardDisplay';

interface CardLib {
  id: string;
  collection_name: string;
  uploaded_by: string;
  file_name: string;
  created_at: string;
}

interface Card {
  id: string;
  tag: string;
  cite: string;
  cite_author: string;
  evidence_html: string;
  author_name: string;
  library_id: string | null;
  created_at: string;
}

export default function LibraryPage() {
  const { userName } = useApp();
  const [collections, setCollections] = useState<CardLib[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadLibrary = async () => {
    const res = await fetch(`/api/library/search?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    setCards(data || []);
    setLoading(false);
  };

  useEffect(() => { loadLibrary(); }, [search]);

  useEffect(() => {
    fetch('/api/library').then(r => r.json()).then(data => {
      setCollections(data.collections || []);
    }).catch(() => {});
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress('Processing document...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('collection_name', file.name.replace(/\.[^.]+$/, ''));
    formData.append('uploaded_by', userName);

    const res = await fetch('/api/library/upload', { method: 'POST', body: formData });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.label) setUploadProgress(data.label);
              if (data.count !== undefined) {
                setUploadProgress(`Imported ${data.count} cards`);
                await loadLibrary();
              }
            } catch {}
          }
        }
      }
    }
    setUploading(false);
    setTimeout(() => setUploadProgress(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Card Library</h1>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".docx,.pdf,.txt" className="hidden"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 text-[13px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors"
          >
            {uploading ? 'Uploading...' : 'Upload Cards'}
          </button>
        </div>
      </div>

      {uploadProgress && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#111] rounded-lg border border-[#1a1a1a]">
          {uploading && <div className="animate-spin w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />}
          <span className="text-[12px] text-[#ccc]">{uploadProgress}</span>
        </div>
      )}

      {collections.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {collections.map(c => (
            <span key={c.id} className="text-[11px] px-2 py-1 bg-[#111] border border-[#1a1a1a] rounded text-[#888]">
              {c.collection_name} <span className="text-[#555]">by {c.uploaded_by}</span>
            </span>
          ))}
        </div>
      )}

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search cards by tag, author, or citation..."
        className="w-full px-4 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#444] focus:outline-none focus:border-[#333]"
      />

      {loading ? (
        <div className="text-center py-12 text-[#666] text-[13px]">Loading...</div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12 text-[#666] text-[13px]">No cards found.</div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-[#666]">{cards.length} cards</p>
          {cards.map(card => (
            <CardDisplay
              key={card.id}
              id={card.id}
              tag={card.tag}
              cite={card.cite}
              citeAuthor={card.cite_author}
              evidenceHtml={card.evidence_html}
              authorName={card.author_name}
              createdAt={card.created_at}
              showActions={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}
