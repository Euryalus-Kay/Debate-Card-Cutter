"use client";

import { useState, useEffect, useRef } from "react";
import { useApp } from "@/components/AppShell";
import CardDisplay from "@/components/CardDisplay";

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
  // card fields
  id?: string;
  tag?: string;
  cite?: string;
  cite_author?: string;
  evidence_html?: string;
  // analytic/plan/interp fields
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

const ARGUMENT_TYPES: { value: ArgumentType; label: string; desc: string; color: string }[] = [
  { value: "aff", label: "Affirmative Case", desc: "1AC with inherency, plan, advantages, solvency", color: "text-blue-400 border-blue-500/30 bg-blue-950/20" },
  { value: "da", label: "Disadvantage", desc: "Uniqueness, link, internal link, impact", color: "text-red-400 border-red-500/30 bg-red-950/20" },
  { value: "cp", label: "Counterplan", desc: "CP text, solvency, net benefit, competition", color: "text-green-400 border-green-500/30 bg-green-950/20" },
  { value: "k", label: "Kritik", desc: "Link, impact, alternative, framework", color: "text-purple-400 border-purple-500/30 bg-purple-950/20" },
  { value: "t", label: "Topicality", desc: "Interpretation, violation, standards, voters", color: "text-yellow-400 border-yellow-500/30 bg-yellow-950/20" },
  { value: "theory", label: "Theory", desc: "Interpretation, violation, standards, voters", color: "text-orange-400 border-orange-500/30 bg-orange-950/20" },
  { value: "custom", label: "Custom", desc: "Describe your argument — AI determines structure", color: "text-[#999] border-[#333] bg-[#111]" },
];

function getIcon(icon?: string) {
  switch (icon) {
    case "brain":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "search":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case "download":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      );
    case "sparkle":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      );
    case "pen":
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    default:
      return (
        <div className="animate-spin w-4 h-4 border-2 border-[#333] border-t-white rounded-full" />
      );
  }
}

// Convert the whole argument to Google Docs HTML
function argumentToGoogleDocsHtml(
  plan: ArgumentPlan,
  components: GeneratedComponent[]
): string {
  let html = "";

  // Title
  html += `<p style="font-family:Georgia,serif;font-size:16px;font-weight:bold;margin:0 0 4px 0;text-align:center;">${plan.title}</p>`;
  html += `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 12px 0;text-align:center;color:#666;">${plan.description}</p>`;

  for (const comp of components) {
    // Section label
    html += `<p style="font-family:Georgia,serif;font-size:13px;font-weight:bold;margin:16px 0 4px 0;text-decoration:underline;">${comp.label}</p>`;

    if (comp.type === "plan_text" || comp.type === "interp_text") {
      html += `<p style="font-family:Georgia,serif;font-size:12px;font-weight:bold;margin:0 0 8px 0;">${comp.content || ""}</p>`;
    } else if (comp.type === "analytic") {
      html += `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 8px 0;"><b>${comp.content || ""}</b></p>`;
    } else if (comp.type === "card" && comp.tag) {
      // Tag
      html += `<p style="font-family:Georgia,serif;font-size:13px;font-weight:bold;margin:0 0 4px 0;">${comp.tag}</p>`;

      // Citation
      let citeHtml = comp.cite || "";
      if (comp.cite_author && citeHtml.includes(comp.cite_author)) {
        const idx = citeHtml.indexOf(comp.cite_author);
        citeHtml =
          citeHtml.substring(0, idx) +
          `<b><u>${comp.cite_author}</u></b>` +
          citeHtml.substring(idx + comp.cite_author.length);
      }
      html += `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 4px 0;">${citeHtml}</p>`;

      // Evidence
      if (comp.evidence_html) {
        const evidence = comp.evidence_html
          .replace(/<mark>/g, '</span><b><u><span style="font-family:Georgia,serif;font-size:11px;">')
          .replace(/<\/mark>/g, '</span></u></b><span style="font-family:Georgia,serif;font-size:8px;color:#666;">');
        html += `<p style="font-family:Georgia,serif;font-size:8px;color:#666;margin:0 0 12px 0;line-height:1.4;"><span style="font-family:Georgia,serif;font-size:8px;color:#666;">${evidence}</span></p>`;
      }
    }
  }

  return html;
}

export default function ArgumentPage() {
  const { userName } = useApp();
  const [argumentType, setArgumentType] = useState<ArgumentType>("da");
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
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
  const [activeBuilds, setActiveBuilds] = useState<Array<{
    id: string; title: string; status: string; total_components: number;
    completed_components: number; failed_components: number; current_label: string;
    argument_id: string | null; created_at: string;
  }>>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

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

  // Poll active builds
  useEffect(() => {
    if (!userName) return;
    const fetchBuilds = () => {
      fetch(`/api/build-jobs?user=${encodeURIComponent(userName)}`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setActiveBuilds(data); })
        .catch(() => {});
    };
    fetchBuilds();
    const interval = setInterval(fetchBuilds, 4000);
    return () => clearInterval(interval);
  }, [userName]);

  const componentCountRef = useRef(0);

  const generateArgument = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setPlan(null);
    setComponents([]);
    setCompletedIndices(new Set());
    setErrorIndices(new Set());
    setDone(false);
    setProgress(null);
    componentCountRef.current = 0;

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
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Argument generation failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let receivedDone = false;

      try {
        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE messages are separated by double newlines
          const messages = buffer.split("\n\n");
          buffer = messages.pop() || "";

          for (const message of messages) {
            if (!message.trim()) continue;
            const lines = message.split("\n");
            let eventType = "message";
            let dataStr = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                dataStr = line.slice(6);
              }
            }

            if (dataStr) {
              try {
                const data = JSON.parse(dataStr);
                if (eventType === "done") receivedDone = true;
                handleSSEEvent(eventType, data);
              } catch {
                // skip malformed JSON
              }
            }
          }
        }
      } catch {
        // Stream interrupted — if we already got components, that's fine
      }

      // If stream ended without explicit done event but we have components, mark as done
      if (!receivedDone && componentCountRef.current > 0) {
        setDone(true);
        setProgress(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped — keep any components already generated
        if (componentCountRef.current > 0) {
          setDone(true);
        }
        setProgress(null);
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
      }
    } catch (err) {
      console.error("Iterate failed:", err);
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
      const plainParts: string[] = [];
      plainParts.push(plan.title);
      plainParts.push(plan.file_notes || plan.description || '');
      plainParts.push("");
      for (const comp of components) {
        plainParts.push(`--- ${comp.label} ---`);
        if (comp.type === "card" && comp.tag) {
          plainParts.push(comp.tag);
          plainParts.push(comp.cite || "");
          plainParts.push(
            (comp.evidence_html || "").replace(/<[^>]*>/g, "")
          );
        } else {
          plainParts.push(comp.content || "");
        }
        plainParts.push("");
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainParts.join("\n")], {
            type: "text/plain",
          }),
        }),
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const selectedTypeInfo = ARGUMENT_TYPES.find((t) => t.value === argumentType);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Build Argument</h1>
        <p className="text-[13px] text-[#444] mt-1">
          AI plans and generates a complete, tournament-ready argument block with
          cards, analytics, and strategy.
        </p>
      </div>

      {/* Active/recent builds */}
      {activeBuilds.filter(b => b.status === 'building').length > 0 && (
        <div className="space-y-2 mb-5">
          {activeBuilds.filter(b => b.status === 'building').map(build => (
            <div key={build.id} className="px-4 py-3 bg-blue-950/30 border border-blue-500/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="animate-spin w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full" />
                  <span className="text-[13px] font-medium text-blue-300">{build.title}</span>
                </div>
                <span className="text-[11px] text-blue-400/70">
                  Building in background
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-blue-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: build.total_components > 0 ? `${(build.completed_components / build.total_components) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-[11px] text-blue-400">
                  {build.completed_components}/{build.total_components} cards
                </span>
              </div>
              <p className="text-[11px] text-blue-400/60 mt-1">
                {build.current_label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Recently completed builds */}
      {activeBuilds.filter(b => b.status === 'done' && Date.now() - new Date(b.created_at).getTime() < 300000).length > 0 && !loading && !done && (
        <div className="space-y-2 mb-5">
          {activeBuilds.filter(b => b.status === 'done' && Date.now() - new Date(b.created_at).getTime() < 300000).map(build => (
            <div key={build.id} className="px-4 py-2.5 bg-green-950/30 border border-green-500/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[13px] text-green-300">{build.title}</span>
                <span className="text-[11px] text-green-500/60">
                  {build.completed_components} cards · {build.failed_components > 0 ? `${build.failed_components} failed` : 'all succeeded'}
                </span>
              </div>
              {build.argument_id && (
                <a href={`/library`} className="text-[11px] text-green-400 hover:text-green-300">
                  View in Library →
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-5">
        {/* Argument type selector */}
        <div>
          <label className="text-[13px] text-[#666] mb-2 block">
            Argument Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ARGUMENT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setArgumentType(t.value)}
                disabled={loading}
                className={`text-left p-3 rounded-lg border transition-all ${
                  argumentType === t.value
                    ? t.color
                    : "border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333] text-[#888]"
                }`}
              >
                <div className="text-[13px] font-semibold">{t.label}</div>
                <div className="text-[10px] mt-0.5 opacity-70 leading-tight">
                  {t.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Context */}
        <div>
          <label className="text-[13px] text-[#666] mb-1.5 block">
            Topic / Context
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g., Resolved: The United States federal government should substantially increase..."
            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors min-h-[50px] resize-y"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-[13px] text-[#666] mb-1.5 block">
            Describe your argument
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              argumentType === "da"
                ? 'e.g., "A spending DA that links to any plan that costs money — the economy is on the brink"'
                : argumentType === "aff"
                ? 'e.g., "An aff case about federal investment in quantum computing research for national security"'
                : argumentType === "cp"
                ? 'e.g., "A states counterplan where 50 states implement the plan individually instead of the federal government"'
                : argumentType === "k"
                ? 'e.g., "A capitalism kritik arguing the plan reinforces neoliberal market logics"'
                : argumentType === "t"
                ? 'e.g., "Topicality — substantially means at least 50% increase, aff doesn\'t meet"'
                : argumentType === "theory"
                ? 'e.g., "Conditionality bad — neg shouldn\'t be allowed to run conditional advocacies"'
                : 'e.g., "Build an argument block about..."'
            }
            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors min-h-[80px] resize-y"
          />
        </div>

        {/* Generate button */}
        <button
          onClick={loading ? () => abortController?.abort() : generateArgument}
          disabled={!loading && !query.trim()}
          className={`px-5 py-2.5 text-[13px] font-medium rounded-lg transition-colors ${
            loading
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-white text-black hover:bg-[#e5e5e5] disabled:opacity-30"
          }`}
        >
          {loading ? "Stop" : `Build ${selectedTypeInfo?.label || "Argument"}`}
        </button>

        {error && (
          <div className="px-3 py-2.5 bg-red-950/50 border border-red-900/50 rounded-lg text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* Progress tracker */}
        {loading && plan && (
          <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1a1a1a]">
              <h2 className="text-[14px] font-semibold">{plan.title}</h2>
              <p className="text-[12px] text-[#666] mt-0.5">
                {plan.file_notes || plan.description}
              </p>
            </div>
            <div className="p-3 space-y-1.5">
              {(() => {
                // Flatten sections into a flat component list with global indices
                const flatComps: Array<ComponentPlan & { globalIndex: number; sectionHeader?: string }> = [];
                if (plan.sections) {
                  let idx = 0;
                  for (const s of plan.sections) {
                    for (const comp of (s.components || [])) {
                      flatComps.push({ ...comp, globalIndex: idx, sectionHeader: s.section_header });
                      idx++;
                    }
                  }
                } else if (plan.components) {
                  plan.components.forEach((comp, idx) => flatComps.push({ ...comp, globalIndex: idx }));
                }

                let lastSection = '';
                return flatComps.map((comp) => {
                const idx = comp.globalIndex;
                const showSectionHeader = comp.sectionHeader && comp.sectionHeader !== lastSection;
                if (comp.sectionHeader) lastSection = comp.sectionHeader;
                const isCompleted = completedIndices.has(idx);
                const isError = errorIndices.has(idx);
                const isActive =
                  progress?.index === idx && !isCompleted && !isError;
                return (
                  <div key={idx}>
                  {showSectionHeader && (
                    <div className="text-[10px] text-[#555] uppercase tracking-wider font-semibold mt-3 mb-1 px-3">{comp.sectionHeader}</div>
                  )}
                  <div
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[12px] transition-all ${
                      isCompleted
                        ? "text-green-400 bg-green-950/10"
                        : isError
                        ? "text-red-400 bg-red-950/10"
                        : isActive
                        ? "text-white bg-[#111]"
                        : "text-[#444]"
                    }`}
                  >
                    {isCompleted ? (
                      <svg
                        className="w-3.5 h-3.5 text-green-400 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : isError ? (
                      <svg
                        className="w-3.5 h-3.5 text-red-400 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    ) : isActive ? (
                      <div className="animate-spin w-3.5 h-3.5 border-2 border-[#333] border-t-white rounded-full shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-[#333] shrink-0" />
                    )}
                    <span className="truncate">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-1.5 ${
                          comp.type === "card"
                            ? "bg-blue-900/30 text-blue-400"
                            : comp.type === "plan_text" ||
                              comp.type === "interp_text"
                            ? "bg-yellow-900/30 text-yellow-400"
                            : "bg-[#1a1a1a] text-[#888]"
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
              <div className="px-4 py-2.5 border-t border-[#1a1a1a] flex items-center gap-2.5 text-[12px] text-[#999]">
                {getIcon(progress.icon)}
                <span>{progress.label}</span>
              </div>
            )}
          </div>
        )}

        {/* Planning state (before plan arrives) */}
        {loading && !plan && (
          <div className="flex items-center gap-3 px-4 py-5 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a]">
            {getIcon("brain")}
            <div className="text-[13px]">
              <span className="text-[#999]">
                {progress?.label || "Planning argument structure..."}
              </span>
              <span className="text-[#444] ml-2">You can leave this page — building continues in background</span>
            </div>
          </div>
        )}

        {/* Results */}
        {(components.length > 0 || done) && (
          <div ref={resultsRef} className="space-y-4 pt-2">
            {/* Header with actions */}
            {plan && (
              <div className="px-4 py-3 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[15px] font-semibold">{plan.title}</h2>
                    <p className="text-[12px] text-[#666] mt-0.5">
                      {plan.file_notes || plan.description}
                    </p>
                  </div>
                  {done && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={copyCompleteArgument}
                        className={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
                          copied
                            ? "bg-green-900/30 text-green-400"
                            : "bg-[#1a1a1a] text-[#ccc] hover:bg-[#222]"
                        }`}
                      >
                        {copied
                          ? "Copied!"
                          : "Copy Complete Argument"}
                      </button>
                      <button
                        onClick={copyCompleteArgument}
                        className="px-3 py-1.5 text-[12px] bg-[#1a1a1a] text-[#ccc] hover:bg-[#222] rounded-md transition-colors"
                      >
                        Export as Doc
                      </button>
                    </div>
                  )}
                </div>
                {plan.strategy_overview && (
                  <div className="mt-3 px-3 py-2 bg-[#111] rounded-md border border-[#1a1a1a]">
                    <div className="text-[10px] text-[#555] uppercase tracking-wider mb-1">
                      Strategy
                    </div>
                    <p className="text-[12px] text-[#999] leading-relaxed">
                      {plan.strategy_overview}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Generated components */}
            {(() => {
              const sorted = [...components].sort((a, b) => a.index - b.index);
              let lastSection = '';
              return sorted.map((comp) => {
                const showSection = comp.sectionHeader && comp.sectionHeader !== lastSection;
                if (comp.sectionHeader) lastSection = comp.sectionHeader;
                return (
                <div key={comp.index}>
                  {/* Section header */}
                  {showSection && (
                    <div className="mt-6 mb-3 pb-2 border-b border-[#1a1a1a]">
                      <h3 className="text-[13px] font-semibold text-[#ccc] uppercase tracking-wider">{comp.sectionHeader}</h3>
                    </div>
                  )}
                  {/* Component label */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                        comp.type === "card"
                          ? "bg-blue-900/30 text-blue-400"
                          : comp.type === "plan_text" ||
                            comp.type === "interp_text"
                          ? "bg-yellow-900/30 text-yellow-400"
                          : "bg-[#1a1a1a] text-[#888]"
                      }`}
                    >
                      {comp.type === "card"
                        ? "Card"
                        : comp.type === "plan_text"
                        ? "Plan Text"
                        : comp.type === "interp_text"
                        ? "Interpretation"
                        : "Analytic"}
                    </span>
                    <span className="text-[11px] text-[#555]">
                      {comp.label}
                    </span>
                  </div>

                  {/* Render by type */}
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
                          ? (instruction) =>
                              handleIterate(comp.id!, instruction)
                          : undefined
                      }
                      isLoading={iteratingId === comp.id}
                    />
                  ) : (
                    <div className="border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] overflow-hidden">
                      <div className="px-4 py-3">
                        {editingContent[comp.index] !== undefined ? (
                          <textarea
                            value={
                              editingContent[comp.index] ?? comp.content ?? ""
                            }
                            onChange={(e) =>
                              handleEditContent(comp.index, e.target.value)
                            }
                            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white focus:outline-none focus:border-[#333] transition-colors min-h-[80px] resize-y"
                            style={{ fontFamily: "Georgia, serif" }}
                          />
                        ) : (
                          <div
                            className={`text-[13px] leading-relaxed ${
                              comp.type === "plan_text" ||
                              comp.type === "interp_text"
                                ? "font-semibold text-white"
                                : "text-[#ccc]"
                            }`}
                            style={{ fontFamily: "Georgia, serif" }}
                          >
                            {comp.content}
                          </div>
                        )}
                      </div>
                      <div className="px-4 py-2 border-t border-[#1a1a1a] flex items-center justify-between">
                        <span className="text-[10px] text-[#444]">
                          {comp.purpose}
                        </span>
                        <button
                          onClick={() => {
                            if (editingContent[comp.index] !== undefined) {
                              // Save: remove from editing state
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
                          className="text-[11px] text-[#555] hover:text-white transition-colors"
                        >
                          {editingContent[comp.index] !== undefined
                            ? "Save"
                            : "Edit"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );});
            })()}

            {/* Summary when done */}
            {done && (
              <div className="px-4 py-3 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a] text-[12px] text-[#666]">
                Generated {components.filter((c) => c.type === "card").length}{" "}
                cards and{" "}
                {components.filter((c) => c.type !== "card").length}{" "}
                analytics/texts. All cards have been added to your library.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
