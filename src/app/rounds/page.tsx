"use client";

import { useState, useEffect, useMemo } from "react";
import { useApp } from "@/components/AppShell";
import Link from "next/link";
import { FlameIcon, SparkleIcon, SearchIcon } from "@/components/ui/icons";

interface Round {
  id: string;
  user_name: string;
  side: string;
  opponent_name: string;
  opponent_school: string;
  tournament: string;
  round_number: string;
  partner_name: string | null;
  topic: string;
  status: string;
  created_at: string;
  updated_at: string;
}

type FilterTab = "all" | "in_progress" | "completed" | "aff" | "neg";

export default function RoundsPage() {
  const { userName } = useApp();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [tournamentFilter, setTournamentFilter] = useState<string>("all");

  useEffect(() => {
    if (!userName) return;
    fetch(`/api/rounds?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        setRounds(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userName]);

  const tournaments = useMemo(
    () =>
      Array.from(new Set(rounds.map((r) => r.tournament).filter(Boolean))).sort(),
    [rounds]
  );

  const stats = useMemo(() => {
    const total = rounds.length;
    const aff = rounds.filter((r) => r.side === "aff").length;
    const neg = rounds.filter((r) => r.side === "neg").length;
    const inProgress = rounds.filter((r) => r.status === "in_progress").length;
    const completed = rounds.filter((r) => r.status === "completed").length;
    const recentTournament = rounds[0]?.tournament || "—";
    return { total, aff, neg, inProgress, completed, recentTournament };
  }, [rounds]);

  const filtered = rounds.filter((r) => {
    if (tab === "in_progress" && r.status !== "in_progress") return false;
    if (tab === "completed" && r.status !== "completed") return false;
    if (tab === "aff" && r.side !== "aff") return false;
    if (tab === "neg" && r.side !== "neg") return false;
    if (tournamentFilter !== "all" && r.tournament !== tournamentFilter)
      return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.opponent_name || "").toLowerCase().includes(q) ||
      (r.opponent_school || "").toLowerCase().includes(q) ||
      (r.tournament || "").toLowerCase().includes(q) ||
      (r.partner_name || "").toLowerCase().includes(q) ||
      (r.topic || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap anim-fade-in">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
            <FlameIcon size={18} className="text-[var(--accent-amber)]" />
            Rounds
          </h1>
          <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1">
            {stats.total} rounds prepped · {stats.aff} aff / {stats.neg} neg ·{" "}
            {stats.inProgress} in progress
          </p>
        </div>
        <Link href="/rounds/new" className="btn-primary">
          <SparkleIcon size={12} /> New round
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 anim-slide-up">
        <div className="stat-tile">
          <div className="stat-tile-label">Total rounds</div>
          <div className="stat-tile-value">{loading ? "—" : stats.total}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">In progress</div>
          <div className="stat-tile-value text-[var(--accent-amber)]">
            {loading ? "—" : stats.inProgress}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Completed</div>
          <div className="stat-tile-value text-[var(--accent-green)]">
            {loading ? "—" : stats.completed}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Last tournament</div>
          <div className="text-[15px] font-semibold text-white truncate">
            {loading ? "—" : stats.recentTournament}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-strip overflow-x-auto">
        {(
          [
            ["all", `All (${stats.total})`],
            ["in_progress", `In progress (${stats.inProgress})`],
            ["completed", `Completed (${stats.completed})`],
            ["aff", `AFF (${stats.aff})`],
            ["neg", `NEG (${stats.neg})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id as FilterTab)}
            className={`tab-btn ${tab === id ? "active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + tournament filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by opponent, school, tournament, partner..."
            className="input"
            style={{ paddingLeft: "32px" }}
          />
        </div>
        {tournaments.length > 0 && (
          <select
            value={tournamentFilter}
            onChange={(e) => setTournamentFilter(e.target.value)}
            className="input"
            style={{ width: "auto" }}
          >
            <option value="all">All tournaments</option>
            {tournaments.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Round cards */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="surface shimmer"
              style={{ height: "120px" }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface text-center py-16 space-y-3">
          <p className="text-[var(--text-tertiary)] text-[13px]">
            {search || tournamentFilter !== "all" || tab !== "all"
              ? "No rounds match your filters."
              : "No rounds yet."}
          </p>
          {!search && tournamentFilter === "all" && tab === "all" && (
            <Link href="/rounds/new" className="btn-primary inline-flex">
              <SparkleIcon size={12} /> Start your first round
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((round) => (
            <Link
              key={round.id}
              href={`/rounds/${round.id}`}
              className="surface surface-hover p-4 group anim-fade-in"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`badge ${
                      round.side === "aff" ? "badge-blue" : "badge-red"
                    }`}
                  >
                    {round.side?.toUpperCase()}
                  </span>
                  <span
                    className={`badge ${
                      round.status === "in_progress" ? "badge-amber" : "badge-green"
                    }`}
                  >
                    {round.status === "in_progress" ? "Live" : "Done"}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-faint)]">
                  {new Date(round.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-[13px] font-semibold text-white mb-1 group-hover:text-[var(--accent-blue)]">
                vs. {round.opponent_name || "Unknown"}
                {round.opponent_school ? (
                  <span className="text-[var(--text-tertiary)] font-normal">
                    {" "}
                    · {round.opponent_school}
                  </span>
                ) : null}
              </p>
              {round.tournament && (
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {round.tournament}
                  {round.round_number ? ` · R${round.round_number}` : ""}
                </p>
              )}
              {round.topic && (
                <p className="text-[10.5px] text-[var(--text-tertiary)] mt-1.5 line-clamp-2">
                  {round.topic}
                </p>
              )}
              {round.partner_name && (
                <p className="text-[10px] text-[var(--text-faint)] mt-2">
                  with {round.partner_name}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
