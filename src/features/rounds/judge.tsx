"use client";

/**
 * Judge chip for the round top bar: what the judge's paradigm explicitly says
 * (each preference shows the words it came from), plus editing the paradigm.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gavel } from "lucide-react";
import { api } from "@/client/api";
import { Badge, Button, cn, Dialog, Field, Input, Spinner, Textarea, toast } from "@/components/ui";
import type { JudgeProfile } from "@/server/ai/paradigm";
import type { RoundRecord } from "./types";

type Judge = RoundRecord["judges"][number];

const FIELDS: { key: keyof JudgeProfile; label: string }[] = [
  { key: "experience", label: "Experience" },
  { key: "speed", label: "Speed" },
  { key: "docSharing", label: "Speech docs" },
  { key: "topicality", label: "Topicality" },
  { key: "counterplans", label: "Counterplans" },
  { key: "disads", label: "Disads" },
  { key: "kritiks", label: "Kritiks" },
  { key: "condo", label: "Conditionality" },
  { key: "judgeKick", label: "Judge kick" },
  { key: "new2NC", label: "New 2NC args" },
  { key: "techTruth", label: "Tech vs truth" },
  { key: "theory", label: "Theory" },
];

function display(v: unknown): string | null {
  if (v === "unknown" || v === 0 || v === "" || v === undefined || v === null) return null;
  if (typeof v === "number") return `${v}/5`;
  return String(v).replace(/_/g, " ");
}

export function JudgeChip({ round }: { round: RoundRecord }) {
  const [open, setOpen] = useState(false);
  const judge = round.judges?.[0];
  const p = judge?.profile;
  const pending = (judge?.paradigmText?.trim().length ?? 0) >= 40 && !p && !judge?.profileError;
  const speed = display(p?.speed?.value);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label="Judge preferences">
        <Gavel className="size-3.5" />
        <span className="hidden max-w-32 truncate xl:inline">{judge?.name || (judge?.paradigmText ? "Judge" : "Add judge")}</span>
        {pending ? <Spinner className="size-3" /> : speed ? <Badge tone={p?.speed?.value === "slow" ? "warn" : "neutral"}>{speed}</Badge> : null}
      </Button>
      <JudgeDialog round={round} open={open} onOpenChange={setOpen} />
    </>
  );
}

function JudgeDialog({ round, open, onOpenChange }: { round: RoundRecord; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const judge: Judge | undefined = round.judges?.[0];
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(judge?.name ?? "");
  const [text, setText] = useState(judge?.paradigmText ?? "");
  const [busy, setBusy] = useState(false);
  const p = judge?.profile;

  async function save() {
    setBusy(true);
    try {
      await api(`/api/rounds/${round.id}`, { method: "PATCH", json: { judges: [{ name: name.trim(), paradigmText: text, paradigmUrl: judge?.paradigmUrl ?? "", notes: judge?.notes ?? "" }] } });
      await qc.invalidateQueries({ queryKey: ["round", round.id] });
      setEditing(false);
      toast(text.trim() ? "Saved. Reading the paradigm…" : "Saved.", "ok");
      // The profile is extracted in the background; refresh shortly to show it.
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["round", round.id] }), 12_000);
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["round", round.id] }), 25_000);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save.", "bad");
    } finally {
      setBusy(false);
    }
  }

  const known = p ? FIELDS.map((f) => ({ ...f, field: p[f.key] as { value: unknown; quote: string } })).filter((f) => display(f.field?.value)) : [];
  const unknown = p ? FIELDS.filter((f) => !display((p[f.key] as { value: unknown })?.value)).map((f) => f.label) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={judge?.name ? `Judge: ${judge.name}` : "Judge"} description="Preferences come only from what the paradigm explicitly says; each shows the words it's based on. Speeches and time estimates adapt to them." width="max-w-2xl">
      {editing || !judge?.paradigmText?.trim() ? (
        <div className="space-y-3">
          <Field label="Judge name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Paradigm" hint="Paste the judge's paradigm text (from Tabroom or the tournament).">
            <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} aria-label="Paradigm text" />
          </Field>
          <div className="flex justify-end gap-2">
            {judge?.paradigmText ? (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
            <Button variant="primary" onClick={save} loading={busy}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-[13px]">
          {!p ? (
            judge.paradigmText.trim().length < 40 ? (
              <p className="text-muted">This paradigm is too short to read preferences from. Paste the full text.</p>
            ) : judge.profileError ? (
              <p className="text-bad">Couldn&apos;t read the paradigm: {judge.profileError}</p>
            ) : (
              <p className="flex items-center gap-2 text-muted">
                <Spinner className="size-3.5" /> Reading the paradigm…
              </p>
            )
          ) : (
            <>
              {known.length ? (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {known.map((f) => (
                    <li key={f.key} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-32 shrink-0 text-muted">{f.label}</span>
                        <span className="font-medium">{display(f.field.value)}</span>
                      </div>
                      <div className="mt-0.5 pl-34 text-[12px] text-faint">&ldquo;{f.field.quote}&rdquo;</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">The paradigm doesn&apos;t state specific preferences.</p>
              )}
              {unknown.length ? <p className="text-[12px] text-faint">Not stated (treated as unknown): {unknown.join(", ")}.</p> : null}
              {p.advice?.length ? (
                <div className="rounded-lg bg-sunken px-3 py-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Adapting to this judge</div>
                  <ul className={cn("list-disc space-y-0.5 pl-4")}>
                    {p.advice.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => (setName(judge.name ?? ""), setText(judge.paradigmText ?? ""), setEditing(true))}>
              Edit paradigm
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
