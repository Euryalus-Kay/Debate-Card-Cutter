"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppShell";

interface Card {
  id: string;
  tag: string;
  cite: string;
  cite_author: string;
  author_name: string;
  created_at: string;
}

interface Round {
  id: string;
  name: string;
  topic: string;
  side: string;
  created_at: string;
}

function shortTag(tag: string): string {
  if (tag.length <= 80) return tag;
  return tag.substring(0, 77) + "...";
}

function authorShort(cite: string): string {
  const parenIdx = cite.indexOf("(");
  if (parenIdx > 0) return cite.substring(0, parenIdx).trim();
  return cite.substring(0, 30);
}

export default function DashboardPage() {
  const { userName } = useApp();
  const [recentCards, setRecentCards] = useState<Card[]>([]);
  const [recentRounds, setRecentRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/cards?limit=5")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setRecentCards(data.slice(0, 5));
        })
        .catch(() => {}),
      fetch("/api/rounds")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setRecentRounds(data.slice(0, 3));
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const features = [
    {
      href: "/create",
      title: "Cut Card",
      desc: "AI finds evidence and cuts a formatted debate card from any topic.",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
    },
    {
      href: "/argument",
      title: "Build Argument",
      desc: "Generate a complete argument block: DA, Aff case, CP, K, or T.",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
    {
      href: "/rounds",
      title: "Rounds",
      desc: "Prep for rounds with speech planning, flows, and CX questions.",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      href: "/library",
      title: "Library",
      desc: "Browse, search, and upload card collections.",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{userName ? `, ${userName}` : ""}
        </h1>
        <p className="text-[13px] text-[#666] mt-1">
          Your debate prep hub. Cut cards, build arguments, and prep for rounds.
        </p>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333] hover:bg-[#111] transition-all"
          >
            <div className="text-[#666] group-hover:text-white transition-colors mb-3">
              {f.icon}
            </div>
            <div className="text-[13px] font-semibold text-white mb-1">{f.title}</div>
            <div className="text-[11px] text-[#999] leading-relaxed">{f.desc}</div>
          </Link>
        ))}
      </div>

      {/* Recent cards */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold">Recent Cards</h2>
          <Link href="/library" className="text-[11px] text-[#999] hover:text-[#999] transition-colors">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="text-[13px] text-[#888] py-4">Loading...</div>
        ) : recentCards.length === 0 ? (
          <div className="text-center py-8 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a]">
            <p className="text-[13px] text-[#999] mb-2">No cards yet</p>
            <Link
              href="/create"
              className="inline-block text-[12px] text-[#888] hover:text-white transition-colors"
            >
              Cut your first card
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentCards.map((card) => (
              <Link
                key={card.id}
                href={`/card/${card.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333] transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[12px] font-semibold text-white leading-tight truncate group-hover:text-blue-300 transition-colors"
                    style={{ fontFamily: "Georgia, serif" }}
                  >
                    {shortTag(card.tag)}
                  </div>
                  <div className="text-[11px] text-[#999] mt-0.5" style={{ fontFamily: "Georgia, serif" }}>
                    {authorShort(card.cite)}
                  </div>
                </div>
                <div className="text-[10px] text-[#777] ml-3 shrink-0">
                  {new Date(card.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent rounds */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold">Recent Rounds</h2>
          <Link href="/rounds" className="text-[11px] text-[#999] hover:text-[#999] transition-colors">
            View all
          </Link>
        </div>
        {loading ? (
          <div className="text-[13px] text-[#888] py-4">Loading...</div>
        ) : recentRounds.length === 0 ? (
          <div className="text-center py-8 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a]">
            <p className="text-[13px] text-[#999] mb-2">No rounds yet</p>
            <Link
              href="/rounds/new"
              className="inline-block text-[12px] text-[#888] hover:text-white transition-colors"
            >
              Start a round
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentRounds.map((round) => (
              <Link
                key={round.id}
                href={`/rounds/${round.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333] transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
                    {round.name || "Untitled Round"}
                  </div>
                  <div className="text-[11px] text-[#999] mt-0.5">
                    {round.side === "aff" ? "Affirmative" : "Negative"}
                    {round.topic ? ` — ${round.topic}` : ""}
                  </div>
                </div>
                <div className="text-[10px] text-[#777] ml-3 shrink-0">
                  {new Date(round.created_at).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
