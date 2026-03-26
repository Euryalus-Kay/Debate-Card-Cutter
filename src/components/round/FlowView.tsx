"use client";

import { useState } from 'react';

interface FlowCell {
  text: string;
  status: string;
}

interface FlowRow {
  id: string;
  row_index: number;
  category: string;
  label: string;
  entries: Record<string, FlowCell>;
}

interface Props {
  rows: FlowRow[];
  onCellEdit: (rowId: string, speechType: string, text: string) => void;
  onExport: () => void;
  isGenerating?: boolean;
}

const SPEECH_COLS = ['1AC', '1NC', '2AC', '2NC', '1NR', '1AR', '2NR', '2AR'];

const statusColors: Record<string, string> = {
  new: 'border-l-blue-500',
  answered: 'border-l-[#333]',
  dropped: 'border-l-red-500',
  turned: 'border-l-yellow-500',
  extended: 'border-l-green-500',
};

const statusBadges: Record<string, { label: string; color: string }> = {
  dropped: { label: 'DROP', color: 'text-red-400 bg-red-500/10' },
  turned: { label: 'TURN', color: 'text-yellow-400 bg-yellow-500/10' },
};

export default function FlowView({ rows, onCellEdit, onExport, isGenerating }: Props) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<string | null>(null);

  const categories = [...new Set(rows.map(r => r.category))];

  const toggleCategory = (cat: string) => {
    const next = new Set(collapsedCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setCollapsedCategories(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-medium text-white">Flow</h3>
        <div className="flex gap-2">
          {isGenerating && (
            <span className="text-[11px] text-blue-400 flex items-center gap-1.5">
              <span className="animate-spin w-3 h-3 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
              Generating...
            </span>
          )}
          <button
            onClick={onExport}
            className="px-3 py-1.5 text-[11px] text-[#888] hover:text-white border border-[#1a1a1a] hover:border-[#333] rounded-md transition-colors"
          >
            Export .xlsx
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 text-[#444] text-[13px]">
          No flow data yet. Add speeches to generate the flow.
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#1a1a1a] rounded-lg">
          <div className="min-w-[1200px]">
            {/* Header */}
            <div className="grid grid-cols-[180px_repeat(8,1fr)] bg-[#111] border-b border-[#1a1a1a] sticky top-0 z-10">
              <div className="px-3 py-2 text-[11px] font-medium text-[#888] border-r border-[#1a1a1a]">
                Argument
              </div>
              {SPEECH_COLS.map(col => (
                <div key={col} className="px-2 py-2 text-[11px] font-medium text-center text-[#888] border-r border-[#1a1a1a] last:border-r-0">
                  {col}
                </div>
              ))}
            </div>

            {/* Rows grouped by category */}
            {categories.map(cat => {
              const catRows = rows.filter(r => r.category === cat);
              const isCollapsed = collapsedCategories.has(cat);

              return (
                <div key={cat}>
                  {/* Category header */}
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full px-3 py-1.5 text-left text-[11px] font-medium text-[#aaa] bg-[#0d0d0d] border-b border-[#1a1a1a] hover:bg-[#111] transition-colors flex items-center gap-2"
                  >
                    <span className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                    {cat.toUpperCase().replace(/-/g, ' — ')}
                    <span className="text-[#555]">({catRows.length})</span>
                  </button>

                  {/* Rows */}
                  {!isCollapsed && catRows.map(row => (
                    <div key={row.id} className="grid grid-cols-[180px_repeat(8,1fr)] border-b border-[#1a1a1a] hover:bg-[#0d0d0d] group">
                      {/* Label */}
                      <div className="px-3 py-2 text-[11px] text-[#ccc] border-r border-[#1a1a1a] truncate" title={row.label}>
                        {row.label}
                      </div>

                      {/* Cells */}
                      {SPEECH_COLS.map(col => {
                        const cell = row.entries[col];
                        const cellKey = `${row.id}-${col}`;
                        const isEditing = editingCell === cellKey;

                        return (
                          <div
                            key={col}
                            className={`px-2 py-1.5 text-[10px] border-r border-[#1a1a1a] last:border-r-0 border-l-2 min-h-[32px] ${
                              cell ? statusColors[cell.status] || 'border-l-[#1a1a1a]' : 'border-l-transparent'
                            }`}
                            onClick={() => setEditingCell(cellKey)}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                defaultValue={cell?.text || ''}
                                className="w-full bg-transparent text-[10px] text-white outline-none"
                                onBlur={(e) => {
                                  onCellEdit(row.id, col, e.target.value);
                                  setEditingCell(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    onCellEdit(row.id, col, (e.target as HTMLInputElement).value);
                                    setEditingCell(null);
                                  }
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                              />
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className={`${cell?.text ? 'text-[#ccc]' : 'text-transparent group-hover:text-[#333]'}`}>
                                  {cell?.text || '—'}
                                </span>
                                {cell?.status && statusBadges[cell.status] && (
                                  <span className={`text-[8px] font-bold px-1 py-0.5 rounded w-fit ${statusBadges[cell.status].color}`}>
                                    {statusBadges[cell.status].label}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
