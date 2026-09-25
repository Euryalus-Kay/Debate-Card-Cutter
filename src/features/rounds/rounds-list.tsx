"use client";

import { DEFAULT_RULE_SET, RULE_SETS, type RuleSetId } from "@/domain/rules";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Swords } from "lucide-react";
import { api } from "@/client/api";
import { useApp } from "@/components/shell/app-shell";
import { Badge, Button, Dialog, EmptyState, Field, Input, Select, Spinner, Textarea, toast } from "@/components/ui";
import { FORMATS } from "@/domain/format";

interface RoundRow {
  id: string;
  title: string;
  tournament: string;
  roundLabel: string;
  ourSide: "aff" | "neg";
  opponent: { school?: string; code?: string; names?: string };
  status: string;
  updatedAt: string;
}

export function RoundsList() {
  const { team } = useApp();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["rounds", team.id], queryFn: () => api<{ rounds: RoundRow[] }>(`/api/rounds?teamId=${team.id}`) });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Rounds</h1>
            <p className="text-[13px] text-muted">Each round keeps its flow, speech drafts, documents, and prep clocks in sync between partners.</p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New round
          </Button>
        </div>
        {q.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : q.error ? (
          <p className="text-[13px] text-bad">{(q.error as Error).message}</p>
        ) : !q.data?.rounds.length ? (
          <EmptyState icon={<Swords className="size-8" />} title="No rounds yet" action={<Button onClick={() => setOpen(true)}>Create your first round</Button>}>
            Start a round when you get your pairing. Add the opponent&apos;s speech documents as they come in, and prep each speech against the actual flow.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-elev">
            {q.data.rounds.map((r) => (
              <li key={r.id}>
                <Link href={`/rounds/${r.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                  <Badge tone={r.ourSide === "aff" ? "aff" : "neg"}>{r.ourSide.toUpperCase()}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.title}</div>
                    <div className="truncate text-xs text-muted">
                      {[r.tournament, r.roundLabel && `Round ${r.roundLabel}`, r.opponent?.code || r.opponent?.school].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {r.status === "archived" ? <Badge>Archived</Badge> : null}
                  <span className="text-xs text-faint tabular">{new Date(r.updatedAt).toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <NewRoundDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function NewRoundDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { team } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    tournament: "",
    roundLabel: "",
    ourSide: "aff" as "aff" | "neg",
    formatId: "hs-standard",
    opponentCode: "",
    opponentSchool: "",
    judgeName: "",
    paradigm: "",
    resolution: "Resolved: The United States federal government should establish national health insurance in the United States.",
    ruleSet: DEFAULT_RULE_SET as RuleSetId,
    ruleText: "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/rounds", {
        method: "POST",
        json: {
          teamId: team.id,
          tournament: form.tournament,
          roundLabel: form.roundLabel,
          ourSide: form.ourSide,
          formatId: form.formatId,
          resolution: form.resolution,
          opponent: { code: form.opponentCode, school: form.opponentSchool, names: "" },
          judges: form.judgeName || form.paradigm ? [{ name: form.judgeName, paradigmText: form.paradigm, paradigmUrl: "", notes: "" }] : [],
          formatOverrides: {},
          aiPolicy: RULE_SETS[form.ruleSet].aiPolicy,
          settings: { ruleSet: form.ruleSet, ...(form.ruleText.trim() ? { ruleText: form.ruleText.trim() } : {}) },
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["rounds", team.id] });
      onOpenChange(false);
      router.push(`/rounds/${r.id}`);
    },
    onError: (e) => toast((e as Error).message, "bad"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New round"
      description="Everything here can be changed later."
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
            Create round
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Our side">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1">
            {(["aff", "neg"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("ourSide", s)}
                className={`h-7 rounded-md text-[13px] font-semibold ${form.ourSide === s ? (s === "aff" ? "bg-aff text-white" : "bg-neg text-white") : "text-muted hover:text-fg"}`}
              >
                {s === "aff" ? "Affirmative" : "Negative"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Format">
          <Select value={form.formatId} onChange={(e) => set("formatId", e.target.value)}>
            {Object.values(FORMATS).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tournament">
          <Input value={form.tournament} onChange={(e) => set("tournament", e.target.value)} placeholder="Glenbrooks" />
        </Field>
        <Field label="Round">
          <Input value={form.roundLabel} onChange={(e) => set("roundLabel", e.target.value)} placeholder="3" />
        </Field>
        <Field label="Opponent code">
          <Input value={form.opponentCode} onChange={(e) => set("opponentCode", e.target.value)} placeholder="School AB" />
        </Field>
        <Field label="Opponent school">
          <Input value={form.opponentSchool} onChange={(e) => set("opponentSchool", e.target.value)} />
        </Field>
        <Field label="Judge" className="col-span-2">
          <Input value={form.judgeName} onChange={(e) => set("judgeName", e.target.value)} placeholder="Name (optional)" />
        </Field>
        <Field
          label="Judge paradigm"
          className="col-span-2"
          hint="Paste the paradigm text. Preferences are only inferred from what it explicitly says; anything else stays unknown."
        >
          <Textarea rows={3} value={form.paradigm} onChange={(e) => set("paradigm", e.target.value)} />
        </Field>
        <Field label="Tournament rules" className="col-span-2" hint={RULE_SETS[form.ruleSet].reminder}>
          <Select value={form.ruleSet} onChange={(e) => set("ruleSet", e.target.value as RuleSetId)}>
            {Object.values(RULE_SETS).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {r.aiPolicy === "allowed" ? ": AI during the round" : ": AI before the round only"}
              </option>
            ))}
          </Select>
          {form.ruleSet === "tournament_allows" ? (
            <Textarea rows={2} className="mt-1.5" placeholder="Paste the tournament's rule on AI (from the invitation)" value={form.ruleText} onChange={(e) => set("ruleText", e.target.value)} />
          ) : null}
        </Field>
        <Field label="Resolution" className="col-span-2">
          <Textarea rows={2} value={form.resolution} onChange={(e) => set("resolution", e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
