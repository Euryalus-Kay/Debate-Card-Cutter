"use client";

import { useEffect, useRef, useState } from "react";
import { useTimer, SLOTS } from "./TimerContext";
import { formatTime, timerColor } from "@/lib/timing";
import {
  PlayIcon,
  PauseIcon,
  ResetIcon,
  ClockIcon,
} from "@/components/ui/icons";

export default function FloatingTimer() {
  const { state, startSpeech, startAffPrep, startNegPrep, pause, reset, setWidgetMinimized, setWidgetOpen, setWidgetPosition, nextSlot, prevSlot } = useTimer();
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [, force] = useState(0);

  // Re-render every 250ms while running so the displayed time updates smoothly
  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [state.running]);

  if (!state.widgetOpen) return null;

  const slot = SLOTS[state.activeSlotIdx];
  const totalForCur =
    state.mode === "speech"
      ? slot?.duration ?? 0
      : state.mode === "aff-prep"
      ? state.affPrep
      : state.mode === "neg-prep"
      ? state.negPrep
      : 0;
  const remaining =
    state.mode === "speech"
      ? state.speechRemaining
      : state.mode === "aff-prep"
      ? state.affPrep
      : state.mode === "neg-prep"
      ? state.negPrep
      : 0;
  const color = timerColor(remaining, Math.max(1, totalForCur));

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: state.widgetX,
      oy: state.widgetY,
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const onMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const w = state.widgetMinimized ? 180 : 280;
    const h = state.widgetMinimized ? 48 : 220;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, dragRef.current.ox + dx));
    const y = Math.max(8, Math.min(window.innerHeight - h - 8, dragRef.current.oy + dy));
    setWidgetPosition(x, y);
  };
  const onUp = () => {
    dragRef.current = null;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };

  const isRunning = state.running;
  const modeLabel =
    state.mode === "speech"
      ? state.activeSpeech || "Speech"
      : state.mode === "aff-prep"
      ? "AFF prep"
      : state.mode === "neg-prep"
      ? "NEG prep"
      : "Idle";

  return (
    <div
      style={{
        position: "fixed",
        left: state.widgetX,
        top: state.widgetY,
        width: state.widgetMinimized ? 180 : 280,
        zIndex: 50,
        userSelect: "none",
      }}
      className="surface-elev anim-scale-in"
    >
      <div
        onMouseDown={onMouseDown}
        className="flex items-center justify-between px-2.5 py-1.5 cursor-move border-b border-[var(--border-subtle)]"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <ClockIcon size={11} className="text-[var(--text-tertiary)] shrink-0" />
          <span className="text-[10.5px] text-[var(--text-tertiary)] truncate">
            {modeLabel}
          </span>
          {state.shareKey && (
            <span
              className="badge badge-green text-[8px] py-0 px-1"
              title="Synced with partner"
            >
              ⚡ Sync
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWidgetMinimized(!state.widgetMinimized)}
            className="text-[var(--text-faint)] hover:text-white text-[10px] px-1.5"
            title={state.widgetMinimized ? "expand" : "minimize"}
          >
            {state.widgetMinimized ? "□" : "—"}
          </button>
          <button
            onClick={() => setWidgetOpen(false)}
            className="text-[var(--text-faint)] hover:text-white text-[12px] leading-none px-1"
            title="close"
          >
            ×
          </button>
        </div>
      </div>

      {state.widgetMinimized ? (
        <div className="px-3 py-2 flex items-center justify-between">
          <div
            className="font-mono font-bold text-[18px] tabular-nums"
            style={{ color }}
          >
            {formatTime(remaining)}
          </div>
          <div className="flex items-center gap-1">
            {isRunning ? (
              <button
                onClick={pause}
                className="w-6 h-6 rounded-md bg-[var(--bg-elev-3)] hover:bg-[var(--bg-elev-4)] flex items-center justify-center text-white"
                title="pause"
              >
                <PauseIcon size={10} />
              </button>
            ) : (
              <button
                onClick={() =>
                  state.mode === "speech"
                    ? startSpeech()
                    : state.mode === "aff-prep"
                    ? startAffPrep()
                    : startNegPrep()
                }
                className="w-6 h-6 rounded-md bg-[var(--accent-blue)] hover:bg-blue-400 flex items-center justify-center text-white"
                title="start"
              >
                <PlayIcon size={10} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3">
          <div className="text-center mb-2">
            <div
              className="font-mono font-bold text-[36px] tabular-nums leading-none"
              style={{ color }}
            >
              {formatTime(remaining)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mb-2 text-[10px]">
            <button
              onClick={startAffPrep}
              className={`px-2 py-1.5 rounded-md border transition-colors text-left ${
                state.mode === "aff-prep"
                  ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)]"
                  : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
              }`}
              title="Start AFF prep"
            >
              <div className="text-[var(--accent-blue)] font-semibold">AFF</div>
              <div className="font-mono text-white">{formatTime(state.affPrep)}</div>
            </button>
            <button
              onClick={startNegPrep}
              className={`px-2 py-1.5 rounded-md border transition-colors text-left ${
                state.mode === "neg-prep"
                  ? "border-[var(--accent-red)] bg-red-500/10"
                  : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
              }`}
              title="Start NEG prep"
            >
              <div className="text-[var(--accent-red)] font-semibold">NEG</div>
              <div className="font-mono text-white">{formatTime(state.negPrep)}</div>
            </button>
          </div>

          <div className="flex items-center gap-1 mb-2">
            <button
              onClick={prevSlot}
              className="px-1.5 py-1 text-[10px] rounded text-[var(--text-tertiary)] hover:text-white hover:bg-[var(--bg-elev-2)]"
              title="prev"
            >
              ◀
            </button>
            <button
              onClick={() => startSpeech()}
              className="flex-1 text-[10.5px] px-2 py-1 rounded-md bg-[var(--bg-elev-2)] hover:bg-[var(--bg-elev-3)] text-white truncate"
              title="restart this speech"
            >
              {slot?.speech || "—"}
            </button>
            <button
              onClick={nextSlot}
              className="px-1.5 py-1 text-[10px] rounded text-[var(--text-tertiary)] hover:text-white hover:bg-[var(--bg-elev-2)]"
              title="next"
            >
              ▶
            </button>
          </div>

          <div className="flex items-center gap-1">
            {isRunning ? (
              <button
                onClick={pause}
                className="flex-1 px-2 py-1.5 rounded-md bg-[var(--bg-elev-3)] text-white text-[11px] flex items-center justify-center gap-1.5"
              >
                <PauseIcon size={11} /> Pause
              </button>
            ) : (
              <button
                onClick={() =>
                  state.mode === "speech" || state.mode === "idle"
                    ? startSpeech()
                    : state.mode === "aff-prep"
                    ? startAffPrep()
                    : startNegPrep()
                }
                className="flex-1 px-2 py-1.5 rounded-md bg-[var(--accent-blue)] text-white text-[11px] flex items-center justify-center gap-1.5"
              >
                <PlayIcon size={11} /> Start
              </button>
            )}
            <button
              onClick={reset}
              className="px-2 py-1.5 rounded-md bg-[var(--bg-elev-3)] text-[var(--text-tertiary)] hover:text-white text-[11px] flex items-center justify-center"
              title="reset current"
            >
              <ResetIcon size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
