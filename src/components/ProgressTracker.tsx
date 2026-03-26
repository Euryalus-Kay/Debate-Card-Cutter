"use client";

const icons: Record<string, string> = {
  search: "🔍",
  filter: "📋",
  download: "📥",
  sparkle: "✨",
  save: "💾",
};

interface Step {
  step: number;
  total: number;
  label: string;
  icon: string;
}

export default function ProgressTracker({ current }: { current: Step | null }) {
  if (!current) return null;

  const steps = [
    { icon: "search", name: "Search" },
    { icon: "filter", name: "Select" },
    { icon: "download", name: "Fetch" },
    { icon: "sparkle", name: "Generate" },
    { icon: "save", name: "Save" },
  ];

  const pct = (current.step / current.total) * 100;

  return (
    <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] p-5 space-y-4">
      {/* Progress bar */}
      <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps */}
      <div className="flex justify-between">
        {steps.map((s, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === current.step;
          const isDone = stepNum < current.step;

          return (
            <div key={s.icon} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-300 ${
                  isActive
                    ? "bg-blue-500/20 border border-blue-500/50 scale-110"
                    : isDone
                    ? "bg-[#1a1a1a] border border-[#333]"
                    : "bg-[#0d0d0d] border border-[#1a1a1a]"
                }`}
              >
                {isDone ? (
                  <span className="text-green-400 text-xs">✓</span>
                ) : (
                  <span className={isActive ? "" : "opacity-30"}>
                    {icons[s.icon]}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] ${
                  isActive ? "text-blue-400" : isDone ? "text-[#999]" : "text-[#777]"
                }`}
              >
                {s.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current status */}
      <div className="flex items-center gap-2">
        <div className="animate-spin w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-400 rounded-full" />
        <span className="text-[13px] text-[#999]">{current.label}</span>
      </div>
    </div>
  );
}
