"use client";

interface Props {
  explanation: string;
  isLoading: boolean;
  onClose: () => void;
}

export default function ExplainModal({ explanation, isLoading, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#111] border border-[#1a1a1a] rounded-xl max-w-lg w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-medium text-white">AI Explanation</h3>
          <button onClick={onClose} className="text-[#999] hover:text-white text-lg">×</button>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <div className="animate-spin w-4 h-4 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
            <span className="text-[13px] text-[#888]">Thinking...</span>
          </div>
        ) : (
          <div className="text-[13px] text-[#ccc] leading-relaxed whitespace-pre-wrap">
            {explanation}
          </div>
        )}
      </div>
    </div>
  );
}
