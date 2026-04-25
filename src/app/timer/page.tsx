"use client";

import { useEffect, useState } from "react";
import { useTimer, SLOTS } from "@/components/timer/TimerContext";
import { formatTime, timerColor } from "@/lib/timing";
import { useToast } from "@/components/ui/Toast";
import {
  PlayIcon,
  PauseIcon,
  ResetIcon,
  ClockIcon,
} from "@/components/ui/icons";

export default function TimerPage() {
  const toast = useToast();
  const {
    state,
    startSpeech,
    startAffPrep,
    startNegPrep,
    pause,
    reset,
    setSlot,
    setShareKey,
    setWidgetOpen,
    resetMatch,
    publishToPartner,
  } = useTimer();

  const [shareKeyDraft, setShareKeyDraft] = useState(state.shareKey || "");

  // Live re-render every 250ms while running
  const [, force] = useState(0);
  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [state.running]);

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
  const pct = totalForCur > 0
    ? Math.max(0, Math.min(100, (remaining / totalForCur) * 100))
    : 0;

  const generateRoomKey = () => {
    const k = (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6)).toUpperCase();
    setShareKeyDraft(k);
    setShareKey(k);
    publishToPartner();
    toast.success(
      "Sync room created",
      `Share code: ${k} — your partner pastes it on their /timer page.`
    );
  };

  return (
    <>
      <div className="mb-6 anim-fade-in">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
              <ClockIcon size={18} className="text-[var(--accent-red)]" />
              Round timer
            </h1>
            <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1">
              Speech timer + separate AFF/NEG prep budgets. Floating widget stays
              visible across all pages — minimize it when you switch tabs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!state.widgetOpen && (
              <button
                onClick={() => setWidgetOpen(true)}
                className="btn-secondary"
              >
                Pop floating timer
              </button>
            )}
            <button onClick={resetMatch} className="btn-ghost">
              Reset match
            </button>
          </div>
        </div>
      </div>

      {/* Main timer card */}
      <div
        className="surface-elev py-12 px-6 text-center anim-scale-in mb-5"
        style={{ borderTop: `3px solid ${color}` }}
      >
        <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-faint)] mb-3">
          {state.mode === "speech"
            ? `Speech · ${state.activeSpeech || slot?.speech || "—"}`
            : state.mode === "aff-prep"
            ? "AFF prep"
            : state.mode === "neg-prep"
            ? "NEG prep"
            : "Idle"}
        </div>
        <div
          className="font-mono font-bold text-[96px] tabular-nums leading-none"
          style={{ color }}
        >
          {formatTime(remaining)}
        </div>
        <div
          className="mt-4 mx-auto progress-bar"
          style={{ maxWidth: "480px", height: "8px" }}
        >
          <div
            className="progress-bar-fill"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>

        <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
          {!state.running ? (
            <button
              onClick={() =>
                state.mode === "speech" || state.mode === "idle"
                  ? startSpeech()
                  : state.mode === "aff-prep"
                  ? startAffPrep()
                  : startNegPrep()
              }
              className="btn-primary"
            >
              <PlayIcon size={13} /> Start
            </button>
          ) : (
            <button onClick={pause} className="btn-secondary">
              <PauseIcon size={13} /> Pause
            </button>
          )}
          <button onClick={reset} className="btn-secondary">
            <ResetIcon size={13} /> Reset
          </button>
        </div>
      </div>

      {/* Prep budgets — clickable */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          onClick={startAffPrep}
          className={`stat-tile text-left transition-all ${
            state.mode === "aff-prep"
              ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)]"
              : ""
          }`}
        >
          <div className="stat-tile-label flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--accent-blue)" }}
            />
            AFF prep · click to start
          </div>
          <div className="stat-tile-value font-mono">
            {formatTime(state.affPrep)}
          </div>
        </button>
        <button
          onClick={startNegPrep}
          className={`stat-tile text-left transition-all ${
            state.mode === "neg-prep"
              ? "border-[var(--accent-red)] bg-red-500/10"
              : ""
          }`}
        >
          <div className="stat-tile-label flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--accent-red)" }}
            />
            NEG prep · click to start
          </div>
          <div className="stat-tile-value font-mono">
            {formatTime(state.negPrep)}
          </div>
        </button>
      </div>

      {/* Speech timeline */}
      <div className="mb-5">
        <h2 className="text-[12px] uppercase tracking-wider text-[var(--text-faint)] mb-2">
          Round flow · click any speech to make it active
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
          {SLOTS.map((s, i) => {
            const isActive = i === state.activeSlotIdx && state.mode === "speech";
            const isPast = i < state.activeSlotIdx;
            return (
              <button
                key={s.speech + i}
                onClick={() => setSlot(i)}
                className={`px-2 py-2.5 rounded-md border transition-all text-left ${
                  isActive
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)]"
                    : isPast
                    ? "border-[var(--border-subtle)] bg-[var(--bg-elev-1)] opacity-60"
                    : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background:
                        s.side === "aff"
                          ? "var(--accent-blue)"
                          : "var(--accent-red)",
                    }}
                  />
                  <span className="text-[11px] font-semibold text-white">
                    {s.speech}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-tertiary)] font-mono">
                  {Math.floor(s.duration / 60)}m
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Partner sync */}
      <div className="surface-elev p-4">
        <h2 className="text-[12.5px] font-semibold mb-2 flex items-center gap-2">
          <span className="badge badge-green">Beta</span>
          Partner sync
        </h2>
        <p className="text-[11.5px] text-[var(--text-tertiary)] mb-3">
          Generate a 10-character room code. Your partner pastes it on their
          /timer page and you both see the same timer state — including prep
          counters — across browsers.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={shareKeyDraft}
            onChange={(e) => setShareKeyDraft(e.target.value.toUpperCase())}
            placeholder="Paste a room code OR generate one"
            className="input"
            style={{ maxWidth: "260px", fontFamily: "var(--font-mono)" }}
          />
          {state.shareKey ? (
            <>
              <button
                onClick={() => {
                  setShareKey(null);
                  setShareKeyDraft("");
                  toast.info("Sync stopped");
                }}
                className="btn-secondary"
              >
                Stop sync
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(state.shareKey || "");
                  toast.success("Code copied");
                }}
                className="btn-ghost"
              >
                Copy code
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  if (!shareKeyDraft.trim()) return;
                  setShareKey(shareKeyDraft.trim());
                  toast.success("Joined sync room");
                }}
                disabled={!shareKeyDraft.trim()}
                className="btn-secondary"
              >
                Join room
              </button>
              <button onClick={generateRoomKey} className="btn-primary">
                Generate room
              </button>
            </>
          )}
          {state.shareKey && (
            <span className="badge badge-green">⚡ Synced as {state.shareKey}</span>
          )}
        </div>
      </div>
    </>
  );
}
