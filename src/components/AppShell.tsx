"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Navbar from "./Navbar";
import NameGate from "./NameGate";

interface AppContextType {
  userName: string;
  setUserName: (name: string) => void;
}

const AppContext = createContext<AppContextType>({
  userName: "",
  setUserName: () => {},
});

export function useApp() {
  return useContext(AppContext);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [userName, setUserName] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("cardcutter-name");
    if (saved) setUserName(saved);
    setMounted(true);
  }, []);

  const handleNameChange = (name: string) => {
    setUserName(name);
    localStorage.setItem("cardcutter-name", name);
  };

  const handleLogout = () => {
    setUserName("");
    localStorage.removeItem("cardcutter-name");
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-[#444] font-sans text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ userName, setUserName: handleNameChange }}>
      <NameGate userName={userName} onNameSet={handleNameChange}>
        <Navbar userName={userName} onNameChange={handleNameChange} onLogout={handleLogout} />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
      </NameGate>
    </AppContext.Provider>
  );
}
