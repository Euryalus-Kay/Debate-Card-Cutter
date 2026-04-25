"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type TimerMode = "speech" | "aff-prep" | "neg-prep" | "idle";

export interface TimerState {
  mode: TimerMode;
  /** Active speech, e.g. "1AC", "1NC". Null if not in a speech. */
  activeSpeech: string | null;
  /** Index into the 12-slot SLOTS array. */
  activeSlotIdx: number;
  /** Speech countdown remaining in seconds. */
  speechRemaining: number;
  /** Aff prep budget remaining in seconds. */
  affPrep: number;
  /** Neg prep budget remaining in seconds. */
  negPrep: number;
  running: boolean;
  /** Whether the floating widget is visible right now. */
  widgetOpen: boolean;
  widgetMinimized: boolean;
  /** Persist position so the widget remembers where you put it. */
  widgetX: number;
  widgetY: number;
  /** Optional partner sync key (shared room id from URL or paste). */
  shareKey: string | null;
}

export interface SpeechSlot {
  speech: string;
  duration: number;
  side: "aff" | "neg";
  isCX?: boolean;
}

export const SLOTS: SpeechSlot[] = [
  { speech: "1AC", duration: 8 * 60, side: "aff" },
  { speech: "CX of 1AC", duration: 3 * 60, side: "neg", isCX: true },
  { speech: "1NC", duration: 8 * 60, side: "neg" },
  { speech: "CX of 1NC", duration: 3 * 60, side: "aff", isCX: true },
  { speech: "2AC", duration: 8 * 60, side: "aff" },
  { speech: "CX of 2AC", duration: 3 * 60, side: "neg", isCX: true },
  { speech: "2NC", duration: 8 * 60, side: "neg" },
  { speech: "CX of 2NC", duration: 3 * 60, side: "aff", isCX: true },
  { speech: "1NR", duration: 5 * 60, side: "neg" },
  { speech: "1AR", duration: 5 * 60, side: "aff" },
  { speech: "2NR", duration: 5 * 60, side: "neg" },
  { speech: "2AR", duration: 5 * 60, side: "aff" },
];

const STORAGE_KEY = "timer-state-v2";
const STANDARD_PREP = 8 * 60;

interface TimerContextValue {
  state: TimerState;
  startSpeech: (slotIdx?: number) => void;
  startAffPrep: () => void;
  startNegPrep: () => void;
  pause: () => void;
  reset: () => void;
  nextSlot: () => void;
  prevSlot: () => void;
  setSlot: (idx: number) => void;
  setWidgetOpen: (open: boolean) => void;
  setWidgetMinimized: (m: boolean) => void;
  setWidgetPosition: (x: number, y: number) => void;
  resetMatch: () => void;
  setShareKey: (key: string | null) => void;
  publishToPartner: () => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

const initialState = (): TimerState => ({
  mode: "idle",
  activeSpeech: null,
  activeSlotIdx: 0,
  speechRemaining: SLOTS[0].duration,
  affPrep: STANDARD_PREP,
  negPrep: STANDARD_PREP,
  running: false,
  widgetOpen: false,
  widgetMinimized: false,
  widgetX: typeof window === "undefined" ? 24 : Math.max(24, window.innerWidth - 280),
  widgetY: 80,
  shareKey: null,
});

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TimerState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickAtRef = useRef<number>(0);
  const stateRef = useRef<TimerState>(state);
  stateRef.current = state;

  // Hydrate from localStorage. Preserve `running` and adjust the active
  // counter for any wall-clock time that elapsed while the provider was
  // unmounted (e.g. during cross-page navigation that re-instantiates
  // the layout).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TimerState> & {
          updatedAt?: number;
        };
        const elapsed =
          parsed.updatedAt && typeof parsed.updatedAt === "number"
            ? Math.max(0, (Date.now() - parsed.updatedAt) / 1000)
            : 0;
        setState((prev) => {
          const next: TimerState = { ...prev, ...parsed } as TimerState;
          if (parsed.running && elapsed > 0 && elapsed < 6 * 60 * 60) {
            if (next.mode === "speech") {
              next.speechRemaining = Math.max(-300, next.speechRemaining - elapsed);
            } else if (next.mode === "aff-prep") {
              next.affPrep = Math.max(0, next.affPrep - elapsed);
            } else if (next.mode === "neg-prep") {
              next.negPrep = Math.max(0, next.negPrep - elapsed);
            }
          }
          return next;
        });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist to localStorage — but only AFTER hydration to avoid clobbering
  // stored state with the initial in-memory snapshot.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, updatedAt: Date.now() })
      );
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  // Tick loop
  useEffect(() => {
    if (!state.running) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    lastTickAtRef.current = Date.now();
    tickRef.current = setInterval(() => {
      const now = Date.now();
      const dtMs = now - lastTickAtRef.current;
      lastTickAtRef.current = now;
      const dt = Math.max(0, dtMs / 1000);

      setState((prev) => {
        if (!prev.running) return prev;
        if (prev.mode === "speech") {
          const next = Math.max(-300, prev.speechRemaining - dt);
          if (next <= -3 && prev.speechRemaining > -3) {
            // Beep when 3s overtime
            try { beep(); } catch { /* ignore */ }
          }
          return { ...prev, speechRemaining: next };
        }
        if (prev.mode === "aff-prep") {
          return { ...prev, affPrep: Math.max(0, prev.affPrep - dt) };
        }
        if (prev.mode === "neg-prep") {
          return { ...prev, negPrep: Math.max(0, prev.negPrep - dt) };
        }
        return prev;
      });
    }, 250);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [state.running]);

  const startSpeech = useCallback((slotIdx?: number) => {
    setState((prev) => {
      const idx = slotIdx ?? prev.activeSlotIdx;
      const slot = SLOTS[idx];
      if (!slot) return prev;
      return {
        ...prev,
        mode: "speech",
        activeSlotIdx: idx,
        activeSpeech: slot.speech,
        speechRemaining: slot.duration,
        running: true,
        widgetOpen: true,
      };
    });
  }, []);

  const startAffPrep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: "aff-prep",
      running: true,
      widgetOpen: true,
    }));
  }, []);

  const startNegPrep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: "neg-prep",
      running: true,
      widgetOpen: true,
    }));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, running: false }));
  }, []);

  const reset = useCallback(() => {
    setState((prev) => {
      if (prev.mode === "speech") {
        const slot = SLOTS[prev.activeSlotIdx];
        return { ...prev, speechRemaining: slot.duration, running: false };
      }
      if (prev.mode === "aff-prep") {
        return { ...prev, affPrep: STANDARD_PREP, running: false };
      }
      if (prev.mode === "neg-prep") {
        return { ...prev, negPrep: STANDARD_PREP, running: false };
      }
      return { ...prev, running: false };
    });
  }, []);

  const nextSlot = useCallback(() => {
    setState((prev) => {
      const next = Math.min(prev.activeSlotIdx + 1, SLOTS.length - 1);
      const slot = SLOTS[next];
      return {
        ...prev,
        activeSlotIdx: next,
        activeSpeech: slot.speech,
        speechRemaining: slot.duration,
        mode: "speech",
        running: false,
      };
    });
  }, []);

  const prevSlot = useCallback(() => {
    setState((prev) => {
      const next = Math.max(0, prev.activeSlotIdx - 1);
      const slot = SLOTS[next];
      return {
        ...prev,
        activeSlotIdx: next,
        activeSpeech: slot.speech,
        speechRemaining: slot.duration,
        mode: "speech",
        running: false,
      };
    });
  }, []);

  const setSlot = useCallback((idx: number) => {
    setState((prev) => {
      const slot = SLOTS[idx];
      if (!slot) return prev;
      return {
        ...prev,
        activeSlotIdx: idx,
        activeSpeech: slot.speech,
        speechRemaining: slot.duration,
        mode: "speech",
        running: false,
      };
    });
  }, []);

  const setWidgetOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, widgetOpen: open }));
  }, []);

  const setWidgetMinimized = useCallback((m: boolean) => {
    setState((prev) => ({ ...prev, widgetMinimized: m }));
  }, []);

  const setWidgetPosition = useCallback((x: number, y: number) => {
    setState((prev) => ({ ...prev, widgetX: x, widgetY: y }));
  }, []);

  const resetMatch = useCallback(() => {
    setState((prev) => ({
      ...initialState(),
      widgetOpen: prev.widgetOpen,
      widgetMinimized: prev.widgetMinimized,
      widgetX: prev.widgetX,
      widgetY: prev.widgetY,
      shareKey: prev.shareKey,
    }));
  }, []);

  const setShareKey = useCallback((key: string | null) => {
    setState((prev) => ({ ...prev, shareKey: key }));
  }, []);

  const publishToPartner = useCallback(async () => {
    const cur = stateRef.current;
    if (!cur.shareKey) return;
    try {
      await fetch("/api/timer-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareKey: cur.shareKey,
          state: {
            mode: cur.mode,
            activeSlotIdx: cur.activeSlotIdx,
            speechRemaining: cur.speechRemaining,
            affPrep: cur.affPrep,
            negPrep: cur.negPrep,
            running: cur.running,
            updatedAt: Date.now(),
          },
        }),
      });
    } catch {
      /* network error — best-effort sync */
    }
  }, []);

  // Auto-publish every 3s when running + we have a share key
  useEffect(() => {
    if (!state.shareKey || !state.running) return;
    const id = setInterval(() => {
      publishToPartner();
    }, 3000);
    return () => clearInterval(id);
  }, [state.shareKey, state.running, publishToPartner]);

  // Auto-pull from partner every 4s when share key set
  useEffect(() => {
    if (!state.shareKey) return;
    let cancelled = false;
    let lastUpdate = 0;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/timer-share?key=${encodeURIComponent(state.shareKey || "")}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (!data?.state || data.state.updatedAt === lastUpdate) return;
        lastUpdate = data.state.updatedAt;
        setState((prev) => ({
          ...prev,
          mode: data.state.mode,
          activeSlotIdx: data.state.activeSlotIdx,
          speechRemaining: data.state.speechRemaining,
          affPrep: data.state.affPrep,
          negPrep: data.state.negPrep,
          running: data.state.running,
          activeSpeech: SLOTS[data.state.activeSlotIdx]?.speech ?? null,
        }));
      } catch {
        /* ignore */
      }
    };
    const id = setInterval(tick, 4000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state.shareKey]);

  const value = useMemo<TimerContextValue>(
    () => ({
      state,
      startSpeech,
      startAffPrep,
      startNegPrep,
      pause,
      reset,
      nextSlot,
      prevSlot,
      setSlot,
      setWidgetOpen,
      setWidgetMinimized,
      setWidgetPosition,
      resetMatch,
      setShareKey,
      publishToPartner,
    }),
    [
      state,
      startSpeech,
      startAffPrep,
      startNegPrep,
      pause,
      reset,
      nextSlot,
      prevSlot,
      setSlot,
      setWidgetOpen,
      setWidgetMinimized,
      setWidgetPosition,
      resetMatch,
      setShareKey,
      publishToPartner,
    ]
  );

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be inside TimerProvider");
  return ctx;
}

function beep() {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}
