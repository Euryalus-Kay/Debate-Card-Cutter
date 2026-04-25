"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import { TargetIcon, SparkleIcon } from "@/components/ui/icons";
import { JUDGE_PARADIGMS } from "@/lib/judge-paradigms";

interface FrontlineResponse {
  label: string;
  type: "card_query" | "analytic";
  content: string;
  purpose: string;
  timeSeconds: number;
  evenIfLayer?: string;
}

interface FrontlineBlock {
  id?: string;
  title: string;
  argType: string;
  context: string;
  responses: FrontlineResponse[];
  cascadeOrder: string[];
  judgeNotes: string;
  side?: string;
  created_at?: string;
  arg_type?: string;
  judge_id?: string | null;
  cascade_order?: string[];
  judge_notes?: string;
}

const ARG_TYPES = [
  { id: "da", label: "Disadvantage" },
  { id: "cp", label: "Counterplan" },
  { id: "k", label: "Kritik" },
  { id: "t", label: "Topicality" },
  { id: "theory", label: "Theory" },
  { id: "case", label: "Case attack" },
];

export default function BlocksPage() {
  const { userName, selectedJudgeId, setSelectedJudgeId, resolution } = useApp();
  const toast = useToast();
  const [side, setSide] = useState<"aff" | "neg">("aff");
  const [argType, setArgType] = useState<string>("da");
  const [argDescription, setArgDescription] = useState("");
  const [blocks, setBlocks] = useState<FrontlineBlock[]>([]);
  const [active, setActive] = useState<FrontlineBlock | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userName) return;
    fetch(`/api/blocks?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBlocks(
            data.map((b) => ({
              ...b,
              argType: b.arg_type || b.argType,
              cascadeOrder: b.cascade_order || b.cascadeOrder,
              judgeNotes: b.judge_notes || b.judgeNotes,
            }))
          );
        }
      })
      .catch(() => {});
  }, [userName]);

  const generate = async () => {
    if (!argDescription.trim()) {
      toast.error("Describe the argument you're answering");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side,
          argumentDescription: argDescription,
          argType,
          judgeId: selectedJudgeId,
          context: resolution,
          authorName: userName,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Block build failed", data.error);
      } else {
        setActive(data);
        setBlocks((prev) => [data, ...prev]);
        toast.success("Frontline ready", `${data.responses?.length || 0} responses`);
      }
    } catch (err) {
      toast.error(
        "Block build failed",
        err instanceof Error ? err.message : "Unknown"
      );
    } finally {
      setLoading(false);
    }
  };

  const deleteBlock = async (id: string) => {
    if (!confirm("Delete this frontline?")) return;
    await fetch(`/api/blocks?id=${id}`, { method: "DELETE" });
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (active?.id === id) setActive(null);
    toast.info("Deleted");
  };

  const judge = selectedJudgeId
    ? JUDGE_PARADIGMS.find((j) => j.id === selectedJudgeId)
    : null;

  return (
    <>
      <div className="mb-6 anim-fade-in">
        <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
          <TargetIcon size={18} className="text-[var(--accent-pink)]" />
          Frontlines
        </h1>
        <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1 max-w-2xl">
          Generate AT-blocks tuned to your judge. Each block has 6-12 layered
          responses with cards, analytics, and pre-empted &ldquo;even if&rdquo; layers.
        </p>
      </div>

      {/* Generator */}
      <div className="surface-elev p-5 mb-5 anim-slide-up">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[10.5px] text-[var(--text-tertiary)] mb-1.5 block">
              Side answering
            </label>
            <div className="flex gap-1">
              {(["aff", "neg"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`flex-1 px-3 py-1.5 text-[11.5px] rounded-md border transition-colors ${
                    side === s
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                      : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="text-[10.5px] text-[var(--text-tertiary)] mb-1.5 block">
              Type of argument you&apos;re answering
            </label>
            <div className="flex flex-wrap gap-1">
              {ARG_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setArgType(t.id)}
                  className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                    argType === t.id
                      ? "border-[var(--accent-pink)] bg-[var(--accent-pink)]/10 text-white"
                      : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="text-[10.5px] text-[var(--text-tertiary)] mb-1.5 block">
          What argument are you answering? (paste or describe)
        </label>
        <textarea
          value={argDescription}
          onChange={(e) => setArgDescription(e.target.value)}
          rows={3}
          className="textarea mb-3"
          placeholder="e.g., 'States CP — 50 states implement copyright protection individually instead of federal action. Net benefit: federalism DA. Solvency: states have constitutional authority over IP enforcement.'"
        />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-[11px] text-[var(--text-tertiary)]">
            {judge ? (
              <>
                Tuned for <span className="text-white font-medium">{judge.emoji} {judge.name}</span>
              </>
            ) : (
              <>
                No judge selected ·{" "}
                <button
                  onClick={() => {
                    const first = JUDGE_PARADIGMS[0];
                    setSelectedJudgeId(first.id);
                    toast.info(`Set to ${first.name}`);
                  }}
                  className="text-[var(--accent-blue)] hover:underline"
                >
                  pick one
                </button>
              </>
            )}
          </div>
          <button
            onClick={generate}
            disabled={loading || !argDescription.trim()}
            className="btn-primary"
          >
            {loading ? (
              <>
                <span className="spinner" /> Building...
              </>
            ) : (
              <>
                <SparkleIcon size={12} /> Build frontline
              </>
            )}
          </button>
        </div>
      </div>

      {/* Active block */}
      {active && (
        <div className="surface-elev p-5 mb-5 anim-fade-in">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <span className="badge badge-pink uppercase mb-2">
                {active.argType}
              </span>
              <h2 className="text-[16px] font-semibold text-white">
                {active.title}
              </h2>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                {active.context}
              </p>
            </div>
            <button onClick={() => setActive(null)} className="btn-ghost">
              Close
            </button>
          </div>

          <div className="surface p-3 mb-4 border-l-2 border-[var(--accent-amber)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--accent-amber)] mb-1">
              Judge calibration
            </div>
            <p className="text-[11.5px] text-[var(--text-secondary)]">
              {active.judgeNotes}
            </p>
          </div>

          <div className="text-[10.5px] uppercase tracking-wider text-[var(--text-faint)] mb-2">
            Cascade order ({active.responses.length} responses)
          </div>
          <div className="flex flex-wrap gap-1 mb-3">
            {active.cascadeOrder.map((label, i) => (
              <span
                key={i}
                className="badge badge-neutral font-mono"
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>

          <div className="space-y-2">
            {active.responses.map((r, i) => (
              <div
                key={i}
                className="surface p-3 border-l-2"
                style={{
                  borderLeftColor:
                    r.type === "card_query"
                      ? "var(--accent-blue)"
                      : "var(--accent-amber)",
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge ${
                        r.type === "card_query" ? "badge-blue" : "badge-amber"
                      }`}
                    >
                      {r.type === "card_query" ? "Card" : "Analytic"}
                    </span>
                    <span className="text-[12.5px] font-semibold text-white">
                      {r.label}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-faint)]">
                    ~{r.timeSeconds}s
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-1">
                  {r.content}
                </p>
                <p className="text-[10.5px] text-[var(--text-faint)] italic">
                  Purpose: {r.purpose}
                </p>
                {r.evenIfLayer && (
                  <div className="mt-2 px-2.5 py-1.5 bg-[var(--bg-elev-3)] rounded-md text-[10.5px] text-[var(--text-secondary)] border-l border-[var(--accent-purple)]">
                    <strong className="text-[var(--accent-purple)]">Even if: </strong>
                    {r.evenIfLayer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved blocks */}
      {blocks.length > 0 && (
        <div>
          <h2 className="text-[12px] uppercase tracking-wider text-[var(--text-faint)] mb-2">
            Saved frontlines
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {blocks.map((b) => (
              <div
                key={b.id || b.title}
                className="surface surface-hover p-3 group"
              >
                <button
                  onClick={() => setActive(b)}
                  className="text-left w-full"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="badge badge-pink uppercase">
                      {b.argType || b.arg_type}
                    </span>
                    <span className="text-[10px] text-[var(--text-faint)]">
                      {b.responses?.length || 0} responses
                    </span>
                  </div>
                  <h3 className="text-[12.5px] font-semibold text-white truncate group-hover:text-[var(--accent-blue)]">
                    {b.title}
                  </h3>
                  <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 line-clamp-2">
                    {b.context}
                  </p>
                </button>
                {b.id && (
                  <button
                    onClick={() => deleteBlock(b.id!)}
                    className="text-[10px] text-[var(--text-faint)] hover:text-[var(--accent-red)] mt-2"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
