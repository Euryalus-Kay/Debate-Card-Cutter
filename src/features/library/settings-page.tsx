"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Timer, Trash2 } from "lucide-react";
import { api } from "@/client/api";
import { useApp } from "@/components/shell/app-shell";
import { Badge, Button, Field, Input, Select, Textarea, toast } from "@/components/ui";
import { useSettings } from "@/client/use-settings";
import { calibrate, countWords, formatClock, presetProfile, RATE_PRESETS, type CalibrationObservation, type RatePresetId, type RateProfile } from "@/domain/timing";

export function SettingsPage() {
  const { team, user } = useApp();
  const members = useQuery({ queryKey: ["members", team.id], queryFn: () => api<{ members: { userId: string; name: string; email: string; role: string; initials: string }[] }>(`/api/teams/${team.id}/members`) });
  const [invite, setInvite] = useState<string | null>(null);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <section>
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <p className="text-[13px] text-muted">Signed in as {user.email}</p>
        </section>
        <section className="rounded-xl border border-line bg-elev p-4">
          <h2 className="text-sm font-semibold">Team: {team.name}</h2>
          <ul className="mt-2 divide-y divide-line">
            {members.data?.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 py-2 text-[13px]">
                <span className="flex size-6 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-text">{m.initials}</span>
                {m.name} <span className="text-faint">{m.email}</span>
                <Badge className="ml-auto">{m.role}</Badge>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={async () => {
                try {
                  const r = await api<{ url: string }>(`/api/teams/${team.id}/invites`, { method: "POST" });
                  setInvite(r.url);
                } catch (e) {
                  toast((e as Error).message, "bad");
                }
              }}
            >
              Create invite link
            </Button>
            {invite ? (
              <>
                <code className="min-w-0 flex-1 truncate rounded bg-sunken px-2 py-1 text-xs">{invite}</code>
                <Button size="sm" onClick={() => (navigator.clipboard.writeText(invite), toast("Copied. Send it to your partner; it works for 14 days.", "ok"))}>
                  <Copy className="size-3.5" />
                </Button>
              </>
            ) : null}
          </div>
        </section>
        <RateCalibration />
        <AiSpend teamId={team.id} />
      </div>
    </div>
  );
}

/** What the team's AI use cost this month, by feature (estimated from token counts). */
function AiSpend({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ai-usage", teamId], queryFn: () => api<{ capUsd: number; canChangeCap: boolean; month: { usd: number; byFeature: { feature: string; calls: number; usd: number }[] }; lastMonth: { usd: number }; note: string }>(`/api/teams/${teamId}/ai-usage`) });
  const d = q.data;
  const [cap, setCap] = useState<string | null>(null);
  async function saveCap() {
    const n = Math.round(Number(cap));
    if (!Number.isFinite(n) || n < 0 || n > 1000) return toast("Enter a whole number of dollars from 0 to 1000.", "warn");
    try {
      await api(`/api/teams/${teamId}/ai-usage`, { method: "POST", json: { capUsd: n } });
      setCap(null);
      await qc.invalidateQueries({ queryKey: ["ai-usage", teamId] });
      toast(`Monthly AI budget set to $${n}.`, "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }
  return (
    <section className="rounded-xl border border-line bg-elev p-4">
      <h2 className="text-sm font-semibold">AI use this month</h2>
      {!d ? (
        <p className="mt-2 text-[13px] text-muted">Loading…</p>
      ) : (
        <>
          <p className="mt-1 text-[13px]">
            About <span className="font-semibold">${d.month.usd.toFixed(2)}</span> of the ${d.capUsd} monthly budget so far{d.lastMonth.usd ? ` (last month: $${d.lastMonth.usd.toFixed(2)})` : ""}. At the budget, new AI requests stop until next month; typed notes, the flow and cards keep working.
          </p>
          {d.canChangeCap ? (
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <label htmlFor="ai-cap" className="text-muted">
                Monthly budget ($)
              </label>
              <Input id="ai-cap" className="h-8 w-24" inputMode="numeric" value={cap ?? String(d.capUsd)} onChange={(e) => setCap(e.target.value)} />
              {cap !== null && cap !== String(d.capUsd) ? (
                <Button size="sm" onClick={() => void saveCap()}>
                  Save
                </Button>
              ) : null}
            </div>
          ) : null}
          {d.month.byFeature.length ? (
            <table className="mt-2 w-full text-[12.5px]">
              <tbody className="divide-y divide-line">
                {d.month.byFeature.map((f) => (
                  <tr key={f.feature}>
                    <td className="py-1">{f.feature}</td>
                    <td className="py-1 text-right text-muted">{f.calls} run{f.calls === 1 ? "" : "s"}</td>
                    <td className="py-1 pl-3 text-right font-mono">${f.usd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="mt-2 text-[11.5px] text-faint">{d.note}</p>
        </>
      )}
    </section>
  );
}

function RateCalibration() {
  const qc = useQueryClient();
  const settings = useSettings();
  const profile: RateProfile = settings.data?.rateProfile ?? presetProfile("fast");
  const [preset, setPreset] = useState<RatePresetId>(profile.preset);
  const [savedPreset, setSavedPreset] = useState(profile.preset);
  if (savedPreset !== profile.preset) {
    setSavedPreset(profile.preset);
    setPreset(profile.preset);
  }
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"card" | "analytic">("card");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((Date.now() - started.current) / 1000), 100);
    return () => clearInterval(t);
  }, [running]);

  async function save(p: RateProfile) {
    await api("/api/me/settings", { method: "PUT", json: { rateProfile: p } });
    await qc.invalidateQueries({ queryKey: ["me", "settings"] });
  }

  async function record() {
    const words = countWords(text);
    if (words < 30 || elapsed < 5) return toast("Read at least ~30 words for a useful measurement.", "warn");
    const obs: CalibrationObservation = {
      load: kind === "card" ? { cardWords: words, tagWords: 0, analyticWords: 0, cards: 0, transitions: 0 } : { cardWords: 0, tagWords: 0, analyticWords: words, cards: 0, transitions: 0 },
      seconds: elapsed,
      source: "timed_reading",
      at: new Date().toISOString(),
    };
    const next = calibrate(preset, [...profile.observations, obs]);
    await save(next);
    toast(`Recorded ${Math.round((words / elapsed) * 60)} wpm. Estimates now use your calibration.`, "ok");
    setElapsed(0);
  }

  return (
    <section className="rounded-xl border border-line bg-elev p-4">
      <h2 className="text-sm font-semibold">Speaking rate</h2>
      <p className="mt-1 text-[13px] text-muted">Time estimates are estimates. Start from a preset, then calibrate with timed readings so the numbers reflect how you actually speak.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Starting preset">
          <Select
            value={preset}
            onChange={async (e) => {
              const p = e.target.value as RatePresetId;
              setPreset(p);
              await save(calibrate(p, profile.observations));
            }}
          >
            {(Object.keys(RATE_PRESETS) as RatePresetId[]).map((k) => (
              <option key={k} value={k}>
                {RATE_PRESETS[k].label} — {RATE_PRESETS[k].description}
              </option>
            ))}
          </Select>
        </Field>
        <div className="rounded-lg bg-sunken p-3 text-[13px]">
          <div>
            Cards <strong>{profile.rates.cardWpm}</strong> · tags <strong>{profile.rates.tagWpm}</strong> · analytics <strong>{profile.rates.analyticWpm}</strong> wpm
          </div>
          <div className="text-xs text-muted">
            {profile.observations.length ? `${profile.observations.length} measurement${profile.observations.length === 1 ? "" : "s"} · ±${Math.round(profile.uncertainty * 100)}%` : "Uncalibrated · ±20%"}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-line p-3">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Timer className="size-4" /> Timed reading
        </div>
        <p className="mt-1 text-xs text-muted">Paste what you&apos;ll read (highlighted card text or analytics), start the timer, read it at round speed, stop.</p>
        <div className="mt-2 flex gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as "card" | "analytic")} className="w-44" aria-label="What you'll read">
            <option value="card">Card text</option>
            <option value="analytic">Analytics</option>
          </Select>
          <span className="ml-auto self-center font-mono text-lg tabular">{formatClock(elapsed)}</span>
          {running ? (
            <Button variant="primary" onClick={() => setRunning(false)}>
              Stop
            </Button>
          ) : (
            <Button
              onClick={() => {
                started.current = Date.now();
                setElapsed(0);
                setRunning(true);
              }}
              disabled={!text.trim()}
            >
              Start
            </Button>
          )}
          <Button variant="primary" onClick={record} disabled={running || elapsed === 0}>
            Save measurement
          </Button>
        </div>
        <Textarea rows={4} className="mt-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text to read…" />
        <div className="mt-1 text-xs text-faint">{countWords(text)} words</div>
      </div>
      {profile.observations.length ? (
        <Button size="sm" variant="ghost" className="mt-2 text-bad" onClick={() => save(presetProfile(preset))}>
          <Trash2 className="size-3.5" /> Clear measurements
        </Button>
      ) : null}
    </section>
  );
}
