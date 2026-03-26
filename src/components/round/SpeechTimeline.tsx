"use client";

import { useState } from 'react';

interface SpeechSlot {
  type: string;
  label: string;
  speaker: 'aff' | 'neg';
  time: number;
  isCX?: boolean;
  status: 'empty' | 'filled' | 'generating';
  isUser: boolean;
}

interface Props {
  slots: SpeechSlot[];
  activeSlot: string | null;
  onSlotClick: (type: string) => void;
}

export default function SpeechTimeline({ slots, activeSlot, onSlotClick }: Props) {
  return (
    <div className="space-y-1">
      {slots.map((slot) => {
        const isActive = activeSlot === slot.type;
        const userColor = slot.isUser ? 'border-blue-500/40' : 'border-orange-500/40';
        const bgActive = slot.isUser ? 'bg-blue-500/10' : 'bg-orange-500/10';

        return (
          <button
            key={slot.type}
            onClick={() => onSlotClick(slot.type)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
              isActive
                ? `${userColor} ${bgActive}`
                : slot.status === 'filled'
                ? 'border-[#333] bg-[#111]'
                : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  slot.isUser ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                }`}>
                  {slot.isUser ? 'You' : 'Opp'}
                </span>
                <span className={`text-[13px] font-medium ${
                  isActive ? 'text-white' : 'text-[#ccc]'
                }`}>
                  {slot.label}
                </span>
                {slot.isCX && (
                  <span className="text-[10px] text-[#666]">({slot.time}m)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!slot.isCX && (
                  <span className="text-[10px] text-[#999]">{slot.time}min</span>
                )}
                {slot.status === 'filled' && (
                  <span className="w-2 h-2 rounded-full bg-green-500/60" />
                )}
                {slot.status === 'generating' && (
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
