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

// Color coding by folder name
function getFolderColor(name: string, depth: number): { bg: string; border: string; text: string; dot: string } {
  const n = name.toLowerCase();
  if (n === 'affirmative' || n === 'aff') return { bg: 'bg-blue-950/20', border: 'border-blue-500/20', text: 'text-blue-300', dot: 'bg-blue-500' };
  if (n === 'negative' || n === 'neg') return { bg: 'bg-red-950/20', border: 'border-red-500/20', text: 'text-red-300', dot: 'bg-red-500' };
  if (n === 'flexible' || n === 'neutral') return { bg: 'bg-purple-950/20', border: 'border-purple-500/20', text: 'text-purple-300', dot: 'bg-purple-500' };
  if (n.includes('disadv') || n === 'das') return { bg: 'bg-orange-950/20', border: 'border-orange-500/20', text: 'text-orange-300', dot: 'bg-orange-500' };
  if (n.includes('counterp') || n === 'cps') return { bg: 'bg-emerald-950/20', border: 'border-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-500' };
  if (n.includes('kritik') || n === 'ks') return { bg: 'bg-violet-950/20', border: 'border-violet-500/20', text: 'text-violet-300', dot: 'bg-violet-500' };
  if (n.includes('topical') || n === 't') return { bg: 'bg-amber-950/20', border: 'border-amber-500/20', text: 'text-amber-300', dot: 'bg-amber-500' };
  if (n.includes('case')) return { bg: 'bg-cyan-950/20', border: 'border-cyan-500/20', text: 'text-cyan-300', dot: 'bg-cyan-500' };
  if (n.includes('theory')) return { bg: 'bg-pink-950/20', border: 'border-pink-500/20', text: 'text-pink-300', dot: 'bg-pink-500' };
  if (depth === 0) return { bg: 'bg-[#111]', border: 'border-[#2a2a2a]', text: 'text-white', dot: 'bg-[#666]' };
  if (depth === 1) return { bg: 'bg-[#0d0d0d]', border: 'border-[#222]', text: 'text-[#ddd]', dot: 'bg-[#555]' };
  return { bg: 'bg-transparent', border: 'border-[#1a1a1a]', text: 'text-[#ccc]', dot: 'bg-[#444]' };
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
    // Auto-expand root folders
    if (data.folders?.length) {
      setExpandedFolders(new Set(data.folders.filter((f: Folder) => f.depth === 0).map((f: Folder) => f.id)));
    }
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
                setSortProgress(`Done — ${data.folders_created} folders, ${data.cards_sorted} cards sorted`);
                await loadFolders();
              }
              if (data.message) setSortProgress(`Error: ${data.message}`);
            } catch {}
          }
        }
      }
    }
    setSorting(false);
    setTimeout(() => setSortProgress(""), 6000);
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

  const renderFolder = (folder: Folder): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = getChildFolders(folder.id);
    const folderCards = getCardsInFolder(folder.id);
    const totalItems = childFolders.length + folderCards.length;
    const colors = getFolderColor(folder.name, folder.depth);
    const isDragTarget = dragOverFolder === folder.id;

    return (
      <div key={folder.id}>
        <button
          onClick={() => toggleFolder(folder.id)}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folder.id); }}
          onDragLeave={() => setDragOverFolder(null)}
          onDrop={(e) => { e.preventDefault(); handleDrop(folder.id); }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-lg border transition-all ${
            isDragTarget
              ? 'border-blue-500 bg-blue-500/10'
              : `${colors.border} ${isExpanded ? colors.bg : 'hover:bg-[#111]'}`
          }`}
          style={{ marginLeft: folder.depth * 20 }}
        >
          <span className={`text-[10px] transition-transform duration-200 text-[#666] ${isExpanded ? "rotate-90" : ""}`}>
            ▶
          </span>
          <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
          <span className={`text-[13px] font-medium flex-1 ${colors.text}`}>{folder.name}</span>
          {totalItems > 0 && (
            <span className="text-[10px] text-[#555] bg-[#1a1a1a] px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {totalItems}
            </span>
          )}
        </button>

        {isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {childFolders.map(cf => renderFolder(cf))}
            {folderCards.map(card => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDragCard(card.id)}
                className="flex items-center gap-2 py-1.5 px-3 rounded-md hover:bg-[#111] cursor-move group transition-colors"
                style={{ marginLeft: (folder.depth + 1) * 20 }}
              >
                <span className="w-1 h-1 rounded-full bg-[#333]" />
                <span
                  className="text-[12px] text-[#aaa] flex-1 truncate cursor-pointer hover:text-white transition-colors"
                  onClick={() => onCardClick(card.id)}
                >
                  {card.tag}
                </span>
                <span className="text-[10px] text-[#444] shrink-0">{card.cite_author} {card.cite_year}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveFromFolder(card.id, folder.id); }}
                  className="text-[10px] text-[#333] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const unsorted = getUnsortedCards();

  return (
    <div className="space-y-3">
      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleSort("default")}
          disabled={sorting || cards.length === 0}
          className="px-3.5 py-1.5 text-[11px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 font-medium transition-colors"
        >
          {sorting ? "Sorting..." : "Auto-Sort"}
        </button>
        <button
          onClick={() => setShowCustomSort(!showCustomSort)}
          className={`px-3 py-1.5 text-[11px] rounded-lg border transition-colors ${
            showCustomSort ? "border-blue-500/40 text-blue-400 bg-blue-950/20" : "border-[#1a1a1a] text-[#888] hover:text-white hover:border-[#333]"
          }`}
        >
          Custom
        </button>
        {folders.length > 0 && (
          <span className="text-[10px] text-[#555] ml-1">
            {folders.length} folders · {items.length} sorted
          </span>
        )}
      </div>

      {/* Custom sort */}
      {showCustomSort && (
        <div className="p-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg space-y-2">
          <textarea
            value={customRules}
            onChange={(e) => setCustomRules(e.target.value)}
            placeholder="e.g., Sort by topic (trade, environment, security), then offense vs defense..."
            className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#555] focus:outline-none focus:border-[#333] min-h-[50px] resize-y"
          />
          <button
            onClick={() => handleSort("custom")}
            disabled={sorting || !customRules.trim()}
            className="px-4 py-1.5 text-[11px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30 transition-colors"
          >
            Sort with Custom Rules
          </button>
        </div>
      )}

      {/* Progress */}
      {sortProgress && (
        <div className={`px-3 py-2 rounded-lg text-[12px] flex items-center gap-2 ${
          sortProgress.startsWith("Done") ? "bg-green-950/20 border border-green-500/20 text-green-300"
          : sortProgress.startsWith("Error") ? "bg-red-950/20 border border-red-500/20 text-red-300"
          : "bg-blue-950/20 border border-blue-500/20 text-blue-300"
        }`}>
          {sorting && <div className="animate-spin w-3 h-3 border-2 border-current/30 border-t-current rounded-full" />}
          {sortProgress}
        </div>
      )}

      {/* Folder tree */}
      {folders.length > 0 && (
        <div className="space-y-0.5">
          {getRootFolders().map(f => renderFolder(f))}
        </div>
      )}

      {/* Unsorted */}
      {unsorted.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="w-2 h-2 rounded-full bg-[#333]" />
            <span className="text-[12px] text-[#666] font-medium">Unsorted</span>
            <span className="text-[10px] text-[#444]">{unsorted.length}</span>
          </div>
          <div className="space-y-0.5">
            {unsorted.slice(0, 30).map(card => (
              <div
                key={card.id}
                draggable
                onDragStart={() => setDragCard(card.id)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[#111] cursor-move transition-colors"
                style={{ marginLeft: 20 }}
              >
                <span className="w-1 h-1 rounded-full bg-[#333]" />
                <span
                  className="text-[12px] text-[#888] flex-1 truncate cursor-pointer hover:text-white transition-colors"
                  onClick={() => onCardClick(card.id)}
                >
                  {card.tag}
                </span>
                <span className="text-[10px] text-[#444]">{card.cite_author} {card.cite_year}</span>
              </div>
            ))}
            {unsorted.length > 30 && (
              <div className="text-[11px] text-[#444] px-3 py-1 ml-5">+{unsorted.length - 30} more</div>
            )}
          </div>
        </div>
      )}

      {/* Empty */}
      {folders.length === 0 && cards.length > 0 && !sorting && (
        <div className="text-center py-10">
          <p className="text-[13px] text-[#666]">Click <strong className="text-white">Auto-Sort</strong> to organize {cards.length} cards into folders</p>
        </div>
      )}
    </div>
  );
}
