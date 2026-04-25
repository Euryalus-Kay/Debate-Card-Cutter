"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import { consumeSSE } from "@/lib/sse-client";
import CardDisplay from "@/components/CardDisplay";
import CostWarning, {
  estimateCost,
  type CostEstimate,
} from "@/components/argument/CostWarning";
import PresetGallery, {
  ARGUMENT_PRESETS,
  type ArgumentPreset,
} from "@/components/argument/PresetGallery";
import {
  ShieldIcon,
  SparkleIcon,
  ZapIcon,
  TargetIcon,
  ScalesIcon,
  BookIcon,
  GavelIcon,
} from "@/components/ui/icons";
import { JUDGE_PARADIGMS } from "@/lib/judge-paradigms";

type ArgumentType = "aff" | "da" | "cp" | "k" | "t" | "theory" | "custom";

interface ComponentPlan {
  index: number;
  type: "card" | "analytic" | "plan_text" | "interp_text";
  label: string;
  purpose: string;
}

interface GeneratedComponent {
  index: number;
  sectionIndex?: number;
  sectionHeader?: string;
  type: "card" | "analytic" | "plan_text" | "interp_text";
  label: string;
  purpose: string;
  id?: string;
  tag?: string;
  cite?: string;
  cite_author?: string;
  evidence_html?: string;
  content?: string;
  fallback?: boolean;
}

interface SectionPlan {
  index: number;
  section_header: string;
  components: ComponentPlan[];
}

interface ArgumentPlan {
  title: string;
  description?: string;
  file_notes?: string;
  strategy_overview: string;
  argument_type: string;
  total_components: number;
  components?: ComponentPlan[];
  sections?: SectionPlan[];
}

interface ProgressUpdate {
  step: string;
  index?: number;
  total?: number;
  label: string;
  icon?: string;
  type?: string;
}

interface BuildJob {
  id: string;
  title: string;
  status: string;
  total_components: number;
  completed_components: number;
  failed_components: number;
  current_label: string;
  argument_id: string | null;
  created_at: string;
}

const ARGUMENT_TYPES: { value: ArgumentType; label: string }[] = [
  { value: "aff", label: "Aff" },
  { value: "da", label: "DA" },
  { value: "cp", label: "CP" },
  { value: "k", label: "K" },
  { value: "t", label: "T" },
  { value: "theory", label: "Theory" },
  { value: "custom", label: "Custom" },
];

function getStepIcon(icon?: string) {
  switch (icon) {
    case "brain":
    case "search":
    case "filter":
    case "download":
    case "sparkle":
    case "save":
      return null;
    default:
      return null;
  }
}

function argumentToGoogleDocsHtml(
  plan: ArgumentPlan,
  components: GeneratedComponent[]
): string {
  let html = "";
  html += `<p style="font-family:Georgia,serif;font-size:16px;font-weight:bold;margin:0 0 4px 0;text-align:center;">${plan.title}</p>`;
  html += `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 12px 0;text-align:center;color:#666;">${plan.description || plan.file_notes || ""}</p>`;
  for (const comp of components) {
    html += `<p style="font-family:Georgia,serif;font-size:13px;font-weight:bold;margin:16px 0 4px 0;text-decoration:underline;">${comp.label}</p>`;
    if (comp.type === "plan_text" || comp.type === "interp_text") {
      html += `<p style="font-family:Georgia,serif;font-size:12px;font-weight:bold;margin:0 0 8px 0;">${comp.content || ""}</p>`;
    } else if (comp.type === "analytic") {
      html += `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 8px 0;"><b>${comp.content || ""}</b></p>`;
    } else if (comp.type === "card" && comp.tag) {
      html += `<p style="font-family:Georgia,serif;font-size:13px;font-weight:bold;margin:0 0 4px 0;">${comp.tag}</p>`;
      let citeHtml = comp.cite || "";
      if (comp.cite_author && citeHtml.includes(comp.cite_author)) {
        const idx = citeHtml.indexOf(comp.cite_author);
        citeHtml =
          citeHtml.substring(0, idx) +
          `<b><u>${comp.cite_author}</u></b>` +
          citeHtml.substring(idx + comp.cite_author.length);
      }
      html += `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 4px 0;">${citeHtml}</p>`;
      if (comp.evidence_html) {
        const evidence = comp.evidence_html
          .replace(
            /<mark>/g,
            '</span><b><u><span style="font-family:Georgia,serif;font-size:11px;">'
          )
          .replace(
            /<\/mark>/g,
            '</span></u></b><span style="font-family:Georgia,serif;font-size:8px;color:#666;">'
          );
        html += `<p style="font-family:Georgia,serif;font-size:8px;color:#666;margin:0 0 12px 0;line-height:1.4;"><span style="font-family:Georgia,serif;font-size:8px;color:#666;">${evidence}</span></p>`;
      }
    }
  }
  return html;
}

export default function ArgumentPage() {
  const { userName, selectedJudgeId, setSelectedJudgeId } = useApp();
  const toast = useToast();
  const [argumentType, setArgumentType] = useState<ArgumentType>("da");
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetFilter, setPresetFilter] = useState<ArgumentType | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [plan, setPlan] = useState<ArgumentPlan | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [components, setComponents] = useState<GeneratedComponent[]>([]);
  const [completedIndices, setCompletedIndices] = useState<Set<number>>(new Set());
  const [errorIndices, setErrorIndices] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<Record<number, string>>({});
  const [copied, setCopied] = useState(false);
  const [costWarningOpen, setCostWarningOpen] = useState(false);
  const [activeBuilds, setActiveBuilds] = useState<BuildJob[]>([]);
  const [libraryCardCount, setLibraryCardCount] = useState<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const componentCountRef = useRef(0);
  const startedAtRef = useRef<number>(0);

  // Load context
  useEffect(() => {
    if (!userName) return;
    fetch(`/api/context?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.context) setContext(data.context);
      })
      .catch(() => {});
  }, [userName]);

  // Library awareness — show how many cards we already have
  useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLibraryCardCount(data.length);
      })
      .catch(() => {});
  }, []);

  // Poll active builds
  useEffect(() => {
    if (!userName) return;
    const fetchBuilds = () => {
      fetch(`/api/build-jobs?user=${encodeURIComponent(userName)}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setActiveBuilds(data);
        })
        .catch(() => {});
    };
    fetchBuilds();
    const interval = setInterval(fetchBuilds, 4000);
    return () => clearInterval(interval);
  }, [userName]);

  const judge = selectedJudgeId
    ? JUDGE_PARADIGMS.find((j) => j.id === selectedJudgeId)
    : null;

  const estimate = useMemo<CostEstimate>(
    () => estimateCost(argumentType, query),
    [argumentType, query]
  );

  const elapsedSec = startedAtRef.current
    ? Math.round((Date.now() - startedAtRef.current) / 1000)
    : 0;

  const handlePresetSelect = (preset: ArgumentPreset) => {
    setSelectedPresetId(preset.id);
    setArgumentType(preset.argType);
    if (preset.examplePrompt && !query.trim()) {
      setQuery(preset.examplePrompt);
    }
  };

  const requestBuild = () => {
    if (!query.trim()) {
      toast.error("Describe the argument first");
      return;
    }
    setCostWarningOpen(true);
  };

  const generateArgument = async () => {
    setCostWarningOpen(false);
    setLoading(true);
    setError("");
    setPlan(null);
    setComponents([]);
    setCompletedIndices(new Set());
    setErrorIndices(new Set());
    setDone(false);
    setProgress(null);
    componentCountRef.current = 0;
    startedAtRef.current = Date.now();

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const res = await fetch("/api/argument", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          context,
          authorName: userName || "Anonymous",
          argument_type: argumentType,
          judgeId: selectedJudgeId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Argument generation failed");
      }

      let receivedDone = false;
      try {
        await consumeSSE(
          res,
          (event, data) => {
            if (event === "done") receivedDone = true;
            handleSSEEvent(event, data as Record<string, unknown>);
          },
          { signal: controller.signal }
        );
      } catch {
        /* swallow stream interruptions */
      }
      if (!receivedDone && componentCountRef.current > 0) {
        setDone(true);
        setProgress(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (componentCountRef.current > 0) setDone(true);
        setProgress(null);
        toast.info("Stopped");
      } else if (componentCountRef.current === 0) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } else {
        setDone(true);
        setProgress(null);
      }
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  };

  const handleSSEEvent = (event: string, data: Record<string, unknown>) => {
    switch (event) {
      case "progress":
        setProgress(data as unknown as ProgressUpdate);
        break;
      case "plan":
        setPlan(data as unknown as ArgumentPlan);
        break;
      case "component_done": {
        const comp = data as unknown as GeneratedComponent;
        setComponents((prev) => [...prev, comp]);
        setCompletedIndices((prev) => new Set([...prev, comp.index]));
        componentCountRef.current++;
        break;
      }
      case "component_error": {
        const idx = data.index as number;
        setErrorIndices((prev) => new Set([...prev, idx]));
        break;
      }
      case "done":
        setDone(true);
        setProgress(null);
        break;
      case "error":
        setError(data.message as string);
        setDone(true);
        setProgress(null);
        break;
    }
  };

  const handleIterate = async (cardId: string, instruction: string) => {
    setIteratingId(cardId);
    try {
      const res = await fetch("/api/iterate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, instruction }),
      });
      const data = await res.json();
      if (data.tag && data.evidence_html) {
        setComponents((prev) =>
          prev.map((c) =>
            c.id === cardId
              ? { ...c, tag: data.tag, evidence_html: data.evidence_html }
              : c
          )
        );
        toast.success("Card updated");
      }
    } catch (err) {
      toast.error("Iterate failed", err instanceof Error ? err.message : "");
    } finally {
      setIteratingId(null);
    }
  };

  const handleEditContent = (index: number, newContent: string) => {
    setEditingContent((prev) => ({ ...prev, [index]: newContent }));
    setComponents((prev) =>
      prev.map((c) => (c.index === index ? { ...c, content: newContent } : c))
    );
  };

  const copyCompleteArgument = async () => {
    if (!plan) return;
    try {
      const html = argumentToGoogleDocsHtml(plan, components);
      const plainParts: string[] = [plan.title, plan.file_notes || plan.description || "", ""];
      for (const comp of components) {
        plainParts.push(`--- ${comp.label} ---`);
        if (comp.type === "card" && comp.tag) {
          plainParts.push(comp.tag);
          plainParts.push(comp.cite || "");
          plainParts.push((comp.evidence_html || "").replace(/<[^>]*>/g, ""));
        } else {
          plainParts.push(comp.content || "");
        }
        plainParts.push("");
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainParts.join("\n")], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      toast.success("Copied", "Paste into Google Docs");
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      toast.error("Copy failed", err instanceof Error ? err.message : "");
    }
  };

  // Quality stats on the generated file
  const qualityStats = useMemo(() => {
    const cardCount = components.filter((c) => c.type === "card").length;
    const analyticCount = components.filter((c) => c.type === "analytic").length;
    const fallbackCount = components.filter(
      (c) =>
        c.fallback ||
        (c.content && (c.content.startsWith("[") && c.content.endsWith("]")))
    ).length;
    const realCount = components.filter((c) => c.type === "card" && c.tag).length;
    const totalEvidenceWords = components
      .filter((c) => c.type === "card" && c.evidence_html)
      .reduce((acc, c) => {
        const text = (c.evidence_html || "").replace(/<[^>]+>/g, "");
        return acc + text.split(/\s+/).filter(Boolean).length;
      }, 0);
    const avgWordsPerCard =
      realCount > 0 ? Math.round(totalEvidenceWords / realCount) : 0;
    return {
      cardCount,
      analyticCount,
      fallbackCount,
      realCount,
      totalEvidenceWords,
      avgWordsPerCard,
    };
  }, [components]);

  return (
    <>
      {/* Header */}
      <div className="mb-6 anim-fade-in">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
              <ShieldIcon size={18} className="text-[var(--accent-purple)]" />
              Build Argument
            </h1>
            <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1 max-w-2xl">
              Generates a complete camp-quality file: shell, extensions, AT
              blocks, analytics. Strict mode — every card uses real source text;
              no fabrication.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {libraryCardCount !== null && (
              <a
                href="/library"
                className="text-[11px] text-[var(--text-tertiary)] hover:text-white flex items-center gap-1.5"
              >
                <BookIcon size={11} />
                {libraryCardCount} cards in library
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Background builds banner */}
      {activeBuilds.filter((b) => b.status === "building").length > 0 && (
        <div className="space-y-2 mb-5">
          {activeBuilds
            .filter((b) => b.status === "building")
            .map((build) => (
              <div
                key={build.id}
                className="surface-elev p-3 anim-slide-up border-l-2 border-[var(--accent-blue)]"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="spinner" />
                    <span className="text-[12.5px] font-medium text-white">
                      {build.title}
                    </span>
                  </div>
                  <span className="text-[10.5px] text-[var(--text-tertiary)]">
                    Building in background — safe to leave
                  </span>
                </div>
                <div className="progress-bar mb-1">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width:
                        build.total_components > 0
                          ? `${(build.completed_components / build.total_components) * 100}%`
                          : "0%",
                    }}
                  />
                </div>
                <p className="text-[10.5px] text-[var(--text-tertiary)]">
                  {build.completed_components}/{build.total_components} cards ·{" "}
                  {build.current_label}
                </p>
              </div>
            ))}
        </div>
      )}

      <div className="space-y-5">
        {/* Preset gallery */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="text-[12px] text-[var(--text-tertiary)]">
              Preset
            </label>
            <div className="flex gap-1 flex-wrap">
              {(["all", ...ARGUMENT_TYPES.map((t) => t.value)] as const).map(
                (id) => (
                  <button
                    key={id}
                    onClick={() => setPresetFilter(id as typeof presetFilter)}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      presetFilter === id
                        ? "bg-[var(--bg-elev-3)] text-white"
                        : "text-[var(--text-tertiary)] hover:text-white"
                    }`}
                  >
                    {id === "all" ? "All" : id.toUpperCase()}
                  </button>
                )
              )}
            </div>
          </div>
          <PresetGallery
            selectedId={selectedPresetId}
            onSelect={handlePresetSelect}
            filter={presetFilter}
          />
        </div>

        {/* Argument type override (in case user wants different) */}
        <div>
          <label className="text-[12px] text-[var(--text-tertiary)] mb-1.5 block">
            Argument type
          </label>
          <div className="flex gap-1 flex-wrap">
            {ARGUMENT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setArgumentType(t.value)}
                disabled={loading}
                className={`px-3 py-1.5 text-[12px] rounded-md border transition-all ${
                  argumentType === t.value
                    ? "border-[var(--accent-purple)] bg-[var(--accent-purple-glow)] text-white"
                    : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Topic / context */}
        <div>
          <label className="text-[12px] text-[var(--text-tertiary)] mb-1.5 block">
            Topic / round context
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g., Resolved: USFG should establish national health insurance. Going neg against a federal single-payer aff."
            className="textarea"
            rows={2}
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-[12px] text-[var(--text-tertiary)] mb-1.5 block">
            Describe the argument in detail
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              ARGUMENT_PRESETS.find((p) => p.id === selectedPresetId)
                ?.examplePrompt ||
              "Specific is better than general. Include: the link mechanism, the impact, key authors if you have them in mind, and the kind of aff this is meant to answer."
            }
            className="textarea"
            rows={4}
          />
        </div>

        {/* Judge calibration */}
        <div className="surface p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[11.5px] text-[var(--text-tertiary)]">
            <GavelIcon size={11} />
            {judge ? (
              <span>
                Tuned for{" "}
                <span className="text-white font-medium">
                  {judge.emoji} {judge.name}
                </span>
              </span>
            ) : (
              <span>No judge selected — using circuit policymaker default</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedJudgeId(null)}
              className={`px-2 py-0.5 text-[10px] rounded ${
                !selectedJudgeId
                  ? "bg-[var(--bg-elev-3)] text-white"
                  : "text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              None
            </button>
            {JUDGE_PARADIGMS.map((j) => (
              <button
                key={j.id}
                onClick={() => setSelectedJudgeId(j.id)}
                className={`px-2 py-0.5 text-[10px] rounded ${
                  selectedJudgeId === j.id
                    ? "bg-[var(--accent-blue-glow)] text-white border border-[var(--accent-blue)]"
                    : "text-[var(--text-tertiary)] hover:text-white"
                }`}
                title={j.description}
              >
                {j.emoji} {j.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Pre-flight estimate strip */}
        {!loading && !done && (
          <div className="surface p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 anim-fade-in">
            <PreflightStat
              icon={<ZapIcon size={11} />}
              label="Cards"
              value={`${estimate.cardCount}`}
            />
            <PreflightStat
              icon={<TargetIcon size={11} />}
              label="Analytics"
              value={`${estimate.analyticCount}`}
            />
            <PreflightStat
              icon={<SparkleIcon size={11} />}
              label="Time"
              value={`${estimate.estimatedMinutes.low}-${estimate.estimatedMinutes.high}m`}
            />
            <PreflightStat
              icon={<ScalesIcon size={11} />}
              label="Tokens"
              value={`${estimate.estimatedKTokens.low}-${estimate.estimatedKTokens.high}k`}
            />
            <PreflightStat
              icon={<ZapIcon size={11} />}
              label="API cost"
              value={`$${estimate.estimatedCostUSD.low.toFixed(2)}-$${estimate.estimatedCostUSD.high.toFixed(2)}`}
              accent
            />
          </div>
        )}

        {/* Generate button */}
        <div className="flex items-center gap-2">
          <button
            onClick={loading ? () => abortController?.abort() : requestBuild}
            disabled={!loading && !query.trim()}
            className={loading ? "btn-danger" : "btn-primary"}
          >
            {loading ? (
              "Stop"
            ) : (
              <>
                <SparkleIcon size={13} />
                Build {argumentType.toUpperCase()}
              </>
            )}
          </button>
          {loading && (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {elapsedSec}s elapsed · safe to leave the page
            </span>
          )}
        </div>

        {error && (
          <div className="surface px-3 py-2.5 border-l-2 border-[var(--accent-red)] text-[12.5px] text-red-300 anim-slide-up">
            <strong className="text-red-200">Error: </strong>
            {error}
          </div>
        )}

        {/* Live progress */}
        {loading && plan && (
          <div className="surface-elev overflow-hidden anim-slide-up">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold truncate">
                    {plan.title}
                  </h2>
                  <p className="text-[11.5px] text-[var(--text-tertiary)] mt-0.5 line-clamp-2">
                    {plan.file_notes || plan.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10.5px] text-[var(--text-faint)]">
                    Components done
                  </div>
                  <div className="text-[18px] font-bold text-white font-mono">
                    {completedIndices.size}
                    <span className="text-[var(--text-tertiary)]">
                      /{plan.total_components}
                    </span>
                  </div>
                </div>
              </div>
              <div className="progress-bar mt-2">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${
                      plan.total_components > 0
                        ? (completedIndices.size / plan.total_components) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
              {(() => {
                const flatComps: Array<
                  ComponentPlan & { globalIndex: number; sectionHeader?: string }
                > = [];
                if (plan.sections) {
                  let idx = 0;
                  for (const s of plan.sections) {
                    for (const comp of s.components || []) {
                      flatComps.push({
                        ...comp,
                        globalIndex: idx,
                        sectionHeader: s.section_header,
                      });
                      idx++;
                    }
                  }
                } else if (plan.components) {
                  plan.components.forEach((comp, idx) =>
                    flatComps.push({ ...comp, globalIndex: idx })
                  );
                }
                let lastSection = "";
                return flatComps.map((comp) => {
                  const idx = comp.globalIndex;
                  const showSectionHeader =
                    comp.sectionHeader && comp.sectionHeader !== lastSection;
                  if (comp.sectionHeader) lastSection = comp.sectionHeader;
                  const isCompleted = completedIndices.has(idx);
                  const isError = errorIndices.has(idx);
                  const isActive =
                    progress?.index === idx && !isCompleted && !isError;
                  return (
                    <div key={idx}>
                      {showSectionHeader && (
                        <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider font-semibold mt-3 mb-1 px-3">
                          {comp.sectionHeader}
                        </div>
                      )}
                      <div
                        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12px] transition-all ${
                          isCompleted
                            ? "text-green-400 bg-green-950/10"
                            : isError
                            ? "text-red-400 bg-red-950/10"
                            : isActive
                            ? "text-white bg-[var(--bg-elev-2)]"
                            : "text-[var(--text-faint)]"
                        }`}
                      >
                        {isCompleted ? (
                          <span className="text-[var(--accent-green)] shrink-0">✓</span>
                        ) : isError ? (
                          <span className="text-[var(--accent-red)] shrink-0">✕</span>
                        ) : isActive ? (
                          <span className="spinner" style={{ width: 11, height: 11 }} />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full border border-[var(--border-strong)] shrink-0" />
                        )}
                        <span className="truncate">
                          <span
                            className={`badge mr-1.5 ${
                              comp.type === "card"
                                ? "badge-blue"
                                : comp.type === "plan_text" ||
                                  comp.type === "interp_text"
                                ? "badge-amber"
                                : "badge-neutral"
                            }`}
                          >
                            {comp.type === "card"
                              ? "Card"
                              : comp.type === "plan_text"
                              ? "Plan"
                              : comp.type === "interp_text"
                              ? "Interp"
                              : "Analytic"}
                          </span>
                          {comp.label}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            {progress && (
              <div className="px-4 py-2 border-t border-[var(--border-subtle)] flex items-center gap-2 text-[11.5px] text-[var(--text-tertiary)]">
                {getStepIcon(progress.icon)}
                <span>{progress.label}</span>
              </div>
            )}
          </div>
        )}

        {/* Planning state */}
        {loading && !plan && (
          <div className="surface px-4 py-5 flex items-center gap-3 anim-fade-in">
            <span className="spinner" />
            <div className="text-[12.5px]">
              <span className="text-[var(--text-secondary)]">
                {progress?.label || "Planning camp file structure..."}
              </span>
              <span className="text-[var(--text-faint)] ml-2">
                Safe to leave — building continues server-side.
              </span>
            </div>
          </div>
        )}

        {/* Results */}
        {(components.length > 0 || done) && (
          <div ref={resultsRef} className="space-y-3 pt-2">
            {plan && (
              <div className="surface-elev p-4 anim-fade-in">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold">{plan.title}</h2>
                    <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                      {plan.file_notes || plan.description}
                    </p>
                  </div>
                  {done && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={copyCompleteArgument}
                        className={copied ? "btn-secondary" : "btn-primary"}
                      >
                        {copied ? "✓ Copied" : "Copy file"}
                      </button>
                    </div>
                  )}
                </div>
                {plan.strategy_overview && (
                  <div className="mt-3 surface p-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1">
                      Strategy
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                      {plan.strategy_overview}
                    </p>
                  </div>
                )}

                {/* Quality scorecard */}
                {done && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                    <QualityStat label="Real cards" value={qualityStats.realCount} />
                    <QualityStat
                      label="Analytics"
                      value={qualityStats.analyticCount}
                    />
                    <QualityStat
                      label="Failed"
                      value={qualityStats.fallbackCount}
                      tone={qualityStats.fallbackCount > 0 ? "warn" : "good"}
                    />
                    <QualityStat
                      label="Avg ev words"
                      value={qualityStats.avgWordsPerCard}
                    />
                    <QualityStat
                      label="Total ev"
                      value={qualityStats.totalEvidenceWords}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Components */}
            {(() => {
              const sorted = [...components].sort((a, b) => a.index - b.index);
              let lastSection = "";
              return sorted.map((comp) => {
                const showSection =
                  comp.sectionHeader && comp.sectionHeader !== lastSection;
                if (comp.sectionHeader) lastSection = comp.sectionHeader;
                return (
                  <div key={comp.index}>
                    {showSection && (
                      <div className="mt-5 mb-2 pb-2 border-b border-[var(--border-subtle)]">
                        <h3 className="text-[12px] font-semibold text-white uppercase tracking-wider">
                          {comp.sectionHeader}
                        </h3>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`badge ${
                          comp.type === "card"
                            ? "badge-blue"
                            : comp.type === "plan_text" ||
                              comp.type === "interp_text"
                            ? "badge-amber"
                            : "badge-neutral"
                        }`}
                      >
                        {comp.type === "card"
                          ? "Card"
                          : comp.type === "plan_text"
                          ? "Plan"
                          : comp.type === "interp_text"
                          ? "Interp"
                          : "Analytic"}
                      </span>
                      <span className="text-[11px] text-[var(--text-faint)]">
                        {comp.label}
                      </span>
                      {comp.fallback && (
                        <span className="badge badge-amber">⚠ Manual</span>
                      )}
                    </div>

                    {comp.type === "card" && comp.tag ? (
                      <CardDisplay
                        id={comp.id || ""}
                        tag={comp.tag}
                        cite={comp.cite || ""}
                        citeAuthor={comp.cite_author}
                        evidenceHtml={comp.evidence_html || ""}
                        authorName={userName || "Anonymous"}
                        onIterate={
                          comp.id
                            ? (instruction) => handleIterate(comp.id!, instruction)
                            : undefined
                        }
                        isLoading={iteratingId === comp.id}
                      />
                    ) : (
                      <div className="surface overflow-hidden">
                        <div className="px-4 py-3">
                          {editingContent[comp.index] !== undefined ? (
                            <textarea
                              value={
                                editingContent[comp.index] ?? comp.content ?? ""
                              }
                              onChange={(e) =>
                                handleEditContent(comp.index, e.target.value)
                              }
                              className="textarea"
                              style={{ fontFamily: "Georgia, serif" }}
                            />
                          ) : (
                            <div
                              className={`text-[13px] leading-relaxed ${
                                comp.type === "plan_text" ||
                                comp.type === "interp_text"
                                  ? "font-semibold text-white"
                                  : "text-[var(--text-secondary)]"
                              }`}
                              style={{ fontFamily: "Georgia, serif" }}
                            >
                              {comp.content}
                            </div>
                          )}
                        </div>
                        <div className="px-4 py-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                          <span className="text-[10px] text-[var(--text-faint)]">
                            {comp.purpose}
                          </span>
                          <button
                            onClick={() => {
                              if (editingContent[comp.index] !== undefined) {
                                const newEditing = { ...editingContent };
                                delete newEditing[comp.index];
                                setEditingContent(newEditing);
                              } else {
                                setEditingContent((prev) => ({
                                  ...prev,
                                  [comp.index]: comp.content || "",
                                }));
                              }
                            }}
                            className="text-[11px] text-[var(--text-faint)] hover:text-white transition-colors"
                          >
                            {editingContent[comp.index] !== undefined
                              ? "Save"
                              : "Edit"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}

            {done && (
              <div className="surface px-4 py-3 text-[12px] text-[var(--text-tertiary)]">
                Generated {qualityStats.cardCount} cards and{" "}
                {qualityStats.analyticCount} analytics in {elapsedSec}s.
                {qualityStats.fallbackCount > 0 && (
                  <span className="text-[var(--accent-amber)]">
                    {" "}
                    {qualityStats.fallbackCount} components fell back to manual
                    placeholders (sources unavailable or failed integrity).
                  </span>
                )}{" "}
                All real cards are saved to your library.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cost warning modal */}
      <CostWarning
        open={costWarningOpen}
        onClose={() => setCostWarningOpen(false)}
        onConfirm={generateArgument}
        estimate={estimate}
        argType={argumentType}
        description={query}
      />
    </>
  );
}

function PreflightStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 text-[10px] text-[var(--text-faint)] uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div
        className="text-[14px] font-mono font-bold"
        style={{ color: accent ? "var(--accent-amber)" : "white" }}
      >
        {value}
      </div>
    </div>
  );
}

function QualityStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "good" | "warn" | "neutral";
}) {
  const color =
    tone === "good"
      ? "var(--accent-green)"
      : tone === "warn"
      ? "var(--accent-amber)"
      : "white";
  return (
    <div className="surface p-2.5">
      <div className="text-[10px] text-[var(--text-faint)] uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div
        className="text-[18px] font-bold font-mono"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}
