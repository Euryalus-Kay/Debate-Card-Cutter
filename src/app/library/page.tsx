"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
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
  cite_year: string;
  evidence_html: string;
  author_name: string;
  library_id: string | null;
  argument_id: string | null;
  created_at: string;
}

interface ArgumentComponent {
  index: number;
  type: string;
  label: string;
  purpose: string;
  id?: string;
  tag?: string;
  cite?: string;
  cite_author?: string;
  evidence_html?: string;
  content?: string;
  sectionHeader?: string;
}

interface Argument {
  id: string;
  title: string;
  description: string;
  author_name: string;
  card_ids: string[];
  argument_type?: string;
  strategy_overview?: string;
  file_notes?: string;
  components?: ArgumentComponent[];
  created_at: string;
}

function shortTag(tag: string): string {
  if (tag.length <= 70) return tag;
  return tag.substring(0, 67) + '...';
}

function authorShort(cite: string): string {
  const parenIdx = cite.indexOf('(');
  if (parenIdx > 0) return cite.substring(0, parenIdx).trim();
  return cite.substring(0, 30);
}

function typeColor(argType?: string): string {
  switch (argType) {
    case 'aff': return 'bg-blue-900/30 text-blue-400';
    case 'da': return 'bg-red-900/30 text-red-400';
    case 'cp': return 'bg-green-900/30 text-green-400';
    case 'k': return 'bg-purple-900/30 text-purple-400';
    case 't': return 'bg-yellow-900/30 text-yellow-400';
    case 'theory': return 'bg-orange-900/30 text-orange-400';
    default: return 'bg-[#1a1a1a] text-[#888]';
  }
}

function typeLabel(argType?: string): string {
  switch (argType) {
    case 'aff': return 'AFF';
    case 'da': return 'DA';
    case 'cp': return 'CP';
    case 'k': return 'K';
    case 't': return 'T';
    case 'theory': return 'Theory';
    default: return 'Custom';
  }
}

export default function LibraryPage() {
  const { userName } = useApp();
  const [tab, setTab] = useState<'cards' | 'arguments'>('cards');
  const [collections, setCollections] = useState<CardLib[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [arguments_, setArguments] = useState<Argument[]>([]);
  const [argCards, setArgCards] = useState<Record<string, Card[]>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [expandedArgId, setExpandedArgId] = useState<string | null>(null);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCards = useCallback(async () => {
    const res = await fetch(`/api/library/search?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    setCards(data || []);
    setLoading(false);
  }, [search]);

  useEffect(() => { loadCards(); }, [loadCards]);

  useEffect(() => {
    fetch('/api/library').then(r => r.json()).then(data => {
      setCollections(data.collections || []);
    }).catch(() => {});

    // Load arguments
    fetch('/api/cards').then(r => r.json()).then(async (allCards: Card[]) => {
      const argRes = await fetch('/api/argument?list=true');
      if (argRes.ok) {
        const args = await argRes.json();
        setArguments(args || []);
        const grouped: Record<string, Card[]> = {};
        for (const card of allCards) {
          if (card.argument_id) {
            if (!grouped[card.argument_id]) grouped[card.argument_id] = [];
            grouped[card.argument_id].push(card);
          }
        }
        setArgCards(grouped);
      }
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
                await loadCards();
                // Refresh arguments
                const argRes = await fetch('/api/argument?list=true');
                if (argRes.ok) {
                  const args = await argRes.json();
                  setArguments(args || []);
                }
              }
            } catch {}
          }
        }
      }
    }
    setUploading(false);
    setTimeout(() => setUploadProgress(''), 3000);
  };

  const handleIterate = async (cardId: string, instruction: string) => {
    setIteratingId(cardId);
    try {
      const res = await fetch('/api/iterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, instruction }),
      });
      const data = await res.json();
      if (data.tag && data.evidence_html) {
        setCards(prev => prev.map(c =>
          c.id === cardId ? { ...c, tag: data.tag, evidence_html: data.evidence_html } : c
        ));
      }
    } catch {} finally {
      setIteratingId(null);
    }
  };

  const handleDelete = async (cardId: string) => {
    if (!confirm('Delete this card?')) return;
    await fetch(`/api/cards/${cardId}`, { method: 'DELETE' });
    setCards(prev => prev.filter(c => c.id !== cardId));
    setExpandedCardId(null);
  };

  const copyArgument = (arg: Argument, argCardList: Card[]) => {
    const html = argCardList.map(c => {
      const evidence = c.evidence_html
        .replace(/<mark>/g, '</span><b><u><span style="font-family:Georgia,serif;font-size:11px;">')
        .replace(/<\/mark>/g, '</span></u></b><span style="font-family:Georgia,serif;font-size:8px;color:#666;">');
      return `<p style="font-family:Georgia,serif;font-size:13px;font-weight:bold;margin:12px 0 4px 0;">${c.tag}</p>` +
        `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 4px 0;">${c.cite}</p>` +
        `<p style="font-family:Georgia,serif;font-size:8px;color:#666;margin:0 0 8px 0;line-height:1.4;"><span style="font-size:8px;color:#666;">${evidence}</span></p>`;
    }).join('');
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([`<p style="font-family:Georgia,serif;font-size:16px;font-weight:bold;text-align:center;">${arg.title}</p>` + html], { type: 'text/html' }),
        'text/plain': new Blob([argCardList.map(c => c.tag).join('\n\n')], { type: 'text/plain' }),
      }),
    ]).then(() => alert('Argument copied with formatting!'));
  };

  const filteredCards = cards.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.tag.toLowerCase().includes(q) || c.cite.toLowerCase().includes(q) || c.author_name.toLowerCase().includes(q);
  });

  const filteredArgs = arguments_.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Library</h1>
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#1a1a1a] pb-px">
        <button
          onClick={() => setTab('cards')}
          className={`px-4 py-2 text-[13px] rounded-t-lg transition-colors ${
            tab === 'cards' ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-white'
          }`}
        >
          Cards ({filteredCards.length})
        </button>
        <button
          onClick={() => setTab('arguments')}
          className={`px-4 py-2 text-[13px] rounded-t-lg transition-colors ${
            tab === 'arguments' ? 'bg-[#1a1a1a] text-white' : 'text-[#888] hover:text-white'
          }`}
        >
          Arguments ({filteredArgs.length})
        </button>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={tab === 'cards' ? 'Search cards by tag, author, citation...' : 'Search arguments by title or description...'}
        className="w-full px-4 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#999] focus:outline-none focus:border-[#333]"
      />

      {/* Collections */}
      {tab === 'cards' && collections.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {collections.map(c => (
            <span key={c.id} className="text-[11px] px-2 py-1 bg-[#111] border border-[#1a1a1a] rounded text-[#888]">
              {c.collection_name} <span className="text-[#999]">by {c.uploaded_by}</span>
            </span>
          ))}
        </div>
      )}

      {/* Cards tab — compact grid previews */}
      {tab === 'cards' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-[#666] text-[13px]">Loading...</div>
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-12 text-[#666] text-[13px]">No cards found.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredCards.map(card => (
                  <button
                    key={card.id}
                    onClick={() => setExpandedCardId(expandedCardId === card.id ? null : card.id)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      expandedCardId === card.id
                        ? 'border-blue-500/50 bg-blue-950/20'
                        : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333]'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-white leading-tight mb-2 line-clamp-2" style={{ fontFamily: 'Georgia, serif' }}>
                      {shortTag(card.tag)}
                    </div>
                    <div className="text-[10px] text-[#888] leading-tight mb-1.5" style={{ fontFamily: 'Georgia, serif' }}>
                      {authorShort(card.cite)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[#666]">{card.author_name}</span>
                      <span className="text-[9px] text-[#999]">
                        {new Date(card.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Expanded card */}
              {expandedCardId && (() => {
                const card = filteredCards.find(c => c.id === expandedCardId);
                if (!card) return null;
                return (
                  <div className="mt-3">
                    <CardDisplay
                      id={card.id}
                      tag={card.tag}
                      cite={card.cite}
                      citeAuthor={card.cite_author}
                      evidenceHtml={card.evidence_html}
                      authorName={card.author_name}
                      createdAt={card.created_at}
                      onIterate={instr => handleIterate(card.id, instr)}
                      onDelete={() => handleDelete(card.id)}
                      isLoading={iteratingId === card.id}
                    />
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}

      {/* Arguments tab */}
      {tab === 'arguments' && (
        <>
          {filteredArgs.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-[#666] text-[13px]">No arguments yet.</p>
              <p className="text-[#999] text-[12px]">Build arguments from the Build Argument page or upload a debate file — they&apos;ll appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredArgs.map(arg => {
                const isExpanded = expandedArgId === arg.id;
                const argCardList = argCards[arg.id] || [];

                return (
                  <div key={arg.id} className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] overflow-hidden">
                    {/* Argument header — always visible */}
                    <button
                      onClick={() => setExpandedArgId(isExpanded ? null : arg.id)}
                      className="w-full text-left px-4 py-3 hover:bg-[#111] transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {arg.argument_type && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor(arg.argument_type)}`}>
                              {typeLabel(arg.argument_type)}
                            </span>
                          )}
                          <h3 className="text-[14px] font-semibold text-white">{arg.title}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#666] bg-[#1a1a1a] px-2 py-0.5 rounded">
                            {argCardList.length} cards
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete "${arg.title}"? Cards will be kept in the library.`)) {
                                fetch('/api/argument', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: arg.id }),
                                }).then(() => {
                                  setArguments(prev => prev.filter(a => a.id !== arg.id));
                                });
                              }
                            }}
                            className="text-[10px] text-[#555] hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-red-950/30"
                            title="Delete argument"
                          >
                            ✕
                          </button>
                          <span className={`text-[#999] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                        </div>
                      </div>
                      <p className="text-[12px] text-[#888] line-clamp-2">{arg.description}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-[#666]">by {arg.author_name}</span>
                        <span className="text-[10px] text-[#999]">{new Date(arg.created_at).toLocaleDateString()}</span>
                      </div>
                    </button>

                    {/* Expanded: show all cards in the argument */}
                    {isExpanded && (
                      <div className="border-t border-[#1a1a1a]">
                        {/* File notes / strategy overview */}
                        {(arg.file_notes || arg.strategy_overview) && (
                          <div className="px-4 py-3 bg-[#060606] border-b border-[#1a1a1a]">
                            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Strategy Notes</div>
                            <p className="text-[12px] text-[#999] leading-relaxed">{arg.file_notes || arg.strategy_overview}</p>
                          </div>
                        )}

                        <div className="p-4 space-y-3">
                          {argCardList.length === 0 ? (
                            <p className="text-[12px] text-[#999]">No cards linked to this argument.</p>
                          ) : (
                            argCardList.map(card => (
                              <CardDisplay
                                key={card.id}
                                id={card.id}
                                tag={card.tag}
                                cite={card.cite}
                                citeAuthor={card.cite_author}
                                evidenceHtml={card.evidence_html}
                                authorName={card.author_name}
                                createdAt={card.created_at}
                                onIterate={instr => handleIterate(card.id, instr)}
                                isLoading={iteratingId === card.id}
                              />
                            ))
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => copyArgument(arg, argCardList)}
                              className="px-4 py-2 text-[12px] text-[#888] hover:text-white border border-[#1a1a1a] hover:border-[#333] rounded-lg transition-colors"
                            >
                              Copy Complete Argument
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
