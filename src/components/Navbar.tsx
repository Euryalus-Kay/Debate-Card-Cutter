"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar({
  userName,
  onNameChange,
}: {
  userName: string;
  onNameChange: (name: string) => void;
}) {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Cards" },
    { href: "/create", label: "Cut Card" },
    { href: "/argument", label: "Build Argument" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold text-[var(--fg)] font-sans">
            CardCutter
          </Link>
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-sm rounded font-sans transition-colors ${
                  pathname === link.href
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--border)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)] font-sans">Cutter:</span>
          <input
            type="text"
            value={userName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Your name"
            className="w-32 px-2 py-1 text-sm bg-[var(--card-bg)] border border-[var(--border)] rounded text-[var(--fg)] font-sans placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>
    </nav>
  );
}
