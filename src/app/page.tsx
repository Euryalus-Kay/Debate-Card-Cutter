"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/AppShell";
import {
  ScissorsIcon,
  ShieldIcon,
  BookIcon,
  FlameIcon,
  BrainIcon,
  TargetIcon,
  ScalesIcon,
  ToolboxIcon,
  ClockIcon,
  GavelIcon,
  SparkleIcon,
  ZapIcon,
} from "@/components/ui/icons";

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

interface Argument {
  id: string;
  title: string;
  argument_type?: string;
  card_ids?: string[];
  created_at: string;
}

function shortTag(tag: string, max = 80): string {
  if (tag.length <= max) return tag;
  return tag.substring(0, max - 3) + "...";
}

function authorShort(cite: string): string {
  const parenIdx = cite.indexOf("(");
  if (parenIdx > 0) return cite.substring(0, parenIdx).trim();
  return cite.substring(0, 30);
}

const FEATURE_TILES = [
  {
    href: "/create",
    title: "Cut Card",
    desc: "AI scrapes the web, picks the best source, cuts a tournament-grade card.",
    Icon: ScissorsIcon,
    accent: "blue",
  },
  {
    href: "/argument",
    title: "Build Argument",
    desc: "Camp-quality file: 1NC shell, extensions, AT blocks, analytics.",
    Icon: ShieldIcon,
    accent: "purple",
  },
  {
    href: "/coach",
    title: "Live Coach",
    desc: "Stream-coached strategy advice. Ask anything mid-prep.",
    Icon: BrainIcon,
    accent: "purple",
  },
  {
    href: "/blocks",
    title: "Frontlines",
    desc: "Generate AT-blocks tuned to your judge and the argument you face.",
    Icon: TargetIcon,
    accent: "pink",
  },
  {
    href: "/judge",
    title: "Judge Adapt",
    desc: "Pick a paradigm — get speech-by-speech adaptation guidance.",
    Icon: GavelIcon,
    accent: "amber",
  },
  {
    href: "/impact-calc",
    title: "Impact Calc",
    desc: "Generate the closing weighing paragraph for your 2NR or 2AR.",
    Icon: ScalesIcon,
    accent: "green",
  },
  {
    href: "/drills",
    title: "Drill Lab",
    desc: "Spreading, rebuttal redos, CX simulators — practice the fundamentals.",
    Icon: ToolboxIcon,
    accent: "cyan",
  },
  {
    href: "/timer",
    title: "Round Timer",
    desc: "Visual round timer with prep tracking and warnings.",
    Icon: ClockIcon,
    accent: "red",
  },
  {
    href: "/rounds",
    title: "Round Manager",
    desc: "Speech planning, flow tracking, CX prep across all 8 speeches.",
    Icon: FlameIcon,
    accent: "amber",
  },
  {
    href: "/library",
    title: "Library",
    desc: "Browse, search, upload card collections — auto-organized.",
    Icon: BookIcon,
    accent: "cyan",
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

function typeColor(t?: string): string {
  switch (t) {
    case "aff":
      return "badge-blue";
    case "da":
      return "badge-red";
    case "cp":
      return "badge-green";
    case "k":
      return "badge-purple";
    case "t":
      return "badge-amber";
    case "theory":
      return "badge-pink";
    default:
      return "badge-neutral";
  }
}

function typeLabel(t?: string): string {
  switch (t) {
    case "aff":
      return "AFF";
    case "da":
      return "DA";
    case "cp":
      return "CP";
    case "k":
      return "K";
    case "t":
      return "T";
    case "theory":
      return "Th";
    default:
      return "Custom";
  }
}

export default function DashboardPage() {
  const { userName, resolution, setResolution } = useApp();
  const [recentCards, setRecentCards] = useState<Card[]>([]);
  const [recentRounds, setRecentRounds] = useState<Round[]>([]);
  const [recentArgs, setRecentArgs] = useState<Argument[]>([]);
  const [stats, setStats] = useState({ cards: 0, args: 0, rounds: 0 });
  const [loading, setLoading] = useState(true);
  const [editingResolution, setEditingResolution] = useState(false);
  const [resolutionDraft, setResolutionDraft] = useState(resolution);

  useEffect(() => {
    setResolutionDraft(resolution);
  }, [resolution]);

  useEffect(() => {
    Promise.all([
      fetch("/api/cards?limit=8")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setRecentCards(data.slice(0, 8));
            setStats((s) => ({ ...s, cards: data.length }));
          }
        })
        .catch(() => {}),
      (userName
        ? fetch(`/api/rounds?user=${encodeURIComponent(userName)}`)
        : Promise.resolve(new Response(JSON.stringify([]), { status: 200 })))
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setRecentRounds(data.slice(0, 4));
            setStats((s) => ({ ...s, rounds: data.length }));
          }
        })
        .catch(() => {}),
      fetch("/api/argument?list=true")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setRecentArgs(data.slice(0, 4));
            setStats((s) => ({ ...s, args: data.length }));
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [userName]);

  return (
    <>
      {/* Hero */}
      <div className="mb-8 anim-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-2 flex items-center gap-2">
              <SparkleIcon size={11} /> DebateOS
            </div>
            <h1 className="text-[28px] font-bold tracking-tight gradient-text">
              Welcome back{userName ? `, ${userName.split(" ")[0]}` : ""}
            </h1>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-1.5 max-w-xl">
              Your end-to-end policy debate system. Cut cards, build arguments,
              prep for rounds, drill skills, and adapt to judges.
            </p>
          </div>
          <div className="hidden sm:flex flex-col gap-2 items-end shrink-0">
            <Link
              href="/create"
              className="btn-primary"
            >
              <ScissorsIcon size={13} /> Cut a card
            </Link>
            <Link href="/coach" className="btn-secondary">
              <BrainIcon size={13} /> Talk to coach
            </Link>
          </div>
        </div>

        {/* Resolution bar */}
        <div className="mt-4 surface px-3 py-2.5 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] shrink-0">
            Topic
          </span>
          {editingResolution ? (
            <input
              autoFocus
              value={resolutionDraft}
              onChange={(e) => setResolutionDraft(e.target.value)}
              onBlur={() => {
                setResolution(resolutionDraft);
                setEditingResolution(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setResolution(resolutionDraft);
                  setEditingResolution(false);
                }
                if (e.key === "Escape") {
                  setResolutionDraft(resolution);
                  setEditingResolution(false);
                }
              }}
              className="flex-1 bg-transparent text-[12.5px] text-white outline-none"
              placeholder="Resolved: The United States federal government should..."
            />
          ) : (
            <button
              onClick={() => setEditingResolution(true)}
              className="flex-1 text-left text-[12.5px] text-[var(--text-secondary)] hover:text-white transition-colors truncate"
            >
              {resolution || (
                <span className="italic text-[var(--text-faint)]">
                  Click to set the current debate topic — this informs all coaching
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6 anim-slide-up">
        <div className="stat-tile">
          <div className="stat-tile-label">Cards</div>
          <div className="stat-tile-value">{loading ? "—" : stats.cards}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Arguments</div>
          <div className="stat-tile-value">{loading ? "—" : stats.args}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Rounds prepped</div>
          <div className="stat-tile-value">{loading ? "—" : stats.rounds}</div>
        </div>
      </div>

      {/* Feature grid */}
      <div className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[14px] font-semibold tracking-tight">
            All tools
          </h2>
          <button
            onClick={() => {
              const evt = new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
              });
              window.dispatchEvent(evt);
            }}
            className="text-[11px] text-[var(--text-tertiary)] hover:text-white flex items-center gap-1.5"
          >
            <ZapIcon size={11} /> Quick switch <kbd className="kbd">⌘K</kbd>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {FEATURE_TILES.map((f) => {
            const Icon = f.Icon;
            return (
              <Link
                key={f.href}
                href={f.href}
                className="group surface surface-hover p-4 rounded-lg flex flex-col gap-2 anim-fade-in"
              >
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center transition-transform group-hover:scale-110"
                  style={{
                    background: `${ACCENT_COLORS[f.accent]}1f`,
                    color: ACCENT_COLORS[f.accent],
                  }}
                >
                  <Icon size={15} />
                </div>
                <div className="text-[12.5px] font-semibold text-white">
                  {f.title}
                </div>
                <div className="text-[10.5px] text-[var(--text-tertiary)] leading-relaxed">
                  {f.desc}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent cards */}
        <div className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[14px] font-semibold tracking-tight">
              Recent cards
            </h2>
            <Link
              href="/library"
              className="text-[11px] text-[var(--text-tertiary)] hover:text-white"
            >
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="surface p-3 shimmer"
                  style={{ height: "52px" }}
                />
              ))}
            </div>
          ) : recentCards.length === 0 ? (
            <div className="surface text-center py-10">
              <p className="text-[12.5px] text-[var(--text-tertiary)] mb-2">
                No cards yet
              </p>
              <Link
                href="/create"
                className="text-[11px] text-[var(--accent-blue)] hover:underline"
              >
                Cut your first card →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentCards.map((card) => (
                <Link
                  key={card.id}
                  href={`/card/${card.id}`}
                  className="surface surface-hover flex items-center justify-between p-3 group anim-fade-in"
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[12px] font-semibold text-white leading-tight truncate group-hover:text-[var(--accent-blue)] transition-colors"
                      style={{ fontFamily: "Georgia, serif" }}
                    >
                      {shortTag(card.tag)}
                    </div>
                    <div
                      className="text-[10.5px] text-[var(--text-tertiary)] mt-0.5"
                      style={{ fontFamily: "Georgia, serif" }}
                    >
                      {authorShort(card.cite)}
                    </div>
                  </div>
                  <div className="text-[10px] text-[var(--text-faint)] ml-3 shrink-0">
                    {new Date(card.created_at).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar — rounds + arguments */}
        <div className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[14px] font-semibold tracking-tight">
                Recent rounds
              </h2>
              <Link
                href="/rounds"
                className="text-[11px] text-[var(--text-tertiary)] hover:text-white"
              >
                View all →
              </Link>
            </div>
            {loading ? (
              <div
                className="surface shimmer"
                style={{ height: "60px" }}
              />
            ) : recentRounds.length === 0 ? (
              <Link
                href="/rounds/new"
                className="surface text-center py-6 block"
              >
                <p className="text-[11.5px] text-[var(--text-tertiary)]">
                  Start a round
                </p>
              </Link>
            ) : (
              <div className="space-y-1.5">
                {recentRounds.map((round) => (
                  <Link
                    key={round.id}
                    href={`/rounds/${round.id}`}
                    className="surface surface-hover block p-2.5 group anim-fade-in"
                  >
                    <div className="text-[11.5px] font-semibold text-white truncate group-hover:text-[var(--accent-blue)]">
                      {round.name || "Untitled round"}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`badge ${
                          round.side === "aff" ? "badge-blue" : "badge-red"
                        }`}
                      >
                        {round.side?.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-[var(--text-faint)] truncate">
                        {round.topic || "—"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-[14px] font-semibold tracking-tight">
                Recent arguments
              </h2>
              <Link
                href="/library"
                className="text-[11px] text-[var(--text-tertiary)] hover:text-white"
              >
                View all →
              </Link>
            </div>
            {loading ? (
              <div className="surface shimmer" style={{ height: "60px" }} />
            ) : recentArgs.length === 0 ? (
              <Link
                href="/argument"
                className="surface text-center py-6 block"
              >
                <p className="text-[11.5px] text-[var(--text-tertiary)]">
                  Build your first argument
                </p>
              </Link>
            ) : (
              <div className="space-y-1.5">
                {recentArgs.map((arg) => (
                  <Link
                    key={arg.id}
                    href="/library"
                    className="surface surface-hover block p-2.5 group anim-fade-in"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`badge ${typeColor(arg.argument_type)}`}
                      >
                        {typeLabel(arg.argument_type)}
                      </span>
                      <span className="text-[11.5px] font-semibold text-white truncate group-hover:text-[var(--accent-blue)]">
                        {arg.title}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-faint)] mt-1">
                      {(arg.card_ids?.length || 0)} cards
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
