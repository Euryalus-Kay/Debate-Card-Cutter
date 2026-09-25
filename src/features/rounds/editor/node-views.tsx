"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { AlertTriangle, ExternalLink, Highlighter, Lock, LockOpen, MoreHorizontal, Sparkles, ShieldCheck, ShieldAlert, ShieldQuestion, FileWarning, Link2 } from "lucide-react";
import { Badge, cn, toast, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tooltip } from "@/components/ui";
import { BYPASS_LOCKS } from "@/shared/editor/schema";
import { pmCardBody, sectionLoad, draftFromPM, type PMNodeJSON, type DraftSection } from "@/shared/draft-model";
import { countWords, estimate, formatClock } from "@/domain/timing";
import { readAloud } from "@/domain/card";
import { lintCard, worstSeverity } from "@/domain/lint";
import { emptyCitation } from "@/domain/citation";
import { useEditorRound } from "./context";
import { useWorkspace } from "../store";
import { useState } from "react";
import { applyCardMarks } from "../proposals";
import { RehighlightDialog } from "@/features/cards/rehighlight-dialog";
import { useApp } from "@/components/shell/app-shell";

const RELATION_LABEL: Record<string, string> = {
  answers: "Answers",
  group: "Groups",
  cross_apply: "Cross-applies",
  extend: "Extends",
  new: "New",
  none: "",
};

export function SectionView(props: ReactNodeViewProps) {
  const { node, editor, getPos } = props;
  const ctx = useEditorRound();
  const ws = useWorkspace();
  const attrs = node.attrs as Record<string, unknown>;
  const id = String(attrs.id ?? "");
  const targets = (Array.isArray(attrs.targets) ? attrs.targets : []) as string[];
  const relation = String(attrs.relation ?? "none");
  const locked = !!attrs.locked;
  const json = node.toJSON() as PMNodeJSON;
  const section = (draftFromPM({ type: "doc", content: [json] }).items[0] as { section: DraftSection } | undefined)?.section;
  const est = section ? estimate(sectionLoad(section), ctx.rates) : null;
  const budget = typeof attrs.budgetSec === "number" ? attrs.budgetSec : null;
  const argById = new Map((ctx.graph?.args ?? []).map((a) => [a.id, a]));
  const partner = ctx.partnerSections.get(id);
  const highlighted = ws.selectedArgId && targets.includes(ws.selectedArgId);

  function toggleLock() {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, locked: !locked, lockedBy: !locked ? ctx.userName : null }).setMeta(BYPASS_LOCKS, true);
    editor.view.dispatch(tr);
  }

  return (
    <NodeViewWrapper
      as="section"
      data-section=""
      data-relation={relation}
      data-locked={locked ? "true" : "false"}
      className={cn(ws.selectedSectionId === id && "is-active", highlighted && "!border-l-accent")}
      onFocusCapture={() => ws.set({ selectedSectionId: id })}
    >
      <div contentEditable={false} className="mb-1 flex select-none flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
        {relation !== "none" && RELATION_LABEL[relation] ? <span className="font-medium">{RELATION_LABEL[relation]}</span> : null}
        {targets.map((t) => {
          const a = argById.get(t);
          return (
            <button key={t} onClick={() => ws.set({ selectedArgId: t, right: "details" })} className="max-w-56 truncate rounded bg-sunken px-1.5 py-px text-left hover:bg-hover" title={a?.text ?? "Argument not on the flow (deleted?)"}>
              <Link2 className="mr-0.5 inline size-3" />
              {a ? `${a.speech} ${a.label ? a.label + ". " : ""}${a.text}` : "missing argument"}
            </button>
          );
        })}
        {attrs.origin === "ai" ? (
          <Tooltip content="Written by AI from your round materials. Review before reading.">
            <span className="flex items-center gap-0.5 text-info">
              <Sparkles className="size-3" /> AI
            </span>
          </Tooltip>
        ) : null}
        {partner ? <Badge tone="info">{partner} editing</Badge> : null}
        <span className="ml-auto flex items-center gap-1">
          {est ? (
            <Tooltip content={`Estimated ${formatClock(est.low)}–${formatClock(est.high)} at your speaking rates.${budget ? ` Budget ${formatClock(budget)}.` : ""}`}>
              <span className={cn("font-mono tabular", budget && est.seconds > budget * 1.05 ? "text-bad" : "")}>
                ~{formatClock(est.seconds)}
                {budget ? ` / ${formatClock(budget)}` : ""}
              </span>
            </Tooltip>
          ) : null}
          <Tooltip content={locked ? `Locked${attrs.lockedBy ? ` by ${attrs.lockedBy}` : ""}. AI and edits can't change it. Click to unlock.` : "Lock this section so nothing (including AI) changes it."}>
            <button onClick={toggleLock} className={cn("rounded p-0.5 hover:bg-hover", locked && "text-fg")} aria-label={locked ? "Unlock section" : "Lock section"}>
              {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
            </button>
          </Tooltip>
          {ctx.aiEnabled && !locked ? (
            <Menu>
              <MenuTrigger className="rounded p-0.5 hover:bg-hover" aria-label="AI actions for this section">
                <Sparkles className="size-3.5" />
              </MenuTrigger>
              <MenuContent>
                <MenuLabel>Revise this section</MenuLabel>
                <MenuItem onSelect={() => ctx.onSectionAi(id, "strengthen")}>Deepen the answer (warrants + comparison)</MenuItem>
                <MenuItem onSelect={() => ctx.onSectionAi(id, "clarify")}>Make the explanation clearer</MenuItem>
                <MenuItem onSelect={() => ctx.onSectionAi(id, "reword")}>Keep the argument, change the wording</MenuItem>
                <MenuItem onSelect={() => ctx.onSectionAi(id, "condense")}>Condense to fit budget</MenuItem>
                <MenuItem onSelect={() => ctx.onSectionAi(id, "alternatives")}>Three different approaches</MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={() => ctx.onSectionAi(id, "find_card")}>Describe the card this section needs</MenuItem>
                <MenuItem onSelect={() => ctx.onSectionResearch(id)}>Cut a new card from the web…</MenuItem>
              </MenuContent>
            </Menu>
          ) : null}
          <Menu>
            <MenuTrigger className="rounded p-0.5 hover:bg-hover" aria-label="Section options">
              <MoreHorizontal className="size-3.5" />
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                onSelect={() => {
                  const pos = getPos();
                  if (typeof pos !== "number") return;
                  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, owner: attrs.owner === ctx.userName ? null : ctx.userName }));
                }}
              >
                {attrs.owner === ctx.userName ? "Release ownership" : "I'm working on this"}
              </MenuItem>
              <MenuItem
                onSelect={() => {
                  const secs = window.prompt("Time budget for this section (seconds)", budget ? String(budget) : "");
                  if (secs === null) return;
                  const pos = getPos();
                  if (typeof pos !== "number") return;
                  const n = Number(secs);
                  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, budgetSec: Number.isFinite(n) && n > 0 ? n : null }));
                }}
              >
                Set time budget…
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                disabled={locked}
                onSelect={() => {
                  const pos = getPos();
                  if (typeof pos !== "number") return;
                  editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
                }}
              >
                Delete section
              </MenuItem>
            </MenuContent>
          </Menu>
        </span>
        {attrs.owner ? <span className="text-[11px] text-faint">· {String(attrs.owner)}</span> : null}
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export function CardView(props: ReactNodeViewProps) {
  const { node } = props;
  const ctx = useEditorRound();
  const ws = useWorkspace();
  const attrs = node.attrs as Record<string, unknown>;
  const json = node.toJSON() as PMNodeJSON;
  const body = pmCardBody(json);
  const tag = (json.content?.find((c) => c.type === "cardTag")?.content ?? []).map((c) => c.text ?? "").join("");
  const issues = lintCard({ tag, body, citation: emptyCitation() }, { inSpeech: true }).filter((i) => !i.code.startsWith("cite_") && i.code !== "unverified_qualifications");
  const worst = worstSeverity(issues);
  const v = String(attrs.verification ?? "unverified");
  const edited = !!attrs.textEdited;
  const inBasket = attrs.cardId ? ws.basket.includes(String(attrs.cardId)) : false;
  const [rehighlight, setRehighlight] = useState(false);
  const { team } = useApp();
  // Read time for this card at the speaker's pace (highlighted words, plus its tag and cite).
  const readSecs = estimate({ cardWords: countWords(readAloud(body).text), tagWords: countWords(tag) + 2, analyticWords: 0, cards: 1, transitions: 0 }, ctx.rates).seconds;
  const vMeta =
    edited
      ? { icon: <FileWarning className="size-3.5" />, tone: "bad" as const, label: "Text edited", hint: "The evidence text was edited in this document and no longer matches the verified source." }
      : v === "verified" || v === "verified_quote_only"
        ? { icon: <ShieldCheck className="size-3.5" />, tone: "ok" as const, label: "Verified", hint: "Every word matched the stored source text." }
        : v === "imported"
          ? { icon: <ShieldQuestion className="size-3.5" />, tone: "neutral" as const, label: "Imported", hint: "From a document you imported; not independently checked against the original." }
          : v === "mismatch"
            ? { icon: <ShieldAlert className="size-3.5" />, tone: "bad" as const, label: "Mismatch", hint: "The text did NOT match the source when checked." }
            : { icon: <ShieldQuestion className="size-3.5" />, tone: "warn" as const, label: "Unverified", hint: "The original source could not be checked." };

  return (
    <NodeViewWrapper className={cn("node-card group relative", inBasket && "rounded-md ring-1 ring-accent/40")} data-card="" data-verification={edited ? "edited" : v}>
      {/* Status strip: floats right so the tag wraps around it; always visible (evidence integrity). */}
      <div contentEditable={false} className="card-status float-right ml-3 flex select-none items-center gap-1 pt-0.5">
        <Tooltip content="Time to read this card (tag, cite, and highlighted text) at the speaker's pace">
          <span className="font-mono text-[11px] tabular text-faint" aria-label={`About ${Math.round(readSecs)} seconds to read`}>
            ~{formatClock(readSecs)}
          </span>
        </Tooltip>
        <Tooltip content={vMeta.hint}>
          <span aria-label={`Evidence status: ${vMeta.label}`} role="img" className={cn(vMeta.tone === "ok" && "opacity-75 group-hover:opacity-100")}>
            <Badge tone={vMeta.tone}>
              {vMeta.icon}
              {vMeta.label}
            </Badge>
          </span>
        </Tooltip>
        {worst ? (
          <Tooltip content={issues.map((i) => `• ${i.message}`).join("\n")}>
            <span aria-label={`${issues.length} evidence ${issues.length === 1 ? "issue" : "issues"}`} role="img">
              <Badge tone={worst === "error" ? "bad" : worst === "warning" ? "warn" : "neutral"}>
                <AlertTriangle className="size-3" />
                {issues.length}
              </Badge>
            </span>
          </Tooltip>
        ) : null}
        {ctx.aiEnabled ? (
          <Tooltip content="Re-highlight to a read length (words never change)">
            <button className="rounded p-0.5 text-faint hover:bg-hover hover:text-fg" aria-label="Re-highlight card" onClick={() => setRehighlight(true)}>
              <Highlighter className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content="Open the full card (source, highlighting, history)">
          <button className="rounded p-0.5 text-faint hover:bg-hover hover:text-fg" aria-label="Open card" onClick={() => ctx.onCardOpen((attrs.cardId as string) ?? null, String(attrs.id))}>
            <ExternalLink className="size-3.5" />
          </button>
        </Tooltip>
      </div>
      <NodeViewContent />
      {rehighlight ? (
        <RehighlightDialog
          open
          onOpenChange={setRehighlight}
          tag={tag}
          body={body}
          teamId={team.id}
          roundId={ws.roundId ?? undefined}
          cardWpm={ctx.rates.rates.cardWpm}
          onApply={(next) => {
            const r = applyCardMarks(props.editor, String(attrs.id), next);
            if (r === "changed") toast("The card changed while you were choosing; nothing was applied.", "warn");
            else if (r === "missing") toast("That card is no longer in the draft.", "warn");
            else toast("Re-highlighted.", "ok");
          }}
        />
      ) : null}
    </NodeViewWrapper>
  );
}
