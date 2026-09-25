"use client";

/**
 * "What I heard": each partner types what the other team says (analytics
 * included) in their own pad; partners see each other's pads live. Lines go on
 * the flow automatically after a pause (or with "Update flow"): through the AI
 * when the round allows it, otherwise through the built-in parser, which also
 * works offline. Nothing typed is lost: lines not yet on the flow are listed.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import { ListChecks, RotateCcw, Sparkles, Zap } from "lucide-react";
import { api, ApiError } from "@/client/api";
import { runOp } from "@/client/ai";
import { flushDoc, useYDocValue } from "@/client/sync/hooks";
import { Badge, Button, cn, toast, Tooltip } from "@/components/ui";
import { SPEECHES, type SpeechId } from "@/domain/format";
import { parseHeard } from "@/domain/heard-parse";
import { applyHeard, parsedToValidated, revertHeard, type HeardApplyResult } from "@/shared/heard-apply";
import { heardAuthorOf, heardKey, heardLines, heardText, heardTextKeys, readPositions, transcriptKey } from "@/shared/round-doc";
import { useBoundText } from "./use-bound-text";
import { activityEnd, activityOp, activityProgress, activityStart } from "./ai-activity";

type RunSummary = { text: string; undo: () => Promise<void> };

function summarize(r: Partial<HeardApplyResult> & { fallback?: number; rejected?: unknown[] }, ai: boolean): string {
  const parts = r.created?.length || !r.updated?.length ? [`${r.created?.length ?? 0} argument${r.created?.length === 1 ? "" : "s"} added`] : [];
  if (r.updated?.length) parts.push(`${r.updated.length} edited line${r.updated.length === 1 ? "" : "s"} re-read`);
  if (r.retired?.length) parts.push(`${r.retired.length} old reading${r.retired.length === 1 ? "" : "s"} removed`);
  if (r.aliased?.length) parts.push(`${r.aliased.length} matched to their doc`);
  if (r.notArguments) parts.push(`${r.notArguments} header/roadmap line${r.notArguments === 1 ? "" : "s"}`);
  if (ai && r.fallback) parts.push(`${r.fallback} read without AI (check them)`);
  if (!ai) parts.push("read without AI");
  return parts.join(" · ");
}

const AUTO_KEY = "clash.heard.auto";

export function HeardPad({
  roundId,
  stateDocId,
  doc,
  speech,
  aiEnabled,
  userId,
  legacyNotes,
  onFlowUpdated,
}: {
  roundId: string;
  stateDocId: string;
  doc: Y.Doc;
  speech: SpeechId;
  aiEnabled: boolean;
  userId: string;
  legacyNotes: string;
  /** called after lines reach the flow, with how many new arguments they made */
  onFlowUpdated?: (created: number) => void;
}) {
  const myKey = heardKey(speech, userId);
  const myText = useMemo(() => heardText(doc, speech, userId), [doc, speech, userId]);
  const { ref: padRef, value: padValue, onChange: onPadChange } = useBoundText(myText);
  const lines = useYDocValue(doc, (d) => heardLines(d, speech), [speech]) ?? [];
  const keys = useYDocValue(doc, (d) => heardTextKeys(d, speech), [speech]) ?? [];
  const otherPads = keys.filter((k) => k !== myKey);
  const pending = lines.filter((l) => l.status !== "flowed");
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem(AUTO_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [status, setStatus] = useState<string | null>(null);
  const [last, setLast] = useState<RunSummary | null>(null);
  const running = useRef(false);
  const lastRunAt = useRef(0);

  async function run(manual: boolean) {
    if (running.current) return;
    const todo = heardLines(doc, speech).filter((l) => l.status !== "flowed");
    if (!todo.length) {
      if (manual) toast("Everything typed for this speech is on the flow.");
      return;
    }
    running.current = true;
    lastRunAt.current = Date.now();
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    try {
      if (!aiEnabled || offline) {
        const input = todo.map((l) => ({ key: l.textKey, line: l.line, text: l.text }));
        const result = applyHeard(doc, { speech, side: SPEECHES[speech].side, lines: parsedToValidated(parseHeard(input, { positions: readPositions(doc) }), input), opId: null, by: userId });
        setLast({
          text: summarize(result, false),
          undo: async () => {
            revertHeard(doc, result);
            setLast(null);
          },
        });
        onFlowUpdated?.(result.created.length + (result.updated?.length ?? 0));
        return;
      }
      setStatus("Reading your notes…");
      const aid = `flow_${Date.now().toString(36)}`;
      activityStart({ id: aid, kind: "flow", label: `putting their ${speech} on the flow`, speech, draftId: null });
      await flushDoc(stateDocId);
      let opId: string | null = null;
      const result = (await runOp({ kind: "extract_flow", roundId, speech, mode: "fast" }, (e) => {
        if (e.t === "op") {
          opId = e.id;
          activityOp(aid, e.id);
        }
        if (e.t === "status") setStatus(e.data);
        if (e.t === "progress") {
          setStatus(e.data.stage);
          activityProgress(aid, e.data);
        }
      }).catch((err) => {
        activityEnd(aid, "failed");
        throw err;
      })) as Partial<HeardApplyResult> & { fallback?: number };
      activityEnd(aid, "applied", summarize(result, true));
      setLast({
        text: summarize(result, true),
        undo: async () => {
          if (opId) await api(`/api/ai/ops/${opId}/revert`, { method: "POST", json: {} });
          setLast(null);
        },
      });
      onFlowUpdated?.((result.created?.length ?? 0) + (result.updated?.length ?? 0));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setStatus("Your partner's update is running; yours will follow.");
      else toast(e instanceof Error ? e.message : "Couldn't update the flow.", "bad");
    } finally {
      running.current = false;
      setTimeout(() => setStatus(null), 2500);
    }
  }

  // Auto: after at least one finished new line (not the one still being typed) and a pause.
  const finished = pending.filter((l) => {
    const text = doc.getText(l.textKey).toString();
    const lastLine = text.split("\n").length - 1;
    return l.line < lastLine || text.endsWith("\n");
  });
  const signature = finished.map((l) => `${l.textKey}:${l.line}:${l.text}`).join("|");
  useEffect(() => {
    if (!auto || !signature) return;
    const wait = Math.max(4000, 15000 - (Date.now() - lastRunAt.current));
    const t = setTimeout(() => void run(false), wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, signature]);

  const flowedCount = lines.length - pending.length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">What I heard (their arguments, analytics included)</span>
        <Badge tone={pending.length ? "warn" : "ok"}>
          {flowedCount}/{lines.length} on the flow
        </Badge>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip content={auto ? "Lines go on the flow a few seconds after you finish them." : "Turn on to put finished lines on the flow automatically."}>
            <Button
              size="xs"
              variant={auto ? "subtle" : "ghost"}
              onClick={() => {
                setAuto(!auto);
                try {
                  localStorage.setItem(AUTO_KEY, auto ? "off" : "on");
                } catch {
                  /* ignore */
                }
              }}
            >
              <Zap className="size-3" /> Auto {auto ? "on" : "off"}
            </Button>
          </Tooltip>
          <Button size="xs" variant="primary" onClick={() => void run(true)} disabled={!pending.length}>
            {aiEnabled ? <Sparkles className="size-3" /> : <ListChecks className="size-3" />} Update flow
          </Button>
        </div>
      </div>
      <textarea
        ref={padRef}
        value={padValue}
        onChange={onPadChange}
        rows={8}
        spellCheck={false}
        placeholder={"Politics DA\n1. uq - bill passes now (Lee 26)\n2. LT - plan is popular\nCase\nalt causes - china (analytic)"}
        className="w-full resize-y rounded-md border border-line bg-bg px-2.5 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-accent"
        aria-label={`What I heard in their ${speech}`}
      />
      {otherPads.map((k) => (
        <div key={k} className="rounded-md border border-line bg-sunken px-2.5 py-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{k === transcriptKey(speech) ? "Transcript" : heardAuthorOf(k) === userId ? "You (other device)" : "Partner's notes"}</div>
          <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-muted">{doc.getText(k).toString() || "…"}</pre>
        </div>
      ))}
      {legacyNotes.trim() ? (
        <div className="rounded-md border border-line px-2.5 py-2 text-[12px] text-muted">
          <span className="font-medium text-fg">Earlier notes: </span>
          {legacyNotes}
        </div>
      ) : null}
      {status ? <p className="animate-pulse-soft text-xs text-muted">{status}</p> : null}
      {last ? (
        <div className="flex items-center gap-2 rounded-md bg-ok-soft px-2.5 py-1.5 text-xs text-ok">
          <span>{last.text}</span>
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => void last.undo()}>
            <RotateCcw className="size-3" /> Undo
          </Button>
        </div>
      ) : null}
      {pending.length ? (
        <div className="rounded-md border border-warn/40 px-2.5 py-1.5">
          <div className="mb-1 text-[11.5px] font-medium text-warn">Not on the flow yet ({pending.length})</div>
          <ul className="space-y-0.5 text-[12px]">
            {pending.slice(0, 12).map((l) => (
              <li key={`${l.textKey}:${l.line}`} className={cn("truncate", l.status === "changed" ? "text-warn" : "text-muted")}>
                {l.status === "changed" ? "edited · " : ""}
                {l.text}
              </li>
            ))}
            {pending.length > 12 ? <li className="text-faint">…and {pending.length - 12} more</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
