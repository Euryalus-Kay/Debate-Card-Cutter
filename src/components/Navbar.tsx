"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar({
  userName,
  onNameChange,
  onLogout,
}: {
  userName: string;
  onNameChange: (name: string) => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Cards" },
    { href: "/create", label: "Cut Card" },
    { href: "/argument", label: "Build Argument" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-[#1a1a1a] bg-[#050505]/90 backdrop-blur-md">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 text-[13px] rounded-md font-sans transition-colors ${
                pathname === link.href
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#666] hover:text-[#aaa]"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[#666] font-sans">{userName}</span>
          <button
            onClick={onLogout}
            className="text-[11px] text-[#444] hover:text-[#888] font-sans transition-colors"
          >
            Switch
          </button>
        </div>
      </div>
    </nav>
  );
}
