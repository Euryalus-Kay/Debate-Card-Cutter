"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppShell';

export default function NewRoundPage() {
  const { userName } = useApp();
  const router = useRouter();
  const [side, setSide] = useState<'aff' | 'neg'>('aff');
  const [opponentName, setOpponentName] = useState('');
  const [opponentSchool, setOpponentSchool] = useState('');
  const [tournament, setTournament] = useState('');
  const [roundNumber, setRoundNumber] = useState('');
  const [topic, setTopic] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [users, setUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      const names = (data || []).map((u: { user_name?: string; author_name?: string }) => u.user_name || u.author_name).filter(Boolean);
      setUsers([...new Set(names)] as string[]);
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    const res = await fetch('/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_name: userName,
        side,
        opponent_name: opponentName,
        opponent_school: opponentSchool,
        tournament,
        round_number: roundNumber,
        topic,
        partner_name: partnerName || null,
      }),
    });
    const data = await res.json();
    if (data.id) {
      router.push(`/rounds/${data.id}`);
    } else {
      alert(data.error || 'Failed to create round');
      setCreating(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-white">New Round</h1>

      {/* Side toggle */}
      <div className="space-y-2">
        <label className="text-[12px] text-[#888]">Your Side</label>
        <div className="flex gap-2">
          <button
            onClick={() => setSide('aff')}
            className={`flex-1 py-2.5 text-[13px] rounded-lg font-medium transition-colors ${
              side === 'aff' ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400' : 'bg-[#111] border border-[#1a1a1a] text-[#666]'
            }`}
          >
            Affirmative
          </button>
          <button
            onClick={() => setSide('neg')}
            className={`flex-1 py-2.5 text-[13px] rounded-lg font-medium transition-colors ${
              side === 'neg' ? 'bg-orange-500/20 border border-orange-500/50 text-orange-400' : 'bg-[#111] border border-[#1a1a1a] text-[#666]'
            }`}
          >
            Negative
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[12px] text-[#888]">Opponent Name</label>
          <input value={opponentName} onChange={e => setOpponentName(e.target.value)}
            className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#444] focus:outline-none focus:border-[#333]"
            placeholder="e.g., Smith & Jones" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[12px] text-[#888]">Opponent School</label>
          <input value={opponentSchool} onChange={e => setOpponentSchool(e.target.value)}
            className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#444] focus:outline-none focus:border-[#333]"
            placeholder="e.g., Lincoln High" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[12px] text-[#888]">Tournament</label>
          <input value={tournament} onChange={e => setTournament(e.target.value)}
            className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#444] focus:outline-none focus:border-[#333]"
            placeholder="e.g., State Tournament" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[12px] text-[#888]">Round Number</label>
          <input value={roundNumber} onChange={e => setRoundNumber(e.target.value)}
            className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#444] focus:outline-none focus:border-[#333]"
            placeholder="e.g., 3, Quarterfinals" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] text-[#888]">Topic / Resolution</label>
        <textarea value={topic} onChange={e => setTopic(e.target.value)}
          className="w-full h-20 px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#444] focus:outline-none focus:border-[#333] resize-y"
          placeholder="e.g., Resolved: The USFG should significantly strengthen its protection of domestic IP rights..." />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] text-[#888]">Partner (optional — for collaboration)</label>
        <select value={partnerName} onChange={e => setPartnerName(e.target.value)}
          className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white focus:outline-none focus:border-[#333]">
          <option value="">No partner</option>
          {users.filter(u => u !== userName).map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleCreate}
        disabled={creating}
        className="w-full py-3 text-[14px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors font-medium"
      >
        {creating ? 'Creating...' : 'Start Round'}
      </button>
    </div>
  );
}
