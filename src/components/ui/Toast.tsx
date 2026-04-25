"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToastType = "info" | "success" | "error" | "warning";
interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  push: (t: Omit<Toast, "id">) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx)
    return {
      push: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    } as ToastContextValue;
  return ctx;
}

const ICONS: Record<ToastType, string> = {
  info: "i",
  success: "✓",
  error: "✕",
  warning: "!",
};

const COLORS: Record<ToastType, string> = {
  info: "var(--accent-blue)",
  success: "var(--accent-green)",
  error: "var(--accent-red)",
  warning: "var(--accent-amber)",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push: ToastContextValue["push"] = useCallback(
    (t) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...t, id }]);
      setTimeout(() => dismiss(id), t.type === "error" ? 6000 : 3500);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    push,
    success: (title, message) => push({ type: "success", title, message }),
    error: (title, message) => push({ type: "error", title, message }),
    info: (title, message) => push({ type: "info", title, message }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none"
        style={{ minWidth: "260px", maxWidth: "calc(100vw - 32px)" }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-slide-in-right pointer-events-auto"
            role="status"
          >
            <div
              className="flex items-start gap-3 p-3 rounded-lg surface-elev"
              style={{
                borderLeft: `3px solid ${COLORS[t.type]}`,
                minWidth: "260px",
                maxWidth: "400px",
              }}
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-px"
                style={{
                  background: `${COLORS[t.type]}33`,
                  color: COLORS[t.type],
                }}
              >
                {ICONS[t.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-white">{t.title}</div>
                {t.message && (
                  <div className="text-[11.5px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                    {t.message}
                  </div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-[var(--text-faint)] hover:text-white text-[14px] leading-none shrink-0 px-1"
                aria-label="dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Use anywhere — supports being called outside provider for SSR safety. */
export function ToastBoot() {
  const { info } = useToast();
  // intentional no-op so the import is referenced even when not used directly
  useEffect(() => {
    void info;
  }, [info]);
  return null;
}
