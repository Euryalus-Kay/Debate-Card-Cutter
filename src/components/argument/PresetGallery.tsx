"use client";

import {
  ShieldIcon,
  FlameIcon,
  ScissorsIcon,
  ScalesIcon,
  SparkleIcon,
  TargetIcon,
  ZapIcon,
} from "@/components/ui/icons";

export interface ArgumentPreset {
  id: string;
  argType: "aff" | "da" | "cp" | "k" | "t" | "theory" | "custom";
  name: string;
  oneLiner: string;
  description: string;
  examplePrompt: string;
  /** Tier indicates how much depth: light prep / tournament / camp file. */
  tier: "light" | "tournament" | "camp";
  /** Color accent used in UI. */
  accent: string;
  /** SVG icon component name (mapped below). */
  iconKey:
    | "shield"
    | "flame"
    | "scissors"
    | "scales"
    | "sparkle"
    | "target"
    | "zap";
}

export const ARGUMENT_PRESETS: ArgumentPreset[] = [
  // AFF presets
  {
    id: "aff-bigstick",
    argType: "aff",
    name: "Big-stick aff (heg/extinction)",
    oneLiner: "1AC with 2 advantages, extinction-level impacts, robust solvency.",
    description:
      "Classic varsity 1AC. Inherency, plan text, two advantages each with uniqueness/internal-link/impact, and a 3-card solvency contention. Works against most policy strategies.",
    examplePrompt:
      "1AC: federal investment in offshore wind generates 2M jobs and prevents great-power conflict via energy independence. Two advantages: economy + heg. Read against politics DA + states CP.",
    tier: "tournament",
    accent: "blue",
    iconKey: "shield",
  },
  {
    id: "aff-soft-left",
    argType: "aff",
    name: "Soft-left structural aff",
    oneLiner: "1AC with structural impacts and pre-emptive K answers built in.",
    description:
      "Material aff with structural-violence framing. Designed to engage K teams without rejecting policy. Includes framework cards built into the case.",
    examplePrompt:
      "1AC: federal copyright reform that protects Indigenous traditional knowledge from AI training. Structural impact framing — the harm is ongoing dispossession, not extinction.",
    tier: "tournament",
    accent: "purple",
    iconKey: "shield",
  },
  // DA presets
  {
    id: "da-politics",
    argType: "da",
    name: "Politics DA",
    oneLiner: "Standard 4-card shell + 1NC analytics. The neg's bread and butter.",
    description:
      "Uniqueness, link, internal link, impact. With current-events uniqueness updates (election DA, agenda DA, midterms). Calibrated for plan-cost link logic.",
    examplePrompt:
      "Politics DA — Biden's bipartisan healthcare bill is on the brink of passing. Plan costs PC, kills the bill, GOP wins midterms, no Ukraine aid, Russia escalates → nuclear war.",
    tier: "tournament",
    accent: "red",
    iconKey: "flame",
  },
  {
    id: "da-econ",
    argType: "da",
    name: "Economy DA",
    oneLiner: "Spending or tradeoff DA with credible impact scenario.",
    description:
      "Uniqueness on the recovery, link to plan spending or sector tradeoff, internal link to recession, terminal impact (great-power war via econ decline, structural unemployment).",
    examplePrompt:
      "Spending DA — federal deficit at the brink. Plan increases deficit, triggers debt downgrade, dollar collapse, global recession, war.",
    tier: "tournament",
    accent: "amber",
    iconKey: "flame",
  },
  // CP presets
  {
    id: "cp-states",
    argType: "cp",
    name: "States CP",
    oneLiner: "50 states fiat. Net benefit: federalism / spending / process DA.",
    description:
      "CP text, state authority solvency cards, federalism net benefit, perm answers. Flexes against most affs that aren't agent-locked.",
    examplePrompt:
      "States CP: 50 states implement copyright reform individually. Net benefit: federalism DA. CP solves the aff and avoids federal preemption.",
    tier: "camp",
    accent: "green",
    iconKey: "scales",
  },
  {
    id: "cp-advantage",
    argType: "cp",
    name: "Advantage CP",
    oneLiner: "Captures aff offense via different mechanism.",
    description:
      "CP that solves the aff's strongest advantage through a different agent or mechanism, leaving only weak solvency deficit. Strong against narrow affs.",
    examplePrompt:
      "Advantage CP: instead of plan, the SEC issues new regulations that solve the financial-stability advantage. CP avoids the spending DA that plan triggers.",
    tier: "camp",
    accent: "cyan",
    iconKey: "scales",
  },
  // K presets
  {
    id: "k-cap",
    argType: "k",
    name: "Cap K",
    oneLiner: "Capitalism kritik with full literature base — Tucker, McNally, Ahmad.",
    description:
      "Standard cap K with topic-specific links, alt that calls for revolutionary anti-capitalist organizing, framework arguments. Most-run K on the circuit.",
    examplePrompt:
      "Cap K against a copyright reform aff. Link: plan reinforces commodification of knowledge. Impact: capitalism causes infinite environmental destruction + structural violence. Alt: rejection of capitalist epistemology.",
    tier: "camp",
    accent: "purple",
    iconKey: "target",
  },
  {
    id: "k-setcol",
    argType: "k",
    name: "Settler Colonialism K",
    oneLiner: "Wolfe / Tuck & Yang. Permanence of settler structure.",
    description:
      "K of liberal reformist policies that stabilize the settler state. Decolonization is not a metaphor — alt is land back. Strong framework ground.",
    examplePrompt:
      "Set Col K against any aff that uses federal authority. Link: plan reaffirms settler sovereignty over Indigenous land. Impact: ongoing genocide. Alt: refuse settler ontology.",
    tier: "camp",
    accent: "pink",
    iconKey: "target",
  },
  {
    id: "k-security",
    argType: "k",
    name: "Security K",
    oneLiner: "Threat construction critique — heg, deterrence, IR realism are all linked.",
    description:
      "K of how the aff constructs threats to justify state violence. Links to heg affs, deterrence, military aid. Alt rejects securitization.",
    examplePrompt:
      "Security K against a heg aff. Link: aff securitizes China to justify US dominance. Impact: securitization → preemptive war. Alt: refuse threat construction.",
    tier: "camp",
    accent: "amber",
    iconKey: "target",
  },
  // T presets
  {
    id: "t-substantial",
    argType: "t",
    name: "T-Substantial",
    oneLiner: "Aff is not substantial. Limits, ground, predictability voters.",
    description:
      "Interp + violation + standards + voters. Strong if aff is small or specifies a narrow plan.",
    examplePrompt:
      "T-Substantial — plan does not substantially increase. Aff specifies only one agency. Limits explode the topic.",
    tier: "tournament",
    accent: "amber",
    iconKey: "scales",
  },
  {
    id: "t-usfg",
    argType: "t",
    name: "T-USFG (against K affs)",
    oneLiner: "Affs must defend the federal government as actor.",
    description:
      "Used against non-traditional / K affs. Defends procedural fairness as a voter, predictability and clash standards. TVA is the key part.",
    examplePrompt:
      "T-USFG against a K aff that refuses the resolution. Interp: aff must defend federal action. TVA solves all aff offense.",
    tier: "camp",
    accent: "yellow",
    iconKey: "scales",
  },
  // Theory
  {
    id: "theory-condo",
    argType: "theory",
    name: "Condo bad",
    oneLiner: "1 conditional advocacy is fine, multiple is abusive.",
    description:
      "Standard theory shell against multiple conditional positions. Interp / violation / standards / voters. Heavy on reciprocity and time skew.",
    examplePrompt:
      "Condo bad — neg ran 5 conditional positions. Time skew + contradiction destroys 1AR strategy.",
    tier: "light",
    accent: "orange",
    iconKey: "zap",
  },
  // Custom
  {
    id: "custom",
    argType: "custom",
    name: "Custom argument",
    oneLiner: "Describe your own argument and let AI determine the structure.",
    description:
      "Free-form. The AI plans the file structure based on your description. Best for unusual or hybrid arguments that don't fit a preset.",
    examplePrompt: "",
    tier: "tournament",
    accent: "neutral",
    iconKey: "scissors",
  },
];

const ICON_MAP = {
  shield: ShieldIcon,
  flame: FlameIcon,
  scissors: ScissorsIcon,
  scales: ScalesIcon,
  sparkle: SparkleIcon,
  target: TargetIcon,
  zap: ZapIcon,
};

const ACCENT_COLORS: Record<string, string> = {
  blue: "var(--accent-blue)",
  purple: "var(--accent-purple)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  pink: "var(--accent-pink)",
  red: "var(--accent-red)",
  green: "var(--accent-green)",
  orange: "var(--accent-amber)",
  yellow: "var(--accent-amber)",
  neutral: "var(--text-tertiary)",
};

interface Props {
  selectedId: string | null;
  onSelect: (preset: ArgumentPreset) => void;
  filter?: ArgumentPreset["argType"] | "all";
}

export default function PresetGallery({ selectedId, onSelect, filter = "all" }: Props) {
  const items =
    filter === "all"
      ? ARGUMENT_PRESETS
      : ARGUMENT_PRESETS.filter((p) => p.argType === filter);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {items.map((p) => {
        const Icon = ICON_MAP[p.iconKey];
        const accent = ACCENT_COLORS[p.accent] || ACCENT_COLORS.neutral;
        const selected = selectedId === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`text-left p-3 rounded-lg border transition-all ${
              selected
                ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-elev-1)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elev-2)]"
            }`}
          >
            <div className="flex items-start gap-2.5 mb-1.5">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `${accent}1f`, color: accent }}
              >
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>
                    {p.argType}
                  </span>
                  <span
                    className={`badge ${
                      p.tier === "camp"
                        ? "badge-purple"
                        : p.tier === "tournament"
                        ? "badge-blue"
                        : "badge-neutral"
                    }`}
                    style={{ fontSize: "9px", padding: "1px 5px" }}
                  >
                    {p.tier}
                  </span>
                </div>
                <h3 className="text-[12.5px] font-semibold text-white mt-0.5 line-clamp-1">
                  {p.name}
                </h3>
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed line-clamp-2">
              {p.oneLiner}
            </p>
          </button>
        );
      })}
    </div>
  );
}
