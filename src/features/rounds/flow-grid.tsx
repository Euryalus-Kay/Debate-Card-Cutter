"use client";

import { useMemo, useState } from "react";
import type * as Y from "yjs";
import { Plus } from "lucide-react";
import { Button, cn, EmptyState, Input, Select } from "@/components/ui";
import { isCasePosition, POSITION_KIND_LABEL, type ArgUnit, type PositionKind, type RoundGraph } from "@/domain/flow";
import { SPEECHES, type SpeechId } from "@/domain/format";
import { upsertArg, upsertPosition } from "@/shared/round-doc";
import { makeId } from "@/shared/editor/schema";
import type { RoundRecord } from "./types";
import { useWorkspace } from "./store";
import { DeliveryBadge } from "./coverage-panel";
import { useApp } from "@/components/shell/app-shell";

const COLUMNS: { key: string; speeches: SpeechId[]; label: string }[] = [
  { key: "1AC", speeches: ["1AC"], label: "1AC" },
  { key: "1NC", speeches: ["1NC"], label: "1NC" },
  { key: "2AC", speeches: ["2AC"], label: "2AC" },
  { key: "block", speeches: ["2NC", "1NR"], label: "2NC / 1NR" },
  { key: "1AR", speeches: ["1AR"], label: "1AR" },
  { key: "2NR", speeches: ["2NR"], label: "2NR" },
  { key: "2AR", speeches: ["2AR"], label: "2AR" },
];

export function FlowGrid({ round, doc, graph }: { round: RoundRecord; doc: Y.Doc | null; graph: RoundGraph | null }) {
  const ws = useWorkspace();
  const [adding, setAdding] = useState(false);
  const related = useMemo(() => {
    const set = new Set<string>();
    if (!graph || !ws.selectedArgId) return set;
    for (const r of graph.relations) {
      if (r.from === ws.selectedArgId) r.to.forEach((t) => set.add(t));
      if (r.to.includes(ws.selectedArgId)) set.add(r.from);
    }
    return set;
  }, [graph, ws.selectedArgId]);

  if (!doc || !graph) return null;
  const casePos = graph.positions.filter((p) => isCasePosition(p.kind));
  const offCase = graph.positions.filter((p) => !isCasePosition(p.kind));

  return (
    <div className="min-w-[1100px] p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-sm font-semibold">Flow</div>
        <span className="text-xs text-muted">Click an argument to see its details and what it answers. Linked arguments are highlighted.</span>
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" /> Position
        </Button>
      </div>
      {adding ? <AddPosition doc={doc} round={round} onDone={() => setAdding(false)} order={graph.positions.length} /> : null}
      {graph.positions.length === 0 ? (
        <EmptyState title="The flow is empty">Add speech documents in the Docs tab and choose &ldquo;Add to flow&rdquo;, or add positions by hand.</EmptyState>
      ) : null}
      {[
        { title: "Off-case", list: offCase },
        { title: "Case", list: casePos },
      ].map((group) =>
        group.list.length ? (
          <div key={group.title} className="mb-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">{group.title}</div>
            {group.list.map((p) => (
              <div key={p.id} className="mb-3 overflow-hidden rounded-xl border border-line bg-elev">
                <PositionHeader doc={doc} position={p} />
                <div className="grid" style={{ gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(0, 1fr))` }}>
                  {COLUMNS.map((col) => {
                    const args = graph.args
                      .filter((a) => a.positionId === p.id && col.speeches.includes(a.speech))
                      .sort((a, b) => col.speeches.indexOf(a.speech) - col.speeches.indexOf(b.speech) || a.order - b.order);
                    const side = SPEECHES[col.speeches[0]].side;
                    return (
                      <div key={col.key} className="min-h-16 border-r border-line p-1.5 last:border-r-0">
                        <div className={cn("mb-1 px-1 text-[10.5px] font-semibold", side === "aff" ? "text-aff" : "text-neg")}>{col.label}</div>
                        {args.map((a) => (
                          <FlowCell key={a.id} arg={a} selected={ws.selectedArgId === a.id} related={related.has(a.id)} />
                        ))}
                        <QuickAdd doc={doc} positionId={p.id} speech={col.speeches[0]} order={args.length + 1} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}

function PositionHeader({ doc, position: p }: { doc: Y.Doc; position: import("@/domain/flow").Position }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  if (editing)
    return (
      <form
        className="flex items-center gap-2 border-b border-line px-3 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          doc.transact(() => upsertPosition(doc, { ...p, name: name.trim() || p.name }));
          setEditing(false);
        }}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-7 max-w-80 text-[13px]" />
        <Button size="xs" type="submit" variant="primary">
          Save
        </Button>
        <Button size="xs" type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
      <button className="text-[13px] font-semibold hover:underline" onClick={() => (setName(p.name), setEditing(true))} title="Rename position">
        {p.name}
      </button>
      <Select
        value={p.kind}
        onChange={(e) => doc.transact(() => upsertPosition(doc, { ...p, kind: e.target.value as PositionKind }))}
        className={cn("h-6 w-auto border-transparent px-1.5 text-[11.5px] font-medium", p.side === "aff" ? "text-aff" : "text-neg")}
        aria-label="Position type"
      >
        {(Object.keys(POSITION_KIND_LABEL) as PositionKind[]).map((k) => (
          <option key={k} value={k}>
            {POSITION_KIND_LABEL[k]}
          </option>
        ))}
      </Select>
      <span className="text-[11px] text-faint">
        {p.side.toUpperCase()} · introduced in {p.introducedIn}
      </span>
    </div>
  );
}

function FlowCell({ arg, selected, related }: { arg: ArgUnit; selected: boolean; related: boolean }) {
  const ws = useWorkspace();
  return (
    <button
      onClick={() => ws.set({ selectedArgId: arg.id, right: "details" })}
      className={cn(
        "mb-1 block w-full rounded-md border px-1.5 py-1 text-left text-[12px] leading-snug",
        selected ? "border-accent bg-accent-soft" : related ? "border-accent/50 bg-accent-soft/40" : "border-transparent hover:bg-hover",
        arg.delivery === "not_read" && "opacity-40 line-through",
      )}
    >
      <div className="flex items-start gap-1">
        {arg.label ? <span className="font-semibold text-faint">{arg.label}</span> : null}
        <span className="min-w-0 flex-1">{arg.text}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        {arg.cites?.length ? <span className="truncate text-[10.5px] text-faint">{arg.cites[0]}</span> : null}
        <span className="ml-auto scale-90">
          <DeliveryBadge arg={arg} />
        </span>
      </div>
    </button>
  );
}

function QuickAdd({ doc, positionId, speech, order }: { doc: Y.Doc; positionId: string; speech: SpeechId; order: number }) {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded px-1 py-0.5 text-left text-[11px] text-faint opacity-0 hover:bg-hover hover:opacity-100 focus:opacity-100">
        + add
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return setOpen(false);
        doc.transact(() =>
          upsertArg(
            doc,
            {
              id: makeId("arg"),
              positionId,
              speech,
              side: SPEECHES[speech].side,
              order,
              label: String(order),
              text: text.trim(),
              role: "claim",
              cardIds: [],
              provenance: { type: "user_note", by: user.id },
              delivery: "confirmed",
            },
            { byHuman: true },
          ),
        );
        setText("");
        setOpen(false);
      }}
    >
      <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => !text && setOpen(false)} className="h-7 text-[12px]" placeholder="What they said" />
    </form>
  );
}

function AddPosition({ doc, round, onDone, order }: { doc: Y.Doc; round: RoundRecord; onDone: () => void; order: number }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PositionKind>("da");
  const [side, setSide] = useState<"aff" | "neg">(round.ourSide === "aff" ? "neg" : "aff");
  return (
    <form
      className="mb-4 flex items-end gap-2 rounded-xl border border-line bg-elev p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        doc.transact(() => upsertPosition(doc, { id: makeId("pos"), name: name.trim(), kind, side, introducedIn: side === "aff" ? "1AC" : "1NC", order }));
        onDone();
      }}
    >
      <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
        Name
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Politics DA" />
      </label>
      <label className="flex w-40 flex-col gap-1 text-xs font-medium">
        Type
        <Select value={kind} onChange={(e) => setKind(e.target.value as PositionKind)}>
          {(Object.keys(POSITION_KIND_LABEL) as PositionKind[]).map((k) => (
            <option key={k} value={k}>
              {POSITION_KIND_LABEL[k]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex w-32 flex-col gap-1 text-xs font-medium">
        Side
        <Select value={side} onChange={(e) => setSide(e.target.value as "aff" | "neg")}>
          <option value="aff">Aff</option>
          <option value="neg">Neg</option>
        </Select>
      </label>
      <Button type="submit" variant="primary">
        Add
      </Button>
      <Button type="button" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}
