"use client";

/**
 * Who gives each of our speeches (FMT-2): the roster for our side plus
 * per-speech overrides (e.g. swapped rebuttals). Each speech is timed at its
 * speaker's calibrated pace.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api } from "@/client/api";
import { Button, Dialog, Field, Select, toast } from "@/components/ui";
import { SPEECHES, SPEECH_IDS, speakerFor, type SpeakerRole, type SpeechId } from "@/domain/format";
import { presetProfile, type RateProfile } from "@/domain/timing";
import type { RoundRecord } from "./types";

export interface Member {
  userId: string;
  name: string;
  initials: string;
  rateProfile: RateProfile | null;
}

export function useTeamMembers(teamId: string) {
  return useQuery({ queryKey: ["members", teamId], queryFn: () => api<{ members: Member[] }>(`/api/teams/${teamId}/members`), staleTime: 60_000 });
}

/** The speaker of a speech and the rate profile to time it with (the speaker's, else the viewer's). */
export function speechSpeaker(round: RoundRecord, speech: SpeechId, members: Member[] | undefined, own: RateProfile): { name: string | null; rates: RateProfile; usesSpeakerRates: boolean } {
  const id = speakerFor(speech, round.roster ?? {}, round.speakerOverrides ?? {});
  const m = members?.find((x) => x.userId === id);
  if (m) return { name: m.name, rates: m.rateProfile ?? own, usesSpeakerRates: !!m.rateProfile };
  return { name: id ?? null, rates: own, usesSpeakerRates: false };
}

const OUR_ROLES: Record<"aff" | "neg", SpeakerRole[]> = { aff: ["1A", "2A"], neg: ["1N", "2N"] };

export function SpeakersButton({ round }: { round: RoundRecord }) {
  const [open, setOpen] = useState(false);
  const members = useTeamMembers(round.teamId);
  const roles = OUR_ROLES[round.ourSide];
  const nameOf = (id: string | undefined) => members.data?.members.find((m) => m.userId === id)?.initials ?? (id ? id.slice(0, 2).toUpperCase() : "?");
  const set = roles.every((r) => round.roster?.[r]);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="Who gives each speech">
        <Users className="size-3.5" />
        <span className="hidden text-[12px] xl:inline">{set ? roles.map((r) => `${r} ${nameOf(round.roster?.[r])}`).join(" · ") : "Speakers"}</span>
      </Button>
      {open ? <SpeakersDialog round={round} members={members.data?.members ?? []} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SpeakersDialog({ round, members, onClose }: { round: RoundRecord; members: Member[]; onClose: () => void }) {
  const qc = useQueryClient();
  const roles = OUR_ROLES[round.ourSide];
  const ourSpeeches = SPEECH_IDS.filter((s) => SPEECHES[s].side === round.ourSide);
  const [roster, setRoster] = useState<Partial<Record<SpeakerRole, string>>>({ ...(round.roster ?? {}) });
  const [overrides, setOverrides] = useState<Partial<Record<SpeechId, string>>>({ ...(round.speakerOverrides ?? {}) });
  const [busy, setBusy] = useState(false);
  const fallback = presetProfile("fast");

  async function save() {
    setBusy(true);
    try {
      const cleanOverrides = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v));
      await api(`/api/rounds/${round.id}`, { method: "PATCH", json: { roster, speakerOverrides: cleanOverrides } });
      await qc.invalidateQueries({ queryKey: ["round", round.id] });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save.", "bad");
    } finally {
      setBusy(false);
    }
  }

  const option = (m: Member) => (
    <option key={m.userId} value={m.userId}>
      {m.name}
      {m.rateProfile?.observations?.length ? " (calibrated)" : ""}
    </option>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Who gives each speech" description="Each speech is timed at its speaker's measured pace (Settings → speaking rate). Swap rebuttals here if your league allows it.">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {roles.map((r) => (
            <Field key={r} label={r}>
              <Select value={roster[r] ?? ""} onChange={(e) => setRoster({ ...roster, [r]: e.target.value || undefined })} aria-label={`${r} speaker`}>
                <option value="">Not set</option>
                {members.map(option)}
              </Select>
            </Field>
          ))}
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Speeches</div>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {ourSpeeches.map((s) => {
              const byRoster = roster[SPEECHES[s].speaker];
              const who = overrides[s] ?? byRoster;
              const m = members.find((x) => x.userId === who);
              return (
                <li key={s} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="w-10 font-semibold">{s}</span>
                  <span className="text-muted">default: {SPEECHES[s].speaker}</span>
                  <Select className="ml-auto h-8 w-52" value={overrides[s] ?? ""} onChange={(e) => setOverrides({ ...overrides, [s]: e.target.value || undefined })} aria-label={`${s} speaker`}>
                    <option value="">{byRoster ? `${members.find((x) => x.userId === byRoster)?.name ?? "Roster"} (roster)` : "Roster"}</option>
                    {members.map(option)}
                  </Select>
                  <span className="w-24 text-right text-[11.5px] text-faint">{(m?.rateProfile ?? fallback).rates.analyticWpm} wpm talk</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
