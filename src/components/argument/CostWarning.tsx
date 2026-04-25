"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { ZapIcon, SparkleIcon, BrainIcon } from "@/components/ui/icons";

export interface CostEstimate {
  /** Number of distinct cards we'll cut. */
  cardCount: number;
  /** Number of analytics we'll generate. */
  analyticCount: number;
  /** Number of plan/interp text blocks. */
  textBlockCount: number;
  /** Estimated wall-clock minutes from start to finish. */
  estimatedMinutes: { low: number; high: number };
  /** Approx total Anthropic input + output tokens (in thousands). */
  estimatedKTokens: { low: number; high: number };
  /** Approx Perplexity searches that will run. */
  perplexitySearches: number;
  /** USD cost estimate. */
  estimatedCostUSD: { low: number; high: number };
}

export function estimateCost(
  argType: string,
  description: string
): CostEstimate {
  // Camp-file targets per archetype (rough heuristics tuned to our planArgumentAdvanced prompts).
  const presets: Record<
    string,
    { cards: [number, number]; analytics: [number, number]; texts: number }
  > = {
    aff: { cards: [16, 24], analytics: [6, 12], texts: 1 },
    da: { cards: [16, 24], analytics: [4, 8], texts: 0 },
    cp: { cards: [14, 22], analytics: [6, 10], texts: 1 },
    k: { cards: [22, 32], analytics: [10, 18], texts: 1 },
    t: { cards: [12, 18], analytics: [8, 14], texts: 1 },
    theory: { cards: [8, 14], analytics: [10, 16], texts: 1 },
    custom: { cards: [12, 22], analytics: [6, 12], texts: 1 },
  };
  const p = presets[argType] || presets.custom;
  // The longer the user's description, the more nuance — so we lean toward
  // the upper bound of the range.
  const tilt = Math.min(1, Math.max(0, description.length / 800));
  const cards = Math.round(p.cards[0] + tilt * (p.cards[1] - p.cards[0]));
  const analytics = Math.round(
    p.analytics[0] + tilt * (p.analytics[1] - p.analytics[0])
  );
  const texts = p.texts;

  // Generation pipeline:
  //   - 1 plan call (Opus, ~12k output)
  //   - cardCount Perplexity searches (~3500 tokens each, ~$0.003 each)
  //   - cardCount source selection calls (Sonnet, ~1k each)
  //   - cardCount scrape calls (free)
  //   - cardCount card-cutting calls (Opus, ~32k output each)
  //   - analyticCount audit calls (Sonnet, ~2k each, conditional)
  // Token bands:
  const lowK = 12 + cards * 38 + analytics * 1.5;
  const highK = 14 + cards * 55 + analytics * 3;

  // Cost: Opus ~$15/M input + $75/M output. Sonnet ~$3/M + $15/M.
  // Average blended ~$45 per 1M tokens for our mix.
  const lowUSD = (lowK / 1000) * 45 + cards * 0.005;
  const highUSD = (highK / 1000) * 60 + cards * 0.005;

  // Wall-clock: planning ~25s, cards run in batches of 3 (Opus ~30s each).
  const lowMin = Math.max(2, 0.4 + (cards / 3) * 0.5);
  const highMin = Math.max(3, 0.6 + (cards / 3) * 1.0);

  return {
    cardCount: cards,
    analyticCount: analytics,
    textBlockCount: texts,
    estimatedMinutes: {
      low: Math.round(lowMin * 10) / 10,
      high: Math.round(highMin * 10) / 10,
    },
    estimatedKTokens: { low: Math.round(lowK), high: Math.round(highK) },
    perplexitySearches: cards,
    estimatedCostUSD: {
      low: Math.round(lowUSD * 100) / 100,
      high: Math.round(highUSD * 100) / 100,
    },
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  estimate: CostEstimate;
  argType: string;
  description: string;
}

const ACK_KEY = "build-argument-cost-ack-v1";

export default function CostWarning({
  open,
  onClose,
  onConfirm,
  estimate,
  argType,
  description,
}: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Auto-confirm if user previously dismissed with "don't show"
  useEffect(() => {
    if (!open) return;
    const ack = localStorage.getItem(ACK_KEY);
    if (ack === "1") {
      onConfirm();
    }
  }, [open, onConfirm]);

  const ackThenConfirm = () => {
    if (dontShowAgain) localStorage.setItem(ACK_KEY, "1");
    onConfirm();
  };

  // Severity bucket
  const sev =
    estimate.cardCount >= 25
      ? "high"
      : estimate.cardCount >= 18
      ? "med"
      : "low";

  const sevColor =
    sev === "high"
      ? "var(--accent-red)"
      : sev === "med"
      ? "var(--accent-amber)"
      : "var(--accent-green)";

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={580}
      title={
        <span className="flex items-center gap-2">
          <ZapIcon size={16} className="text-[var(--accent-amber)]" />
          Build Argument — usage preview
        </span>
      }
      description="A camp-quality file uses a lot of compute. Confirm before running."
      footer={
        <>
          <label className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1.5 mr-auto cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="accent-[var(--accent-blue)]"
            />
            Don&apos;t show this again
          </label>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={ackThenConfirm} className="btn-primary">
            <SparkleIcon size={12} /> Build it
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          className="rounded-md p-3 border"
          style={{
            borderColor: sevColor,
            background:
              sev === "high"
                ? "rgba(239,68,68,0.06)"
                : sev === "med"
                ? "rgba(245,158,11,0.06)"
                : "rgba(34,197,94,0.06)",
          }}
        >
          <div className="flex items-center gap-2 mb-1" style={{ color: sevColor }}>
            <BrainIcon size={13} />
            <span className="text-[12.5px] font-semibold">
              {sev === "high"
                ? "Heavy run"
                : sev === "med"
                ? "Moderate run"
                : "Light run"}
            </span>
          </div>
          <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
            {sev === "high"
              ? "This will produce a full camp file. Use only when prepping a major file (TOC, NSDA Nationals). Wait for it to finish in another tab."
              : sev === "med"
              ? "Standard tournament file. ~3-6 minutes to generate. Worth it for your A-strat positions."
              : "Lightweight file — quick prep. Safe to run."}
          </p>
        </div>

        {/* Estimate grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <Stat label="Cards" value={`${estimate.cardCount}`} sub="cut from web" />
          <Stat
            label="Analytics"
            value={`${estimate.analyticCount}`}
            sub="debater-written"
          />
          <Stat
            label="Web searches"
            value={`${estimate.perplexitySearches}`}
            sub="Perplexity"
          />
          <Stat
            label="Time"
            value={`${estimate.estimatedMinutes.low}-${estimate.estimatedMinutes.high}m`}
            sub="wall-clock"
          />
          <Stat
            label="Tokens"
            value={`${estimate.estimatedKTokens.low}k-${estimate.estimatedKTokens.high}k`}
            sub="Anthropic"
          />
          <Stat
            label="API cost"
            value={`$${estimate.estimatedCostUSD.low.toFixed(2)}-$${estimate.estimatedCostUSD.high.toFixed(2)}`}
            sub="approx"
          />
        </div>

        {/* What it'll do */}
        <div className="surface p-3 text-[11.5px] leading-relaxed">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1.5">
            What this will do
          </div>
          <ol className="space-y-1 text-[var(--text-secondary)]">
            <li>
              <span className="text-[var(--accent-blue)]">1.</span> Plan a{" "}
              {argType.toUpperCase()} camp file structure
              {description ? ` for: "${description.slice(0, 60)}${description.length > 60 ? "…" : ""}"` : "."}
            </li>
            <li>
              <span className="text-[var(--accent-blue)]">2.</span> Search the web for{" "}
              {estimate.cardCount} pieces of evidence
            </li>
            <li>
              <span className="text-[var(--accent-blue)]">3.</span> Scrape source URLs
              and verify verbatim
            </li>
            <li>
              <span className="text-[var(--accent-blue)]">4.</span> Cut{" "}
              {estimate.cardCount} cards with Opus + integrity check
            </li>
            <li>
              <span className="text-[var(--accent-blue)]">5.</span> Generate{" "}
              {estimate.analyticCount} analytics with claim/warrant/application
              audit
            </li>
          </ol>
        </div>

        <p className="text-[10.5px] text-[var(--text-faint)] leading-relaxed">
          Running this in the background is safe — close the tab and the build
          continues server-side. Cards land in your Library. Failed cards become
          analytic placeholders rather than fabricated content.
        </p>
      </div>
    </Modal>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-0.5">
        {label}
      </div>
      <div className="text-[18px] font-bold text-white font-mono leading-tight">
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[var(--text-tertiary)]">{sub}</div>
      )}
    </div>
  );
}
