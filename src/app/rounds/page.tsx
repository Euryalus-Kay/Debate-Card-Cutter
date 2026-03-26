"use client";

import { useState, useEffect } from 'react';
import { useApp } from '@/components/AppShell';
import Link from 'next/link';

interface Round {
  id: string;
  user_name: string;
  side: string;
  opponent_name: string;
  opponent_school: string;
  tournament: string;
  round_number: string;
  partner_name: string | null;
  status: string;
  created_at: string;
}

export default function RoundsPage() {
  const { userName } = useApp();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userName) return;
    fetch(`/api/rounds?user=${encodeURIComponent(userName)}`)
      .then(r => r.json())
      .then(data => { setRounds(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userName]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Rounds</h1>
        <Link
          href="/rounds/new"
          className="px-4 py-2 text-[13px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] transition-colors font-medium"
        >
          New Round
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[#666] text-[13px]">Loading...</div>
      ) : rounds.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-[#666] text-[14px]">No rounds yet.</p>
          <Link
            href="/rounds/new"
            className="inline-block px-5 py-2.5 text-[13px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] transition-colors"
          >
            Start your first round
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rounds.map(round => (
            <Link
              key={round.id}
              href={`/rounds/${round.id}`}
              className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] p-4 hover:border-[#333] transition-colors block"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  round.side === 'aff' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                }`}>
                  {round.side.toUpperCase()}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  round.status === 'in_progress' ? 'bg-green-500/10 text-green-400' : 'bg-[#1a1a1a] text-[#666]'
                }`}>
                  {round.status === 'in_progress' ? 'In Progress' : 'Completed'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-[14px] text-white font-medium">
                  vs. {round.opponent_name || 'Unknown'} {round.opponent_school ? `(${round.opponent_school})` : ''}
                </p>
                {round.tournament && (
                  <p className="text-[12px] text-[#888]">{round.tournament}{round.round_number ? ` — Round ${round.round_number}` : ''}</p>
                )}
                {round.partner_name && (
                  <p className="text-[11px] text-[#666]">Partner: {round.partner_name}</p>
                )}
                <p className="text-[10px] text-[#999]">{new Date(round.created_at).toLocaleDateString()}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
