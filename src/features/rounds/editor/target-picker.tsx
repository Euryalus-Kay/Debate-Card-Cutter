"use client";

/**
 * Link a section to the flow arguments it answers or extends, so hand-written
 * sections count toward coverage like AI ones. Type to search what this speech
 * must answer (and our arguments it can extend); pick to toggle. Written as an
 * attribute-only change, which the lock guard allows.
 */

import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, Link2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { cn } from "@/components/ui";
import { isLive, type ArgUnit, type RoundGraph } from "@/domain/flow";
import { SPEECHES, speechesToAnswer, speechesToExtend, type SpeechId } from "@/domain/format";
import type { SectionRelation } from "@/shared/editor/schema";

export function TargetPicker({ editor, getPos, graph, speech, targets, relation }: { editor: Editor; getPos: () => number | undefined; graph: RoundGraph | null; speech: SpeechId | null; targets: string[]; relation: SectionRelation }) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    if (!graph || !speech) return { answer: [] as ArgUnit[], extend: [] as ArgUnit[] };
    const side = SPEECHES[speech].side;
    const answerFrom = new Set(speechesToAnswer(speech));
    const extendFrom = new Set(speechesToExtend(speech));
    const live = graph.args.filter((a) => isLive(a) && !a.sameAs);
    return {
      answer: live.filter((a) => a.side !== side && answerFrom.has(a.speech)),
      extend: live.filter((a) => a.side === side && extendFrom.has(a.speech)),
    };
  }, [graph, speech]);
  const posName = useMemo(() => new Map((graph?.positions ?? []).map((p) => [p.id, p.name])), [graph]);

  function toggle(a: ArgUnit, kind: "answer" | "extend") {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const next = targets.includes(a.id) ? targets.filter((t) => t !== a.id) : [...targets, a.id];
    let rel: SectionRelation = relation;
    if (!next.length) rel = "none";
    else if (kind === "extend") rel = "extend";
    else if (relation === "none" || relation === "extend") rel = next.length > 1 ? "group" : "answers";
    else if (relation === "answers" && next.length > 1) rel = "group";
    else if (relation === "group" && next.length === 1) rel = "answers";
    editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, "targets", next).setNodeAttribute(pos, "relation", rel));
  }

  const item = (a: ArgUnit, kind: "answer" | "extend") => (
    <Command.Item key={`${kind}:${a.id}`} value={`${a.speech} ${posName.get(a.positionId) ?? ""} ${a.label ?? ""} ${a.text}`} onSelect={() => toggle(a, kind)} className="flex cursor-pointer items-start gap-1.5 rounded px-2 py-1 text-[12.5px] data-[selected=true]:bg-hover">
      <Check className={cn("mt-0.5 size-3.5 shrink-0", targets.includes(a.id) ? "opacity-100 text-accent" : "opacity-0")} />
      <span className="min-w-0">
        <span className="text-faint">
          {a.speech} · {posName.get(a.positionId) ?? ""} {a.label ? `${a.label}.` : ""}
        </span>{" "}
        {a.text}
        {a.evidence === "analytic" ? <span className="ml-1 text-[10.5px] text-muted">(analytic)</span> : null}
      </span>
    </Command.Item>
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="flex items-center gap-0.5 rounded px-1 py-px hover:bg-hover" aria-label="Link this section to flow arguments">
          <Link2 className="size-3" /> {targets.length ? "Links" : "Link to flow"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-[26rem] rounded-lg border border-line bg-elev p-1.5 shadow-lg">
          <Command label="Link to flow arguments">
            <Command.Input autoFocus placeholder="Search their arguments or ours…" className="mb-1 w-full rounded-md border border-line bg-bg px-2 py-1 text-[12.5px] outline-none focus:border-accent" />
            <Command.List className="max-h-72 overflow-y-auto">
              <Command.Empty className="px-2 py-1.5 text-[12px] text-muted">Nothing matches.</Command.Empty>
              {options.answer.length ? (
                <Command.Group heading="Answer" className="text-[11px] font-semibold text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
                  {options.answer.map((a) => item(a, "answer"))}
                </Command.Group>
              ) : null}
              {options.extend.length ? (
                <Command.Group heading="Extend ours" className="text-[11px] font-semibold text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
                  {options.extend.map((a) => item(a, "extend"))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
