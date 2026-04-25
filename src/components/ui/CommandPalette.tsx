"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Command {
  id: string;
  label: string;
  description?: string;
  shortcut?: string[];
  group: string;
  href?: string;
  action?: () => void;
}

const COMMANDS: Command[] = [
  // Navigation
  { id: "nav-dashboard", label: "Dashboard", group: "Navigate", href: "/", shortcut: ["g", "d"] },
  { id: "nav-create", label: "Cut a card", group: "Navigate", href: "/create", shortcut: ["g", "c"] },
  { id: "nav-argument", label: "Build argument", group: "Navigate", href: "/argument", shortcut: ["g", "a"] },
  { id: "nav-rounds", label: "Rounds", group: "Navigate", href: "/rounds", shortcut: ["g", "r"] },
  { id: "nav-library", label: "Library", group: "Navigate", href: "/library", shortcut: ["g", "l"] },
  { id: "nav-strategy", label: "Strategist", group: "Navigate", href: "/strategy", shortcut: ["g", "s"] },
  { id: "nav-coach", label: "Live Coach", group: "Navigate", href: "/coach", shortcut: ["g", "h"] },
  { id: "nav-drills", label: "Drills", group: "Navigate", href: "/drills" },
  { id: "nav-blocks", label: "Frontlines", group: "Navigate", href: "/blocks" },
  { id: "nav-judge", label: "Judge adaptation", group: "Navigate", href: "/judge" },
  { id: "nav-impact", label: "Impact calc", group: "Navigate", href: "/impact-calc" },
  { id: "nav-timer", label: "Round timer", group: "Navigate", href: "/timer" },
  { id: "nav-toolkit", label: "Toolkit", group: "Navigate", href: "/toolkit" },
  // Actions
  {
    id: "act-clear-context",
    label: "Reset saved context",
    group: "Actions",
    description: "Wipes the context box for your account.",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = COMMANDS.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.label.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const cmd = filtered[active];
        if (cmd) handle(cmd);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (cmd: Command) => {
    if (cmd.href) router.push(cmd.href);
    if (cmd.action) cmd.action();
    if (cmd.id === "act-clear-context") {
      const userName = localStorage.getItem("cardcutter-name") || "";
      if (userName) {
        fetch(`/api/context?user=${encodeURIComponent(userName)}`, {
          method: "DELETE",
        });
      }
    }
    onClose();
  };

  if (!open) return null;

  // Group results
  const grouped: Record<string, Command[]> = {};
  for (const c of filtered) {
    grouped[c.group] = grouped[c.group] || [];
    grouped[c.group].push(c);
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-card"
        style={{ width: "560px", maxWidth: "92vw", padding: 0 }}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-faint)]">⌘</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Type a command, page, or action..."
              className="flex-1 bg-transparent border-none outline-none text-[14px] text-white placeholder:text-[var(--text-faint)]"
            />
            <kbd className="kbd">esc</kbd>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-faint)] bg-[var(--bg-elev-1)] sticky top-0">
                {group}
              </div>
              {items.map((cmd) => {
                const flatIndex = filtered.indexOf(cmd);
                const isActive = flatIndex === active;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => handle(cmd)}
                    onMouseEnter={() => setActive(flatIndex)}
                    className={`w-full text-left flex items-center justify-between px-4 py-2 text-[13px] transition-colors ${
                      isActive
                        ? "bg-[var(--accent-blue-glow)] text-white"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-elev-2)]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{cmd.label}</div>
                      {cmd.description && (
                        <div className="text-[11px] text-[var(--text-faint)] mt-0.5 truncate">
                          {cmd.description}
                        </div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <div className="flex gap-1 shrink-0 ml-3">
                        {cmd.shortcut.map((k, i) => (
                          <kbd key={i} className="kbd">
                            {k}
                          </kbd>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-[13px] text-[var(--text-faint)]">
              No matches
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-faint)]">
          <div className="flex gap-3">
            <span>
              <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navigate
            </span>
            <span>
              <kbd className="kbd">↵</kbd> select
            </span>
          </div>
          <span>Cmd palette</span>
        </div>
      </div>
    </>
  );
}
