"use client";

import { useState, useEffect } from "react";

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  path: string;
  depth: number;
  sort_profile: string;
}

interface FolderItem {
  card_id: string;
  folder_id: string;
}

interface Card {
  id: string;
  tag: string;
  cite_author: string;
  cite_year: string;
}

interface Props {
  cards: Card[];
  userName: string;
  onCardClick: (id: string) => void;
}

export default function FolderView({ cards, userName, onCardClick }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState(false);
  const [sortProgress, setSortProgress] = useState("");
  const [activeProfile] = useState("default");
  const [showCustomSort, setShowCustomSort] = useState(false);
  const [customRules, setCustomRules] = useState("");
  const [dragCard, setDragCard] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const loadFolders = async () => {
    const res = await fetch(`/api/folders?profile=${activeProfile}`);
    const data = await res.json();
    setFolders(data.folders || []);
    setItems(data.items || []);
    if (data.folders?.length) {
      setExpandedFolders(new Set(data.folders.filter((f: Folder) => f.depth === 0).map((f: Folder) => f.id)));
    }
  };

  useEffect(() => { loadFolders(); }, [activeProfile]);

  const handleSort = async (mode: "default" | "custom") => {
    setSorting(true);
    setSortProgress("Classifying cards...");
    const res = await fetch("/api/folders/sort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sort_mode: mode,
        custom_rules: mode === "custom" ? customRules : undefined,
        profile_name: mode === "custom" ? `custom-${userName}` : "default",
        created_by: userName,
      }),
    });
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.label) setSortProgress(data.label);
              if (data.folders_created !== undefined) {
                setSortProgress("");
                await loadFolders();
              }
              if (data.message) setSortProgress(`Error: ${data.message}`);
            } catch {}
          }
        }
      }
    }
    setSorting(false);
    setTimeout(() => setSortProgress(""), 5000);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getCardsInFolder = (folderId: string) => {
    const cardIds = items.filter(i => i.folder_id === folderId).map(i => i.card_id);
    return cards.filter(c => cardIds.includes(c.id));
  };

  const getUnsortedCards = () => {
    const sortedCardIds = new Set(items.map(i => i.card_id));
    return cards.filter(c => !sortedCardIds.has(c.id));
  };

  const getRootFolders = () => folders.filter(f => !f.parent_id);
  const getChildFolders = (parentId: string) => folders.filter(f => f.parent_id === parentId);

  const handleDrop = async (folderId: string) => {
    if (!dragCard) return;
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign_card", card_id: dragCard, folder_id: folderId }),
    });
    setDragCard(null);
    setDragOverFolder(null);
    await loadFolders();
  };

  const handleRemoveFromFolder = async (cardId: string, folderId: string) => {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unassign_card", card_id: cardId, folder_id: folderId }),
    });
    await loadFolders();
  };

  const getTotalCount = (folder: Folder): number => {
    const direct = getCardsInFolder(folder.id).length;
    const children = getChildFolders(folder.id);
    return direct + children.reduce((sum, c) => sum + getTotalCount(c), 0);
  };

  const renderFolder = (folder: Folder): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = getChildFolders(folder.id);
    const folderCards = getCardsInFolder(folder.id);
    const totalCount = getTotalCount(folder);
    const isDragTarget = dragOverFolder === folder.id;
    const isRoot = folder.depth === 0;
    const isSecond = folder.depth === 1;

    return (
      <div key={folder.id}>
        <div
          onClick={() => toggleFolder(folder.id)}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folder.id); }}
          onDragLeave={() => setDragOverFolder(null)}
          onDrop={(e) => { e.preventDefault(); handleDrop(folder.id); }}
          className={`flex items-center cursor-pointer select-none transition-colors ${
            isDragTarget ? 'bg-white/5' : 'hover:bg-white/[0.03]'
          } ${isRoot ? 'py-2.5 px-3' : 'py-1.5 px-3'}`}
          style={{ paddingLeft: 12 + folder.depth * 24 }}
        >
          {/* Expand arrow */}
          <svg
            className={`w-3 h-3 mr-2 text-[#555] transition-transform duration-150 shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>

          {/* Folder icon */}
          <svg className={`w-4 h-4 mr-2.5 shrink-0 ${isExpanded ? 'text-[#888]' : 'text-[#555]'}`} fill="currentColor" viewBox="0 0 20 20">
            {isExpanded ? (
              <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clipRule="evenodd" />
            ) : (
              <path d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            )}
            {isExpanded && <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />}
          </svg>

          {/* Name */}
          <span className={`flex-1 truncate ${
            isRoot ? 'text-[14px] font-semibold text-white' :
            isSecond ? 'text-[13px] font-medium text-[#ddd]' :
            'text-[13px] text-[#bbb]'
          }`}>
            {folder.name}
          </span>

          {/* Count */}
          {totalCount > 0 && (
            <span className="text-[11px] text-[#555] ml-2 tabular-nums">{totalCount}</span>
          )}
        </div>

        {/* Children */}
        {isExpanded && (
          <>
            {childFolders.map(cf => renderFolder(cf))}
            {folderCards.map(card => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDragCard(card.id)}
                className="flex items-center group hover:bg-white/[0.03] transition-colors py-1.5 px-3"
                style={{ paddingLeft: 12 + (folder.depth + 1) * 24 + 20 }}
              >
                <svg className="w-3 h-3 mr-2.5 text-[#333] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <span
                  className="text-[12px] text-[#888] flex-1 truncate cursor-pointer hover:text-white transition-colors"
                  onClick={() => onCardClick(card.id)}
                >
                  {card.tag}
                </span>
                <span className="text-[11px] text-[#444] shrink-0 ml-2">{card.cite_author} {card.cite_year}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveFromFolder(card.id, folder.id); }}
                  className="ml-2 text-[#333] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  const unsorted = getUnsortedCards();

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleSort("default")}
          disabled={sorting || cards.length === 0}
          className={`px-4 py-1.5 text-[12px] rounded-md font-medium transition-colors ${
            sorting
              ? 'bg-[#222] text-[#888] cursor-wait'
              : 'bg-white text-black hover:bg-[#e5e5e5]'
          } disabled:opacity-30`}
        >
          {sorting ? "Sorting..." : "Auto-Sort"}
        </button>
        <button
          onClick={() => setShowCustomSort(!showCustomSort)}
          className={`px-3 py-1.5 text-[12px] rounded-md border transition-colors ${
            showCustomSort ? "border-[#444] text-white bg-[#1a1a1a]" : "border-[#222] text-[#888] hover:text-white hover:border-[#444]"
          }`}
        >
          Custom
        </button>
        {folders.length > 0 && (
          <span className="text-[11px] text-[#444] ml-auto">{folders.length} folders</span>
        )}
      </div>

      {/* Custom sort */}
      {showCustomSort && (
        <div className="p-3 border border-[#1a1a1a] rounded-lg space-y-2">
          <textarea
            value={customRules}
            onChange={(e) => setCustomRules(e.target.value)}
            placeholder="Describe how to organize your cards..."
            className="w-full px-3 py-2 text-[13px] bg-[#0a0a0a] border border-[#1a1a1a] rounded-md text-white placeholder:text-[#444] focus:outline-none focus:border-[#333] min-h-[50px] resize-y"
          />
          <button
            onClick={() => handleSort("custom")}
            disabled={sorting || !customRules.trim()}
            className="px-4 py-1.5 text-[12px] bg-white text-black rounded-md hover:bg-[#e5e5e5] disabled:opacity-30 font-medium"
          >
            Apply
          </button>
        </div>
      )}

      {/* Progress */}
      {sortProgress && (
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#888]">
          {sorting && <div className="animate-spin w-3 h-3 border border-[#555] border-t-white rounded-full" />}
          {sortProgress}
        </div>
      )}

      {/* Tree */}
      {folders.length > 0 && (
        <div className="border border-[#1a1a1a] rounded-lg overflow-hidden divide-y divide-[#0f0f0f]">
          {getRootFolders().map(f => renderFolder(f))}
        </div>
      )}

      {/* Unsorted */}
      {unsorted.length > 0 && folders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#555]">
            <span>Unsorted</span>
            <span className="text-[11px] text-[#444]">{unsorted.length}</span>
          </div>
          <div className="border border-[#1a1a1a] rounded-lg overflow-hidden">
            {unsorted.slice(0, 20).map((card, i) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDragCard(card.id)}
                className={`flex items-center px-4 py-1.5 hover:bg-white/[0.03] cursor-move transition-colors ${
                  i > 0 ? 'border-t border-[#0f0f0f]' : ''
                }`}
              >
                <svg className="w-3 h-3 mr-2.5 text-[#333] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <span className="text-[12px] text-[#888] flex-1 truncate cursor-pointer hover:text-white" onClick={() => onCardClick(card.id)}>
                  {card.tag}
                </span>
                <span className="text-[11px] text-[#444] ml-2">{card.cite_author} {card.cite_year}</span>
              </div>
            ))}
            {unsorted.length > 20 && (
              <div className="px-4 py-2 text-[11px] text-[#444] border-t border-[#0f0f0f]">+{unsorted.length - 20} more</div>
            )}
          </div>
        </div>
      )}

      {/* Empty */}
      {folders.length === 0 && cards.length > 0 && !sorting && (
        <div className="text-center py-12 text-[13px] text-[#555]">
          Click <strong className="text-white">Auto-Sort</strong> to organize {cards.length} cards
        </div>
      )}
    </div>
  );
}
