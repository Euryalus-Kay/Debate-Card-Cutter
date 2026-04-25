"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import CardDisplay from "@/components/CardDisplay";
import MarkdownView from "@/components/ui/MarkdownView";
import { useToast } from "@/components/ui/Toast";
import {
  evaluateTagQuality,
  estimateReadTime,
} from "@/lib/strategy-engine";
import {
  SparkleIcon,
  BrainIcon,
  ZapIcon,
  TargetIcon,
} from "@/components/ui/icons";

interface Card {
  id: string;
  tag: string;
  cite: string;
  cite_author: string;
  cite_year: string;
  cite_credentials: string;
  cite_title: string;
  cite_date: string;
  cite_url: string;
  cite_initials: string;
  evidence_html: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

interface Verification {
  citationConfirmed: boolean;
  sourceFound: string;
  alternateSources: Array<{ url: string; description: string }>;
  warnings: string[];
}

interface RelatedSource {
  url: string;
  title: string;
  excerpt: string;
  angle: "supports" | "stronger" | "alternate" | "rebuts";
}

interface DeepEvaluation {
  authorScore: number;
  recencyScore: number;
  specificityScore: number;
  warrantDepthScore: number;
  overall: number;
  notes: string[];
  comparedToTop: string;
}

const ANGLE_BADGE: Record<RelatedSource["angle"], string> = {
  supports: "badge-blue",
  stronger: "badge-green",
  alternate: "badge-amber",
  rebuts: "badge-red",
};

const ANGLE_LABEL: Record<RelatedSource["angle"], string> = {
  supports: "Supports",
  stronger: "Stronger",
  alternate: "Alternate",
  rebuts: "Rebuts",
};

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTag, setEditTag] = useState("");
  const [editEvidence, setEditEvidence] = useState("");

  // Inline tools
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [related, setRelated] = useState<RelatedSource[]>([]);
  const [explanation, setExplanation] = useState<string>("");
  const [explaining, setExplaining] = useState(false);
  const [evaluation, setEvaluation] = useState<DeepEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    fetch(`/api/cards/${id}`)
      .then((r) => r.json())
      .then((data: Card) => {
        setCard(data);
        setEditTag(data.tag);
        setEditEvidence(data.evidence_html);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

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
        setEditTag(data.tag);
        setEditEvidence(data.evidence_html);
        toast.success("Card updated");
      } else if (data.error) {
        toast.error("Iterate failed", data.error);
      }
    } catch {
      toast.error("Iterate failed");
    } finally {
      setIteratingId(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!card) return;
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: editTag, evidence_html: editEvidence }),
      });
      const data = await res.json();
      setCard({ ...card, ...data });
      setEditing(false);
      toast.success("Saved");
    } catch (err) {
      toast.error("Save failed", err instanceof Error ? err.message : "");
    }
  };

  const handleVerify = async () => {
    if (!card) return;
    setVerifying(true);
    setVerification(null);
    setRelated([]);
    try {
      const res = await fetch("/api/verify-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, includeRelated: true }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Verify failed", data.error);
      } else {
        setVerification(data.verification);
        setRelated(data.related || []);
        toast.success("Verification complete");
      }
    } catch (err) {
      toast.error(
        "Verify failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleExplain = async () => {
    if (!card) return;
    setExplaining(true);
    setExplanation("");
    try {
      const res = await fetch("/api/explain-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Explain failed", data.error);
      } else {
        setExplanation(data.explanation);
      }
    } catch (err) {
      toast.error(
        "Explain failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setExplaining(false);
    }
  };

  const handleEvaluate = async () => {
    if (!card) return;
    setEvaluating(true);
    setEvaluation(null);
    try {
      const res = await fetch("/api/eval-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: card.tag,
          citation: card.cite,
          evidence: card.evidence_html,
          query: card.tag,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Eval failed", data.error);
      } else {
        setEvaluation(data.deepEvaluation);
        toast.success(
          `Evaluation complete: ${data.deepEvaluation?.overall || "n/a"}/100`
        );
      }
    } catch {
      toast.error("Eval failed");
    } finally {
      setEvaluating(false);
    }
  };

  if (loading) {
    return (
      <div className="surface shimmer mx-auto" style={{ height: "320px" }} />
    );
  }

  if (!card) {
    return (
      <div className="text-center py-20 text-[var(--text-tertiary)] text-[13px]">
        Card not found.{" "}
        <Link href="/library" className="text-[var(--accent-blue)] hover:underline">
          Back to library
        </Link>
      </div>
    );
  }

  // Local quick metrics — no API call needed
  const tagEval = evaluateTagQuality(card.tag);
  const readTime = estimateReadTime(card.evidence_html);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/library"
          className="text-[12px] text-[var(--text-tertiary)] hover:text-white"
        >
          ← Library
        </Link>
        <button
          onClick={() => setEditing(!editing)}
          className="text-[12px] text-[var(--text-tertiary)] hover:text-white"
        >
          {editing ? "Cancel raw edit" : "Edit raw HTML"}
        </button>
      </div>

      {/* Quick stat strip */}
      <div className="grid grid-cols-4 gap-2">
        <div className="stat-tile">
          <div className="stat-tile-label">Tag score</div>
          <div
            className="stat-tile-value"
            style={{
              color:
                tagEval.score >= 75
                  ? "var(--accent-green)"
                  : tagEval.score >= 55
                  ? "var(--accent-amber)"
                  : "var(--accent-red)",
            }}
          >
            {tagEval.score}
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Read time</div>
          <div className="stat-tile-value">{readTime.seconds}s</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Highlighted</div>
          <div className="stat-tile-value">{readTime.highlightedWords}w</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Total</div>
          <div className="stat-tile-value">{readTime.totalWords}w</div>
        </div>
      </div>

      {/* Action toolbar */}
      <div className="surface p-2 flex items-center gap-2 flex-wrap">
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="btn-secondary"
        >
          {verifying ? (
            <>
              <span className="spinner" /> Verifying online...
            </>
          ) : (
            <>
              <SparkleIcon size={12} /> Verify online
            </>
          )}
        </button>
        <button
          onClick={handleEvaluate}
          disabled={evaluating}
          className="btn-secondary"
        >
          {evaluating ? (
            <>
              <span className="spinner" /> Evaluating...
            </>
          ) : (
            <>
              <ZapIcon size={12} /> Deep eval
            </>
          )}
        </button>
        <button
          onClick={handleExplain}
          disabled={explaining}
          className="btn-secondary"
        >
          {explaining ? (
            <>
              <span className="spinner" /> Explaining...
            </>
          ) : (
            <>
              <BrainIcon size={12} /> Explain (ELI5)
            </>
          )}
        </button>
      </div>

      {/* Card */}
      {editing ? (
        <div className="surface-elev p-4 space-y-4">
          <div>
            <label className="text-[12px] text-[var(--text-tertiary)] mb-1.5 block">
              Tag
            </label>
            <input
              type="text"
              value={editTag}
              onChange={(e) => setEditTag(e.target.value)}
              className="input"
            />
            {tagEval.notes.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {tagEval.notes.map((n, i) => (
                  <li
                    key={i}
                    className="text-[10.5px] text-[var(--text-tertiary)]"
                  >
                    · {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="text-[12px] text-[var(--text-tertiary)] mb-1.5 block">
              Evidence HTML{" "}
              <span className="text-[10px] text-[var(--text-faint)]">
                (&lt;mark&gt; = highlight)
              </span>
            </label>
            <textarea
              value={editEvidence}
              onChange={(e) => setEditEvidence(e.target.value)}
              className="textarea"
              style={{ fontFamily: "var(--font-mono)", minHeight: "300px" }}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveEdit} className="btn-primary">
              Save
            </button>
            <button
              onClick={() => {
                setEditTag(card.tag);
                setEditEvidence(card.evidence_html);
                setEditing(false);
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <CardDisplay
          id={card.id}
          tag={card.tag}
          cite={card.cite}
          citeAuthor={card.cite_author}
          evidenceHtml={card.evidence_html}
          authorName={card.author_name}
          createdAt={card.created_at}
          onIterate={(instruction) => handleIterate(card.id, instruction)}
          isLoading={iteratingId === card.id}
        />
      )}

      {card.cite_url && (
        <p className="text-[11px] text-[var(--text-tertiary)]">
          Source:{" "}
          <a
            href={card.cite_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-blue)] hover:underline"
          >
            {card.cite_url}
          </a>
        </p>
      )}

      {/* Verification panel */}
      {verification && (
        <div
          className={`surface-elev p-4 anim-fade-in ${
            verification.citationConfirmed
              ? "border-l-2 border-[var(--accent-green)]"
              : "border-l-2 border-[var(--accent-amber)]"
          }`}
        >
          <h2 className="text-[12.5px] font-semibold mb-2 flex items-center gap-2">
            <SparkleIcon size={13} />
            {verification.citationConfirmed
              ? "Citation confirmed"
              : "Citation could not be confirmed"}
          </h2>
          {verification.sourceFound && (
            <div className="text-[11.5px] text-[var(--text-secondary)] mb-2">
              Source located:{" "}
              <a
                href={verification.sourceFound}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-blue)] hover:underline break-all"
              >
                {verification.sourceFound}
              </a>
            </div>
          )}
          {verification.warnings.length > 0 && (
            <div className="mt-2">
              <div className="text-[10.5px] uppercase tracking-wider text-[var(--accent-amber)] mb-1">
                Warnings
              </div>
              <ul className="space-y-0.5">
                {verification.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="text-[11.5px] text-[var(--text-secondary)] flex gap-2"
                  >
                    <span className="text-[var(--accent-amber)]">⚠</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Related sources */}
      {related.length > 0 && (
        <div className="space-y-2 anim-fade-in">
          <h2 className="text-[12px] uppercase tracking-wider text-[var(--text-faint)] flex items-center gap-2">
            <TargetIcon size={11} /> Related sources ({related.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {related.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="surface surface-hover p-3 block group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`badge ${ANGLE_BADGE[r.angle]}`}>
                    {ANGLE_LABEL[r.angle]}
                  </span>
                  <span className="text-[10px] text-[var(--text-faint)] truncate ml-2">
                    {(() => {
                      try {
                        return new URL(r.url).hostname.replace(/^www\./, "");
                      } catch {
                        return r.url.slice(0, 30);
                      }
                    })()}
                  </span>
                </div>
                <h3 className="text-[12.5px] font-semibold text-white mb-1 group-hover:text-[var(--accent-blue)] line-clamp-2">
                  {r.title}
                </h3>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed line-clamp-3">
                  {r.excerpt}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Deep evaluation */}
      {evaluation && (
        <div className="surface-elev p-4 anim-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12.5px] font-semibold flex items-center gap-2">
              <ZapIcon size={13} /> Deep evaluation
            </h2>
            <span
              className="text-[24px] font-bold"
              style={{
                color:
                  evaluation.overall >= 75
                    ? "var(--accent-green)"
                    : evaluation.overall >= 55
                    ? "var(--accent-amber)"
                    : "var(--accent-red)",
              }}
            >
              {evaluation.overall}/100
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {(
              [
                ["Author", evaluation.authorScore],
                ["Recency", evaluation.recencyScore],
                ["Specificity", evaluation.specificityScore],
                ["Warrant", evaluation.warrantDepthScore],
              ] as const
            ).map(([label, val]) => (
              <div key={label} className="surface p-2.5">
                <div className="text-[10px] text-[var(--text-faint)] mb-1">
                  {label}
                </div>
                <div className="progress-bar mb-1" style={{ height: "4px" }}>
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${val}%` }}
                  />
                </div>
                <div className="text-[12px] font-mono font-bold text-white">
                  {val}
                </div>
              </div>
            ))}
          </div>
          {evaluation.notes.length > 0 && (
            <ul className="space-y-1 mb-2">
              {evaluation.notes.map((n, i) => (
                <li
                  key={i}
                  className="text-[11.5px] text-[var(--text-secondary)]"
                >
                  · {n}
                </li>
              ))}
            </ul>
          )}
          {evaluation.comparedToTop && (
            <p className="text-[11px] italic text-[var(--text-tertiary)] mt-2 border-t border-[var(--border-subtle)] pt-2">
              {evaluation.comparedToTop}
            </p>
          )}
        </div>
      )}

      {/* Explanation */}
      {explanation && (
        <div className="surface-elev p-4 anim-fade-in border-l-2 border-[var(--accent-purple)]">
          <h2 className="text-[12.5px] font-semibold mb-2 flex items-center gap-2 text-[var(--accent-purple)]">
            <BrainIcon size={13} /> Plain-language explanation
          </h2>
          <MarkdownView text={explanation} />
        </div>
      )}
    </div>
  );
}
