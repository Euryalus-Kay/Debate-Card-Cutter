"use client";

/**
 * Re-highlight a card to a chosen read length. The words never change; only
 * what is underlined and highlighted does. Preview first, then apply.
 */

import { useState } from "react";
import { Highlighter } from "lucide-react";
import { api } from "@/client/api";
import { Badge, Button, cn, Dialog, Input, Spinner, toast } from "@/components/ui";
import { CardBodyView } from "@/components/card-view";
import { readAloud, type BodyBlock } from "@/domain/card";
import { countWords, formatClock } from "@/domain/timing";

interface Proposal {
  body: BodyBlock[];
  read: string;
  metrics: { readWords: number; fragments: number; fragmentsPer100: number };
  issues: { code: string; message: string }[];
  protectedWords: string[];
  model?: string;
  ms: number;
}

const PRESETS = [
  { label: "Short", seconds: 10, hint: "rebuttals, quick extensions" },
  { label: "Medium", seconds: 20, hint: "most cards" },
  { label: "Long", seconds: 30, hint: "key cards, constructives" },
];

export function RehighlightDialog({
  open,
  onOpenChange,
  tag,
  body,
  teamId,
  roundId,
  cardWpm,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tag: string;
  body: BodyBlock[];
  teamId: string;
  roundId?: string;
  cardWpm: number;
  onApply: (body: BodyBlock[]) => void | Promise<void>;
}) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const currentWords = countWords(readAloud(body).text);
  const secondsFor = (words: number) => (words / cardWpm) * 60;

  async function run(seconds: number) {
    setBusy(true);
    setProposal(null);
    try {
      const targetWords = Math.max(12, Math.round((seconds * cardWpm) / 60));
      const p = await api<Proposal>("/api/ai/highlight", { method: "POST", json: { teamId, roundId, tag, body, targetWords } });
      setProposal(p);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Highlighting failed.", "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setProposal(null);
        onOpenChange(o);
      }}
      title="Re-highlight"
      description="Choose how long the read should be. The card's words never change, only what is highlighted (read aloud) and underlined."
      width="max-w-2xl"
    >
      <div className="space-y-3 text-[13px]">
        <div className="text-muted">
          Now: {currentWords} words read · ~{formatClock(secondsFor(currentWords))} at your card pace ({cardWpm} wpm)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} size="sm" onClick={() => void run(p.seconds)} disabled={busy} title={p.hint}>
              {p.label} · {p.seconds}s
            </Button>
          ))}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const s = Number(custom);
              if (s >= 3 && s <= 120) void run(s);
            }}
          >
            <Input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} placeholder="secs" className="h-8 w-16" aria-label="Custom read length in seconds" />
            <Button size="sm" type="submit" disabled={busy || !custom}>
              Go
            </Button>
          </form>
          {busy ? <Spinner className="size-4" /> : null}
        </div>
        {proposal ? (
          <div className="space-y-2 rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">
                {proposal.metrics.readWords} words · ~{formatClock(secondsFor(proposal.metrics.readWords))}
              </Badge>
              <span className="text-[11.5px] text-faint">
                {proposal.metrics.fragments} phrases · {proposal.model} · {(proposal.ms / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="rounded-md bg-sunken px-2.5 py-2">
              <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Read aloud</div>
              <p className="leading-relaxed">{proposal.read}</p>
            </div>
            {proposal.protectedWords.length ? <p className="text-[12px] text-muted">Kept &ldquo;{[...new Set(proposal.protectedWords)].join("”, “")}&rdquo; in the read so the author&apos;s meaning doesn&apos;t change.</p> : null}
            {proposal.issues.length ? (
              <ul className="space-y-0.5 text-[12px] text-warn">
                {proposal.issues.map((i, k) => (
                  <li key={k}>{i.message}</li>
                ))}
              </ul>
            ) : null}
            <div className="max-h-72 overflow-y-auto rounded-md border border-line p-2">
              <CardBodyView body={proposal.body} shrink />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setProposal(null)}>
                Discard
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  await onApply(proposal.body);
                  setProposal(null);
                  onOpenChange(false);
                }}
              >
                <Highlighter className="size-3.5" /> Apply
              </Button>
            </div>
          </div>
        ) : !busy ? (
          <p className={cn("text-[12px] text-faint")}>The AI writes the sentences you&apos;ll say using only the card&apos;s words in order; the app places them on the card and keeps negations and qualifiers so the meaning can&apos;t flip.</p>
        ) : null}
      </div>
    </Dialog>
  );
}
