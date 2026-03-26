"use client";

import { useEffect, useState } from "react";

interface NameGateProps {
  children: React.ReactNode;
  userName: string;
  onNameSet: (name: string) => void;
}

export default function NameGate({ children, userName, onNameSet }: NameGateProps) {
  const [knownUsers, setKnownUsers] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"choose" | "new">("choose");

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((names) => {
        if (Array.isArray(names)) setKnownUsers(names);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectUser = (name: string) => {
    localStorage.setItem("cardcutter-name", name);
    onNameSet(name);
  };

  const createUser = async () => {
    const name = newName.trim();
    if (!name) return;
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: name }),
    });
    localStorage.setItem("cardcutter-name", name);
    onNameSet(name);
  };

  if (userName) return <>{children}</>;

  return (
    <div className="fixed inset-0 bg-[#050505] flex items-center justify-center z-[100]">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold font-sans tracking-tight text-white">
            CardCutter
          </h1>
          <p className="text-sm text-[#666] font-sans mt-1">
            HS Policy Debate Card Generator
          </p>
        </div>

        <div className="bg-[#111] border border-[#222] rounded-xl p-6">
          {loading ? (
            <div className="text-center py-4 text-[#666] font-sans text-sm">
              Loading...
            </div>
          ) : mode === "choose" && knownUsers.length > 0 ? (
            <>
              <p className="text-sm text-[#999] font-sans mb-4">
                Select your name
              </p>
              <div className="space-y-2 mb-4">
                {knownUsers.map((name) => (
                  <button
                    key={name}
                    onClick={() => selectUser(name)}
                    className="w-full text-left px-4 py-3 rounded-lg bg-[#0a0a0a] border border-[#222] text-white font-sans text-sm hover:border-[#3b82f6] hover:bg-[#0d1117] transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMode("new")}
                className="w-full px-4 py-3 rounded-lg border border-dashed border-[#333] text-[#666] font-sans text-sm hover:border-[#3b82f6] hover:text-[#999] transition-colors"
              >
                + New person
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[#999] font-sans mb-4">
                Enter your name
              </p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Your name"
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-[#0a0a0a] border border-[#222] text-white font-sans text-sm placeholder:text-[#444] focus:outline-none focus:border-[#3b82f6] mb-3"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) createUser();
                }}
              />
              <button
                onClick={createUser}
                disabled={!newName.trim()}
                className="w-full px-4 py-3 rounded-lg bg-[#3b82f6] text-white font-sans text-sm font-medium hover:bg-[#2563eb] disabled:opacity-40 transition-colors"
              >
                Continue
              </button>
              {knownUsers.length > 0 && (
                <button
                  onClick={() => setMode("choose")}
                  className="w-full mt-2 px-4 py-2 text-[#666] font-sans text-xs hover:text-[#999] transition-colors"
                >
                  Back to existing users
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
