"use client";

interface Step {
  step: number | string;
  total: number;
  label: string;
  icon: string;
  cardProgress?: {
    done: number;
    total: number;
    justCompleted?: string;
    cards?: Array<{ label: string; status: string }>;
  };
}

export default function ProgressTracker({ current }: { current: Step | null }) {
  if (!current) return null;

  const stepNum = typeof current.step === 'number' ? current.step : 0;
  const pct = current.total > 0 ? (stepNum / current.total) * 100 : 0;
  const isParallel = current.cardProgress && current.cardProgress.total > 1;

  return (
    <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] p-5 space-y-4">
      {/* Progress bar */}
      <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${isParallel ? (current.cardProgress!.done / current.cardProgress!.total) * 100 : pct}%` }}
        />
      </div>

      {/* Parallel card generation view */}
      {isParallel && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-blue-400 font-medium">
              Generating {current.cardProgress!.total} cards in parallel
            </span>
            <span className="text-[11px] text-[#666]">
              {current.cardProgress!.done}/{current.cardProgress!.total} complete
            </span>
          </div>

          {/* Card grid showing parallel progress */}
          <div className="grid grid-cols-2 gap-1.5">
            {current.cardProgress!.cards?.map((card, i) => (
              <div
                key={i}
                className={`px-2.5 py-1.5 rounded text-[10px] border transition-all ${
                  card.status === 'done'
                    ? 'border-green-500/30 bg-green-500/5 text-green-400'
                    : 'border-[#1a1a1a] bg-[#111] text-[#888]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {card.status === 'done' ? (
                    <span className="text-green-400">✓</span>
                  ) : (
                    <div className="animate-spin w-2.5 h-2.5 border border-[#444] border-t-blue-400 rounded-full" />
                  )}
                  <span className="truncate">{card.label}</span>
                </div>
              </div>
            )) || (
              // Fallback: show progress dots
              <div className="col-span-2 flex gap-1">
                {Array.from({ length: current.cardProgress!.total }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full transition-all ${
                      i < current.cardProgress!.done
                        ? 'bg-green-500'
                        : 'bg-[#222] animate-pulse'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {current.cardProgress!.justCompleted && (
            <div className="text-[10px] text-green-400/70">
              ✓ {current.cardProgress!.justCompleted}
            </div>
          )}
        </div>
      )}

      {/* Current status */}
      <div className="flex items-center gap-2">
        <div className="animate-spin w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
        <span className="text-[13px] text-[#999]">{current.label}</span>
      </div>
    </div>
  );
}
