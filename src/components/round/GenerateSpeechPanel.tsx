"use client";

import { useState } from 'react';

interface Props {
  speechTypes: string[];
  onGenerate: (speechType: string, cardIds: string[], instructions: string, rapid: boolean) => void;
  isGenerating: boolean;
  progress: { step: number; total: number; label: string } | null;
  cards: Array<{ id: string; tag: string; cite_author: string }>;
}

export default function GenerateSpeechPanel({ speechTypes, onGenerate, isGenerating, progress, cards }: Props) {
  const [selectedType, setSelectedType] = useState(speechTypes[0] || '2AC');
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [rapid, setRapid] = useState(false);
  const [cardSearch, setCardSearch] = useState('');
  const [showCardPicker, setShowCardPicker] = useState(false);

  const filteredCards = cards.filter(c =>
    c.tag.toLowerCase().includes(cardSearch.toLowerCase()) ||
    c.cite_author.toLowerCase().includes(cardSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white focus:outline-none focus:border-[#333]"
        >
          {speechTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <button
          onClick={() => setRapid(!rapid)}
          className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors ${
            rapid ? 'border-amber-500/50 text-amber-400 bg-amber-500/10' : 'border-[#1a1a1a] text-[#666]'
          }`}
        >
          {rapid ? 'Rapid' : 'Standard'}
        </button>
      </div>

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Additional instructions (optional)... e.g., 'Focus on the spending DA', 'Include a politics net benefit'..."
        className="w-full h-20 px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-[#ddd] placeholder:text-[#444] focus:outline-none focus:border-[#333] resize-y"
      />

      {/* Card selector */}
      <div className="space-y-2">
        <button
          onClick={() => setShowCardPicker(!showCardPicker)}
          className="text-[12px] text-[#888] hover:text-white transition-colors flex items-center gap-1"
        >
          <span>{showCardPicker ? '▼' : '▶'}</span>
          Force specific cards ({selectedCards.length} selected)
        </button>

        {showCardPicker && (
          <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] p-3 space-y-2">
            <input
              value={cardSearch}
              onChange={(e) => setCardSearch(e.target.value)}
              placeholder="Search cards..."
              className="w-full px-3 py-1.5 text-[12px] bg-[#111] border border-[#1a1a1a] rounded text-[#ddd] placeholder:text-[#444] focus:outline-none"
            />
            <div className="max-h-40 overflow-y-auto space-y-1">
              {filteredCards.slice(0, 20).map(card => (
                <label key={card.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#111] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCards.includes(card.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedCards([...selectedCards, card.id]);
                      else setSelectedCards(selectedCards.filter(id => id !== card.id));
                    }}
                    className="accent-blue-500"
                  />
                  <span className="text-[11px] text-[#ccc] truncate">{card.tag}</span>
                  <span className="text-[10px] text-[#555] shrink-0">{card.cite_author}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => onGenerate(selectedType, selectedCards, instructions, rapid)}
        disabled={isGenerating}
        className="w-full px-4 py-2.5 text-[13px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors font-medium"
      >
        {isGenerating ? 'Generating...' : `Generate ${selectedType}`}
      </button>

      {progress && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#111] rounded-lg border border-[#1a1a1a]">
          <div className="animate-spin w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
          <span className="text-[12px] text-[#ccc]">{progress.label}</span>
          <span className="text-[10px] text-[#555] ml-auto">{progress.step}/{progress.total}</span>
        </div>
      )}
    </div>
  );
}
