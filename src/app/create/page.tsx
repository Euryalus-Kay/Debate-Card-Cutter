"use client";

import { useState, useEffect, useRef } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import CardDisplay from "@/components/CardDisplay";
import ProgressTracker from "@/components/ProgressTracker";
import { consumeSSE } from "@/lib/sse-client";
import { ScissorsIcon, SparkleIcon, ZapIcon, BrainIcon } from "@/components/ui/icons";

interface GeneratedCard {
  id: string;
  tag: string;
  cite: string;
  cite_author: string;
  evidence_html: string;
  author_name: string;
}

interface ProgressStep {
  step: number;
  total: number;
  label: string;
  icon: string;
}

const QUERY_TEMPLATES = [
  {
    label: "Uniqueness",
    prefix:
      "Status quo trends prove that ",
    placeholder: "[X] is happening / not happening now — empirical examples and recent reporting prove the trajectory.",
  },
  {
    label: "Link",
    prefix: "The plan triggers ",
    placeholder: "[X] disadvantage because [mechanism] — find a card that specifies the causal pathway.",
  },
  {
    label: "Impact",
    prefix: "[X] causes ",
    placeholder: "[terminal impact: war, recession, structural violence, etc.] — find a card with a vivid scenario or hard data.",
  },
  {
    label: "Solvency",
    prefix: "The plan solves ",
    placeholder: "[X] because [mechanism] — empirical examples preferred (3-5 historical analogs).",
  },
  {
    label: "Turn",
    prefix: "The plan actually solves their disadvantage because ",
    placeholder: "[counterintuitive mechanism] — find a card explaining why the conventional link is wrong.",
  },
];

export default function CreatePage() {
  const { userName } = useApp();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [savedContext, setSavedContext] = useState("");
  const [contextLoading, setContextLoading] = useState(true);
  const [contextSaving, setContextSaving] = useState(false);
  const [contextSaveError, setContextSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [rapid, setRapid] = useState(false);
  const [progress, setProgress] = useState<ProgressStep | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autosaveDirty, setAutosaveDirty] = useState(false);
  const queryRef = useRef<HTMLTextAreaElement>(null);

  // Load context with hard error handling — the bug we fixed lived here.
  useEffect(() => {
    if (!userName) {
      setContextLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/context?user=${encodeURIComponent(userName)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Context fetch ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const ctx = String(data?.context || "");
        setSavedContext(ctx);
        setContext(ctx);
      })
      .catch((err) => {
        console.warn("Context load failed:", err);
        // Failing context load should NEVER break the page.
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userName]);

  // Debounced autosave for context
  useEffect(() => {
    if (!userName) return;
    if (context === savedContext) {
      setAutosaveDirty(false);
      return;
    }
    setAutosaveDirty(true);
    const handle = setTimeout(async () => {
      setContextSaving(true);
      setContextSaveError(null);
      try {
        const res = await fetch("/api/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userName, context }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Save failed (${res.status})`);
        }
        setSavedContext(context);
        setAutosaveDirty(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save";
        setContextSaveError(msg);
      } finally {
        setContextSaving(false);
      }
    }, 800);
    return () => clearTimeout(handle);
  }, [context, savedContext, userName]);

  const generateCard = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setCard(null);
    setProgress(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          context,
          authorName: userName || "Anonymous",
          rapid,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Generation failed (${res.status})`);
      }

      await consumeSSE(
        res,
        (event, data) => {
          if (event === "progress") {
            setProgress(data as ProgressStep);
          } else if (event === "done") {
            setCard(data as GeneratedCard);
            setProgress(null);
          } else if (event === "error") {
            const message = (data as { message?: string })?.message || "Generation error";
            setError(message);
            toast.error("Card generation failed", message);
          }
        },
        { signal: controller.signal }
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setProgress(null);
        toast.info("Stopped");
      } else {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setError(message);
        toast.error("Card generation failed", message);
      }
    } finally {
      setLoading(false);
      setAbortController(null);
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
      if (data.tag && data.evidence_html && card) {
        setCard({ ...card, tag: data.tag, evidence_html: data.evidence_html });
        toast.success("Card updated");
      } else if (data.error) {
        toast.error("Iterate failed", data.error);
      }
    } catch (err) {
      toast.error("Iterate failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIteratingId(null);
    }
  };

  const handleEvaluate = async () => {
    if (!card) return;
    toast.info("Evaluating card quality...");
    try {
      const res = await fetch("/api/eval-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: card.tag,
          citation: card.cite,
          evidence: card.evidence_html,
          query,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Evaluation failed", data.error);
        return;
      }
      const tagScore = data?.tag?.score;
      const overallScore = data?.deepEvaluation?.overall;
      toast.success(
        `Evaluation: ${overallScore || "n/a"}/100 overall · tag ${tagScore}/100`,
        data?.deepEvaluation?.notes?.[0] || ""
      );
    } catch (err) {
      toast.error("Evaluation failed", err instanceof Error ? err.message : "");
    }
  };

  const insertTemplate = (prefix: string) => {
    const cur = queryRef.current?.value || "";
    setQuery((cur ? cur + "\n\n" : "") + prefix);
    setTimeout(() => queryRef.current?.focus(), 0);
  };

  return (
    <>
      <div className="mb-6 anim-fade-in">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
              <ScissorsIcon size={18} className="text-[var(--accent-blue)]" />
              Cut a card
            </h1>
            <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1">
              Tell me what the card should argue. I&apos;ll search the web, pick the
              strongest source, and cut it tournament-ready.
            </p>
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[11px] text-[var(--text-tertiary)] hover:text-white"
          >
            {showAdvanced ? "Hide" : "Show"} advanced
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Context */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-[12px] text-[var(--text-tertiary)] flex items-center gap-2">
              Topic / debate context
              {contextSaving && (
                <span className="text-[10px] text-[var(--accent-blue)] anim-pulse-soft">
                  saving...
                </span>
              )}
              {!contextSaving && autosaveDirty && (
                <span className="text-[10px] text-[var(--accent-amber)]">
                  unsaved
                </span>
              )}
              {!contextSaving && !autosaveDirty && context && context === savedContext && (
                <span className="text-[10px] text-[var(--accent-green)]">
                  saved
                </span>
              )}
            </label>
            {contextSaveError && (
              <span className="text-[10px] text-[var(--accent-red)]">
                {contextSaveError}
              </span>
            )}
          </div>
          {contextLoading ? (
            <div className="surface shimmer" style={{ height: "70px" }} />
          ) : (
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g., Running a copyright reform aff on the 2024-25 IPR topic. Strong on AI training data, weaker on patent reform."
              className="textarea"
              rows={3}
            />
          )}
        </div>

        {/* Query */}
        <div>
          <label className="text-[12px] text-[var(--text-tertiary)] mb-1.5 block">
            What should this card argue?
          </label>
          <textarea
            ref={queryRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., Licensing fails — there is no entity that can administer licenses at the scale required for AI training data."
            className="textarea"
            rows={5}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                generateCard();
              }
            }}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {QUERY_TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => insertTemplate(t.prefix)}
                className="text-[10.5px] px-2 py-1 rounded-md border border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white hover:border-[var(--border-strong)] transition-colors"
                title={t.placeholder}
              >
                + {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate */}
        <div className="flex items-center gap-3 flex-wrap">
          {loading ? (
            <button onClick={() => abortController?.abort()} className="btn-danger">
              Stop
            </button>
          ) : (
            <button
              onClick={generateCard}
              disabled={!query.trim()}
              className="btn-primary"
            >
              <SparkleIcon size={13} />
              Cut Card
            </button>
          )}
          <button
            onClick={() => setRapid(!rapid)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] rounded-md border transition-all ${
              rapid
                ? "border-[var(--accent-amber)] text-[var(--accent-amber)] bg-amber-500/5"
                : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
            }`}
          >
            <ZapIcon size={11} />
            {rapid ? "Rapid (Sonnet)" : "Standard (Opus)"}
          </button>
          <span className="text-[10.5px] text-[var(--text-faint)]">
            <kbd className="kbd">⌘</kbd> + <kbd className="kbd">↵</kbd> to generate
          </span>
        </div>

        {error && (
          <div className="px-3 py-2.5 bg-red-950/40 border border-red-900/40 rounded-md text-[12.5px] text-red-300 anim-slide-up">
            <strong className="text-red-200">Error: </strong>
            {error}
          </div>
        )}

        {/* Progress */}
        {loading && <ProgressTracker current={progress} />}

        {/* Card */}
        {card && (
          <div className="pt-2 anim-fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-[var(--accent-green)] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
                Cut & saved to library
              </span>
              <button
                onClick={handleEvaluate}
                className="text-[11px] text-[var(--text-tertiary)] hover:text-white flex items-center gap-1"
              >
                <BrainIcon size={11} /> Evaluate quality
              </button>
            </div>
            <CardDisplay
              id={card.id}
              tag={card.tag}
              cite={card.cite}
              citeAuthor={card.cite_author}
              evidenceHtml={card.evidence_html}
              authorName={card.author_name}
              onIterate={(instruction) => handleIterate(card.id, instruction)}
              isLoading={iteratingId === card.id}
            />
          </div>
        )}

        {/* Advanced panel */}
        {showAdvanced && (
          <div className="surface p-4 anim-slide-up space-y-3">
            <h3 className="text-[12.5px] font-semibold text-white">
              Advanced options
            </h3>
            <details>
              <summary className="text-[11.5px] text-[var(--text-tertiary)] cursor-pointer hover:text-white">
                What does Rapid do?
              </summary>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-2 leading-relaxed">
                Rapid uses Sonnet (faster, slightly shorter cards) instead of Opus.
                Standard mode produces longer evidence blocks with more comprehensive
                highlighting. Use Rapid for prep cards; use Standard for tournament
                cards.
              </p>
            </details>
            <details>
              <summary className="text-[11.5px] text-[var(--text-tertiary)] cursor-pointer hover:text-white">
                How does the card eval work?
              </summary>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-2 leading-relaxed">
                After cutting, click &quot;Evaluate quality&quot; to score the card on
                4 axes: author quals, recency, specificity, warrant depth. The
                evaluator is a separate Claude pass that compares against top
                circuit-level evidence on the same topic.
              </p>
            </details>
          </div>
        )}
      </div>
    </>
  );
}
