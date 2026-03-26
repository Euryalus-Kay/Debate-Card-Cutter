"use client";

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
  const filledCount = slots.filter(s => s.status === 'filled').length;
  const totalNonCX = slots.filter(s => !s.isCX).length;

  return (
    <div className="space-y-1.5">
      {/* Progress summary */}
      <div className="px-3 py-2 mb-2 rounded-lg bg-[#111] border border-[#1a1a1a]">
        <div className="text-[11px] text-[#888] mb-1.5">Speeches uploaded</div>
        <div className="flex gap-1">
          {slots.filter(s => !s.isCX).map(slot => (
            <div
              key={slot.type}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                slot.status === 'filled'
                  ? slot.isUser ? 'bg-blue-500' : 'bg-orange-500'
                  : slot.status === 'generating'
                  ? 'bg-blue-400 animate-pulse'
                  : 'bg-[#222]'
              }`}
            />
          ))}
        </div>
        <div className="text-[10px] text-[#555] mt-1">{filledCount}/{totalNonCX} speeches</div>
      </div>

      {slots.map((slot) => {
        const isActive = activeSlot === slot.type;
        const isFilled = slot.status === 'filled';

        return (
          <button
            key={slot.type}
            onClick={() => onSlotClick(slot.type)}
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
              isActive
                ? slot.isUser
                  ? 'border-blue-500/40 bg-blue-500/10'
                  : 'border-orange-500/40 bg-orange-500/10'
                : isFilled
                ? 'border-[#2a2a2a] bg-[#111]'
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
                  isActive ? 'text-white' : isFilled ? 'text-[#ddd]' : 'text-[#666]'
                }`}>
                  {slot.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!slot.isCX && (
                  <span className="text-[10px] text-[#555]">{slot.time}min</span>
                )}
                {isFilled && (
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {slot.status === 'generating' && (
                  <div className="animate-spin w-3.5 h-3.5 border-2 border-[#333] border-t-blue-400 rounded-full" />
                )}
                {slot.status === 'empty' && (
                  <span className="text-[10px] text-[#444]">empty</span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
