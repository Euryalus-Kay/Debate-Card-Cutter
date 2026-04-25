"use client";

import {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from "react";
import Navbar from "./Navbar";
import NameGate from "./NameGate";
import { ToastProvider } from "@/components/ui/Toast";
import CommandPalette from "@/components/ui/CommandPalette";
import { TimerProvider } from "@/components/timer/TimerContext";
import FloatingTimer from "@/components/timer/FloatingTimer";

interface AppContextType {
  userName: string;
  setUserName: (name: string) => void;
  resolution: string;
  setResolution: (r: string) => void;
  selectedJudgeId: string | null;
  setSelectedJudgeId: (id: string | null) => void;
  openCommandPalette: () => void;
}

const AppContext = createContext<AppContextType>({
  userName: "",
  setUserName: () => {},
  resolution: "",
  setResolution: () => {},
  selectedJudgeId: null,
  setSelectedJudgeId: () => {},
  openCommandPalette: () => {},
});

export function useApp() {
  return useContext(AppContext);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [userName, setUserNameState] = useState("");
  const [resolution, setResolutionState] = useState("");
  const [selectedJudgeId, setSelectedJudgeIdState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("cardcutter-name");
    const savedRes = localStorage.getItem("debate_resolution");
    const savedJudge = localStorage.getItem("debate_judge_id");
    if (saved) setUserNameState(saved);
    if (savedRes) setResolutionState(savedRes);
    if (savedJudge) setSelectedJudgeIdState(savedJudge);
    setMounted(true);
  }, []);

  // ⌘K palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setUserName = useCallback((name: string) => {
    setUserNameState(name);
    if (name) {
      localStorage.setItem("cardcutter-name", name);
    } else {
      localStorage.removeItem("cardcutter-name");
    }
  }, []);

  const setResolution = useCallback((r: string) => {
    setResolutionState(r);
    localStorage.setItem("debate_resolution", r);
  }, []);

  const setSelectedJudgeId = useCallback((id: string | null) => {
    setSelectedJudgeIdState(id);
    if (id) localStorage.setItem("debate_judge_id", id);
    else localStorage.removeItem("debate_judge_id");
  }, []);

  const handleLogout = useCallback(() => {
    setUserName("");
  }, [setUserName]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="dots-loading text-[var(--accent-blue)]">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <TimerProvider>
        <AppContext.Provider
          value={{
            userName,
            setUserName,
            resolution,
            setResolution,
            selectedJudgeId,
            setSelectedJudgeId,
            openCommandPalette: () => setPaletteOpen(true),
          }}
        >
          <NameGate userName={userName} onNameSet={setUserName}>
            <Navbar
              userName={userName}
              onNameChange={setUserName}
              onLogout={handleLogout}
              onOpenCommand={() => setPaletteOpen(true)}
            />
            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
              {children}
            </main>
            <FloatingTimer />
            <CommandPalette
              open={paletteOpen}
              onClose={() => setPaletteOpen(false)}
            />
          </NameGate>
        </AppContext.Provider>
      </TimerProvider>
    </ToastProvider>
  );
}
