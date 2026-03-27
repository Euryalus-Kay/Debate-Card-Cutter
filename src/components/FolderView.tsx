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
  const [activeProfile, setActiveProfile] = useState("default");
  const [showCustomSort, setShowCustomSort] = useState(false);
  const [customRules, setCustomRules] = useState("");
  const [dragCard, setDragCard] = useState<string | null>(null);

  const loadFolders = async () => {
    const res = await fetch(`/api/folders?profile=${activeProfile}`);
    const data = await res.json();
    setFolders(data.folders || []);
    setItems(data.items || []);
  };

  useEffect(() => { loadFolders(); }, [activeProfile]);

  const handleSort = async (mode: "default" | "custom") => {
    setSorting(true);
    setSortProgress("Starting...");

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
                setSortProgress(`✓ Created ${data.folders_created} folders, sorted ${data.cards_sorted} cards`);
                if (data.profile) setActiveProfile(data.profile);
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

  const renderFolder = (folder: Folder): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = getChildFolders(folder.id);
    const folderCards = getCardsInFolder(folder.id);
    const totalItems = childFolders.length + folderCards.length;

    return (
      <div key={folder.id} style={{ marginLeft: folder.depth * 16 }}>
        <button
          onClick={() => toggleFolder(folder.id)}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-blue-500/50"); }}
          onDragLeave={(e) => { e.currentTarget.classList.remove("border-blue-500/50"); }}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-blue-500/50"); handleDrop(folder.id); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#111] rounded-lg border border-transparent transition-colors group"
        >
          <span className={`text-[11px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
          <span className="text-[13px]">📁</span>
          <span className="text-[13px] text-[#ddd] flex-1">{folder.name}</span>
          <span className="text-[10px] text-[#555]">{totalItems}</span>
        </button>

        {isExpanded && (
          <div className="ml-2">
            {childFolders.map(cf => renderFolder(cf))}
            {folderCards.map(card => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDragCard(card.id)}
                className="flex items-center gap-2 px-3 py-1.5 ml-4 hover:bg-[#111] rounded cursor-move group"
              >
                <span className="text-[12px] text-[#999] flex-1 truncate cursor-pointer hover:text-white"
                  onClick={() => onCardClick(card.id)}
                >
                  {card.tag}
                </span>
                <span className="text-[10px] text-[#555]">{card.cite_author} {card.cite_year}</span>
                <button
                  onClick={() => handleRemoveFromFolder(card.id, folder.id)}
                  className="text-[10px] text-[#444] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove from folder"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const unsorted = getUnsortedCards();

  return (
    <div className="space-y-4">
      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleSort("default")}
          disabled={sorting || cards.length === 0}
          className="px-3 py-1.5 text-[11px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 font-medium"
        >
          {sorting ? "Sorting..." : "Auto-Sort All"}
        </button>
        <button
          onClick={() => setShowCustomSort(!showCustomSort)}
          className={`px-3 py-1.5 text-[11px] rounded-lg border transition-colors ${
            showCustomSort ? "border-blue-500/50 text-blue-400 bg-blue-950/30" : "border-[#1a1a1a] text-[#888] hover:text-white"
          }`}
        >
          Custom Sort
        </button>
        {folders.length > 0 && (
          <span className="text-[10px] text-[#555]">
            {folders.length} folders · {items.length} assignments
          </span>
        )}
      </div>

      {/* Custom sort input */}
      {showCustomSort && (
        <div className="space-y-2 p-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg">
          <label className="text-[11px] text-[#888]">How should the AI sort your cards?</label>
          <textarea
            value={customRules}
            onChange={(e) => setCustomRules(e.target.value)}
            placeholder="e.g., Sort by topic area (trade, environment, security), then by whether it's offense or defense, then by specific argument name..."
            className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#555] focus:outline-none focus:border-[#333] min-h-[60px] resize-y"
          />
          <button
            onClick={() => handleSort("custom")}
            disabled={sorting || !customRules.trim()}
            className="px-4 py-1.5 text-[11px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30"
          >
            Sort with Custom Rules
          </button>
        </div>
      )}

      {/* Sort progress */}
      {sortProgress && (
        <div className={`px-3 py-2 rounded-lg text-[12px] ${
          sortProgress.startsWith("✓") ? "bg-green-950/30 border border-green-500/30 text-green-300"
          : sortProgress.startsWith("Error") ? "bg-red-950/30 border border-red-500/30 text-red-300"
          : "bg-blue-950/30 border border-blue-500/30 text-blue-300"
        }`}>
          {sorting && <span className="inline-block animate-spin mr-2">⟳</span>}
          {sortProgress}
        </div>
      )}

      {/* Folder tree */}
      {folders.length > 0 && (
        <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] p-2">
          {getRootFolders().map(f => renderFolder(f))}
        </div>
      )}

      {/* Unsorted cards */}
      {unsorted.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] text-[#888]">Unsorted</span>
            <span className="text-[10px] text-[#555]">{unsorted.length} cards</span>
          </div>
          <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] p-2 space-y-0.5">
            {unsorted.slice(0, 20).map(card => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDragCard(card.id)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#111] rounded cursor-move"
              >
                <span className="text-[12px] text-[#999] flex-1 truncate cursor-pointer hover:text-white"
                  onClick={() => onCardClick(card.id)}
                >
                  {card.tag}
                </span>
                <span className="text-[10px] text-[#555]">{card.cite_author} {card.cite_year}</span>
              </div>
            ))}
            {unsorted.length > 20 && (
              <div className="text-[11px] text-[#555] px-3 py-1">...and {unsorted.length - 20} more</div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {folders.length === 0 && cards.length > 0 && !sorting && (
        <div className="text-center py-8 text-[#555]">
          <p className="text-[13px]">No folders yet. Click <strong>Auto-Sort All</strong> to organize your {cards.length} cards.</p>
        </div>
      )}
    </div>
  );
}
