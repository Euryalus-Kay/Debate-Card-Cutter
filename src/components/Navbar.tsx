"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ScissorsIcon,
  ShieldIcon,
  FlameIcon,
  GavelIcon,
  ClockIcon,
  BookIcon,
  TargetIcon,
  ScalesIcon,
  ToolboxIcon,
  BrainIcon,
  MicIcon,
  SearchIcon,
} from "@/components/ui/icons";

interface NavGroup {
  label: string;
  items: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    accent?: string;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Build",
    items: [
      { href: "/create", label: "Cut Card", icon: ScissorsIcon, accent: "blue" },
      { href: "/argument", label: "Build Argument", icon: ShieldIcon, accent: "purple" },
      { href: "/library", label: "Library", icon: BookIcon, accent: "cyan" },
    ],
  },
  {
    label: "Round",
    items: [
      { href: "/rounds", label: "Rounds", icon: FlameIcon, accent: "amber" },
      { href: "/timer", label: "Timer", icon: ClockIcon, accent: "red" },
      { href: "/blocks", label: "Frontlines", icon: TargetIcon, accent: "pink" },
    ],
  },
  {
    label: "Coach",
    items: [
      { href: "/coach", label: "Live Coach", icon: BrainIcon, accent: "purple" },
      { href: "/strategy", label: "Strategist", icon: MicIcon, accent: "blue" },
      { href: "/judge", label: "Judge Adapt", icon: GavelIcon, accent: "amber" },
      { href: "/impact-calc", label: "Impact Calc", icon: ScalesIcon, accent: "green" },
      { href: "/drills", label: "Drills", icon: ToolboxIcon, accent: "cyan" },
    ],
  },
];

const ACCENT_COLORS: Record<string, string> = {
  blue: "var(--accent-blue)",
  purple: "var(--accent-purple)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  pink: "var(--accent-pink)",
  red: "var(--accent-red)",
  green: "var(--accent-green)",
};

interface NavbarProps {
  userName: string;
  onNameChange: (name: string) => void;
  onLogout: () => void;
  onOpenCommand?: () => void;
}

export default function Navbar({
  userName,
  onLogout,
  onOpenCommand,
}: NavbarProps) {
  const pathname = usePathname();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  return (
    <nav
      className={`sticky top-0 z-40 transition-all ${
        scrolled
          ? "border-b border-[var(--border-default)] glass-strong"
          : "border-b border-transparent bg-[var(--bg-base)]"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13.5px] font-semibold tracking-tight text-white hover:bg-[var(--bg-elev-2)] transition-colors"
          >
            <span
              className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent-blue), var(--accent-purple))",
                color: "white",
              }}
            >
              D
            </span>
            <span className="hidden sm:inline">DebateOS</span>
          </Link>

          <div className="hidden md:flex items-center gap-0.5 ml-3">
            {NAV_GROUPS.flatMap((g) => g.items).slice(0, 6).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] rounded-md transition-all relative ${
                    active
                      ? "text-white bg-[var(--bg-elev-2)]"
                      : "text-[var(--text-tertiary)] hover:text-white hover:bg-[var(--bg-elev-2)]"
                  }`}
                  title={item.label}
                >
                  <Icon
                    className="shrink-0"
                    size={14}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <span
                      className="absolute left-2.5 right-2.5 -bottom-px h-0.5 rounded-full"
                      style={{
                        background: ACCENT_COLORS[item.accent || "blue"],
                      }}
                    />
                  )}
                </Link>
              );
            })}
            <details className="relative">
              <summary className="list-none flex items-center gap-1 px-2.5 py-1.5 text-[12.5px] rounded-md text-[var(--text-tertiary)] hover:text-white hover:bg-[var(--bg-elev-2)] cursor-pointer">
                <span>More</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <div className="absolute right-0 top-full mt-1 surface-elev p-1 min-w-[180px] anim-scale-in">
                {NAV_GROUPS.flatMap((g) => g.items).slice(6).map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-[12.5px] transition-colors ${
                        active
                          ? "text-white bg-[var(--bg-elev-3)]"
                          : "text-[var(--text-tertiary)] hover:text-white hover:bg-[var(--bg-elev-3)]"
                      }`}
                    >
                      <Icon size={13} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </details>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenCommand && (
            <button
              onClick={onOpenCommand}
              className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] text-[var(--text-tertiary)] bg-[var(--bg-elev-1)] hover:bg-[var(--bg-elev-2)] hover:text-white border border-[var(--border-default)] rounded-md transition-colors"
              title="Command palette (⌘K)"
            >
              <SearchIcon size={12} />
              <span>Search</span>
              <kbd className="kbd">⌘K</kbd>
            </button>
          )}
          <span className="hidden sm:inline text-[12px] text-[var(--text-tertiary)] truncate max-w-[120px]">
            {userName}
          </span>
          <button
            onClick={onLogout}
            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text-tertiary)] transition-colors"
          >
            Switch
          </button>
          <button
            onClick={() => setShowMobileMenu((s) => !s)}
            className="md:hidden text-[var(--text-tertiary)] hover:text-white p-1"
            aria-label="menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {showMobileMenu ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M3 6h18M3 12h18M3 18h18" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {showMobileMenu && (
        <div className="md:hidden border-t border-[var(--border-subtle)] glass-strong anim-fade-in-fast">
          <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1.5">
                  {group.label}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-[12.5px] transition-colors ${
                          active
                            ? "text-white bg-[var(--bg-elev-2)]"
                            : "text-[var(--text-tertiary)] hover:text-white hover:bg-[var(--bg-elev-2)]"
                        }`}
                      >
                        <Icon size={14} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
