"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import {
  ScalesIcon,
  TargetIcon,
  ZapIcon,
  ShieldIcon,
  FlameIcon,
  GavelIcon,
  BookIcon,
  SparkleIcon,
  BrainIcon,
} from "@/components/ui/icons";
import MarkdownView from "@/components/ui/MarkdownView";
import Link from "next/link";

interface PlaybookEntry {
  id: string;
  title: string;
  category: "rebuttal" | "constructive" | "off-case" | "case" | "judge" | "drill" | "framework";
  summary: string;
  steps: string[];
  warnings: string[];
  example?: string;
  shortcut?: { href: string; label: string };
}

const PLAYBOOK: PlaybookEntry[] = [
  {
    id: "2nr-collapse-cp-da",
    title: "2NR collapse: CP + DA",
    category: "rebuttal",
    summary:
      "The gold-standard 2NR. CP solves the aff, DA is the net benefit. Mutual exclusivity often natural.",
    steps: [
      "Open with 1 sentence judge instruction: 'The question in this round is whether the CP captures aff offense while avoiding the DA.'",
      "CP solvency: extend 2-3 strongest cards, answer perm severity (severance, intrinsic).",
      "DA: extend uniqueness > link > impact. Read 1-2 NEW cards extending the link to the plan specifically.",
      "Answer perm do both: 'The perm links harder because it doubles the political cost — the DA is non-unique to the CP because the CP is GOP-supported.'",
      "Impact comparison (most important): magnitude, probability, timeframe vs. their advantage.",
      "Close: 'Vote neg because the CP captures 100% of aff solvency and the DA outweighs.'",
    ],
    warnings: [
      "Don't kick the K silently — explicitly drop it to avoid theory backlash.",
      "If 1AR severed perms, extend severance bad theory before going for the CP.",
    ],
    example:
      "Example: against a federal copyright reform aff, run States CP + Politics DA. CP fiat = 50 states implement copyright reform individually. DA = federal action burns Biden's political capital before midterms. Perm severs federal action; CP solves via state action.",
    shortcut: { href: "/coach", label: "Drill this collapse with the coach" },
  },
  {
    id: "1ar-13-vs-5",
    title: "1AR survival: 13 minutes vs. 5",
    category: "rebuttal",
    summary:
      "The hardest speech in policy debate. 13 minutes of neg block answers in 5 minutes. Group, cross-apply, extend.",
    steps: [
      "Pre-allocate: 60% of time on what you EXPECT the 2NR to go for. Don't spread evenly.",
      "Group ruthlessly: 'Group their 4 uniqueness extensions — they all rely on assumption [X], and our 2AC #3 controls that assumption.'",
      "Cross-apply, don't re-read: 'Cross-apply our 2AC #3 — they conceded our characterization in CX.'",
      "Extend ONE advantage with impact comparison. Don't extend everything — pick the strongest.",
      "Quick coverage on theory + T (no more than 30s each unless executed well by the block).",
      "Close with a 1-sentence framing for the 2AR: 'Even if they win [X], we still win because [Y].'",
    ],
    warnings: [
      "DO NOT make new arguments — judges punish 1AR new arguments harshly.",
      "DO NOT line-by-line everything. You'll run out of time and answer nothing well.",
      "If a position got crushed in the 2NC, it's okay to give it 15 seconds and move on.",
    ],
  },
  {
    id: "2ac-frontline-da",
    title: "2AC frontline: against a politics DA",
    category: "constructive",
    summary:
      "Standard 4-5 response set. Mix defense + offense. Never link AND impact turn the same DA.",
    steps: [
      "Non-unique #1: status quo trends prove the impact is happening regardless. Read a uniqueness overwhelms card.",
      "No link: plan doesn't trigger the link mechanism. Be specific about the link they read.",
      "Link turn (pick ONE): plan generates positive political capital. 1-2 cards.",
      "Impact defense / impact turn (pick ONE — never both with link turn).",
      "Cross-apply case: case impacts outweigh the DA on magnitude, probability, or timeframe.",
      "Close with weighing: 'Even if you grant the DA, our advantage outweighs because [X].'",
    ],
    warnings: [
      "DOUBLE TURN ALERT: link turn + impact turn = you've made the neg's argument for them.",
      "Be specific. 'No link' is meaningless without WHY no link.",
      "Read at least one piece of evidence per response — analytics alone get crushed in the block.",
    ],
  },
  {
    id: "1nc-shell-da",
    title: "1NC: build a Politics DA shell",
    category: "off-case",
    summary:
      "Standard 4-card shell. Uniqueness, link, internal link, impact. Plus 2 analytics framing the story.",
    steps: [
      "Uniqueness card (Card 1): status quo is heading the right direction. 'Biden has the votes' or 'GOP cooperation is high'.",
      "Link card (Card 2): plan triggers political backlash. Specific to plan's mechanism — agency, scope, cost.",
      "Internal link card (Card 3): backlash → Biden loses [X] → bad outcome. Chain of causation.",
      "Impact card (Card 4): the bad outcome causes [war/recession/extinction].",
      "Analytic 1: 'Story of the DA' — explains the chain in plain language. 4-6 sentences.",
      "Analytic 2: Impact framing — 'magnitude/probability/timeframe weighing'.",
    ],
    warnings: [
      "Read FRESH uniqueness — old uniqueness gets attacked as 'non-unique'.",
      "Specific links beat generic links. 'Spending' is generic; 'Defense Authorization Act spending caps' is specific.",
      "If you can't write a 6-sentence story, the DA doesn't have a coherent link chain.",
    ],
  },
  {
    id: "k-aff-framework",
    title: "K aff vs. T-USFG framework",
    category: "framework",
    summary:
      "The most contested debate in modern policy. Both sides have strong literature.",
    steps: [
      "If aff: counter-interp ('debate is X, not Y'), impact turn topical version of aff (TVA), framework turns case.",
      "If neg: defend procedural fairness as a voter, defend predictability and clash, TVA solves your offense.",
      "Aff offense: framework excludes critical scholarship, reproduces the harms the K identifies, is itself a structural violence.",
      "Neg offense: clash is an internal link to all education, K affs make debate a non-event, fairness comes first.",
      "Both: read empirical examples from past TOC rounds. Cite specific debaters/teams/coaches who've engaged this debate.",
    ],
    warnings: [
      "Some judges refuse to evaluate K affs at all. Check paradigm before deploying.",
      "On framework: don't go for tag-line standards ('limits are good'). Develop the standard with warrants.",
      "K aff offense often turns into framework offense — think about how 'fairness reproduces structural violence' interacts with their 'fairness is a voter'.",
    ],
    shortcut: { href: "/judge", label: "Check the judge's K-receptivity" },
  },
  {
    id: "case-side-extensions",
    title: "Case extensions in the 2AC",
    category: "case",
    summary:
      "Most teams under-extend the case. Top teams treat case as a 4th off-case.",
    steps: [
      "Re-read the strongest impact card with 1-line setup: 'On case, our [Author] evidence indicates [X] — and that's the only impact framing the neg can't beat.'",
      "Read 1-2 NEW impact cards from the case file that you didn't read in 1AC. Extends the impact debate.",
      "Extend solvency: 'Plan solves because [mechanism]. Their solvency takeouts assume [X] which our evidence answers.'",
      "Read 1 new internal link card if the neg attacked the IL chain.",
      "Set up impact comparison: 'Our impact outweighs ANY off-case because [magnitude/probability/timeframe].'",
    ],
    warnings: [
      "Don't just say 'extend our 1AC' — that's not extending, that's gesturing.",
      "Pre-empt the 1NR: if there's likely 1NR case attack, allocate time for it now.",
    ],
  },
  {
    id: "judge-adapt-circuit",
    title: "Adapting to a tech judge",
    category: "judge",
    summary:
      "80%+ of circuit judges are tech-leaning. Drop nothing. Number everything.",
    steps: [
      "Number every response: 'On their #3, three responses: first... second... third...'",
      "Flag concessions immediately when they happen: 'They conceded our X — that's a conceded warrant.'",
      "Use explicit judge instruction: 'You should evaluate Y first because Z.'",
      "Don't moralize — make technical arguments. Tech judges punish 'this argument is offensive.'",
      "Spread is fine but slow on tags. Their flow is your win.",
    ],
    warnings: [
      "Lay judges punish all of this. Always check the paradigm first.",
      "Some 'tech' judges have aesthetic preferences (e.g., dislike trickery). Read carefully.",
    ],
    shortcut: { href: "/judge", label: "Pick a judge paradigm" },
  },
  {
    id: "spreading-ramp",
    title: "Spreading ramp-up",
    category: "drill",
    summary: "How to add 50+ wpm in 8 weeks.",
    steps: [
      "Week 1-2: tongue twisters daily, 10 min. Pencil between teeth.",
      "Week 3-4: read at 110% of competition speed for 5 min/day.",
      "Week 5-6: redo 1ARs from old rounds at faster pace.",
      "Week 7-8: read full 1NC shells under time pressure with no errors.",
    ],
    warnings: [
      "Speed without clarity is worthless. Record yourself and listen back.",
      "Tag changes (slowing for tags) are how top debaters appear faster than they are.",
    ],
    shortcut: { href: "/drills", label: "Try a spreading drill" },
  },
  {
    id: "impact-calc-formula",
    title: "Impact calculus formula",
    category: "rebuttal",
    summary:
      "The 5-axis comparison every 2NR/2AR needs. Build muscle memory.",
    steps: [
      "Magnitude: 'Our impact is bigger because [warrant comparing scale].'",
      "Probability: 'Our impact is more likely because [empirical examples vs. predictive modeling].'",
      "Timeframe: 'Our impact triggers first because [specific timeline anchor].'",
      "Reversibility: 'Our impact is irreversible — extinction, climate tipping, etc.'",
      "Even-if layer: 'Even if you grant their X, we still win Y because Z.'",
    ],
    warnings: [
      "NEVER just list axes. Always compare on each one.",
      "If you can't pick the strongest 2 axes for your impact, you don't understand it.",
    ],
    shortcut: { href: "/impact-calc", label: "Build a calc with sliders" },
  },
];

const CATEGORIES = [
  { id: "all", label: "All", icon: BookIcon },
  { id: "rebuttal", label: "Rebuttals", icon: FlameIcon },
  { id: "constructive", label: "Constructives", icon: ShieldIcon },
  { id: "off-case", label: "Off-case", icon: TargetIcon },
  { id: "case", label: "Case", icon: ZapIcon },
  { id: "framework", label: "Framework", icon: ScalesIcon },
  { id: "judge", label: "Judge", icon: GavelIcon },
  { id: "drill", label: "Drill", icon: SparkleIcon },
] as const;

export default function StrategyPage() {
  const { resolution, setResolution, userName } = useApp();
  const toast = useToast();
  const [selectedCategory, setSelectedCategory] =
    useState<(typeof CATEGORIES)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // Quick-ask
  const [question, setQuestion] = useState("");
  const [advice, setAdvice] = useState<string>("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [savedContext, setSavedContext] = useState("");

  useEffect(() => {
    if (!userName) return;
    fetch(`/api/context?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => setSavedContext(data?.context || ""))
      .catch(() => {});
  }, [userName]);

  const filtered = PLAYBOOK.filter((p) => {
    if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.steps.some((s) => s.toLowerCase().includes(q))
    );
  });

  const askQuick = async () => {
    if (!question.trim()) return;
    setLoadingAdvice(true);
    setAdvice("");
    try {
      const res = await fetch("/api/quick-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context: savedContext,
          resolution,
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Quick ask failed", data.error);
      } else {
        setAdvice(data.advice);
      }
    } catch (err) {
      toast.error("Quick ask failed", err instanceof Error ? err.message : "");
    } finally {
      setLoadingAdvice(false);
    }
  };

  return (
    <>
      <div className="mb-6 anim-fade-in">
        <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
          <BookIcon size={18} className="text-[var(--accent-blue)]" />
          Strategy playbook
        </h1>
        <p className="text-[12.5px] text-[var(--text-tertiary)] mt-1 max-w-2xl">
          Pre-built strategic guides for every speech and situation. For
          back-and-forth coaching, use{" "}
          <Link href="/coach" className="text-[var(--accent-blue)] hover:underline">
            Live Coach
          </Link>
          .
        </p>
      </div>

      {/* Quick ask */}
      <div className="surface-elev p-4 mb-6 anim-slide-up">
        <div className="flex items-center gap-2 mb-2">
          <BrainIcon size={14} className="text-[var(--accent-purple)]" />
          <h2 className="text-[12.5px] font-semibold">Quick ask</h2>
          <span className="text-[10px] text-[var(--text-faint)]">
            Single question, structured answer · ~10 seconds
          </span>
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={"e.g., \"What's the cleanest answer to the States CP as aff?\""}
            className="input flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") askQuick();
            }}
          />
          <button
            onClick={askQuick}
            disabled={loadingAdvice || !question.trim()}
            className="btn-primary"
          >
            {loadingAdvice ? (
              <>
                <span className="spinner" /> Thinking...
              </>
            ) : (
              <>
                <SparkleIcon size={12} /> Ask
              </>
            )}
          </button>
        </div>
        {advice && (
          <div className="mt-3 surface p-3 anim-fade-in">
            <MarkdownView text={advice} />
          </div>
        )}
      </div>

      {/* Resolution */}
      {!resolution && (
        <div className="surface px-3 py-2.5 mb-4 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wider text-[var(--accent-amber)] shrink-0">
            Tip
          </span>
          <input
            placeholder="Set the current resolution to get topic-aware advice"
            className="flex-1 bg-transparent text-[12.5px] text-white outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) {
                  setResolution(v);
                  toast.success("Topic saved");
                }
              }
            }}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] rounded-md border transition-all ${
                selectedCategory === c.id
                  ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                  : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              <Icon size={12} /> {c.label}
            </button>
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search playbook..."
          className="input ml-auto"
          style={{ width: "220px" }}
        />
      </div>

      {/* Playbook entries */}
      <div className="space-y-2">
        {filtered.map((entry) => {
          const isOpen = open === entry.id;
          return (
            <div
              key={entry.id}
              className="surface overflow-hidden"
              style={{ transition: "all 200ms" }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : entry.id)}
                className="w-full text-left p-4 hover:bg-[var(--bg-elev-2)] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="badge badge-blue capitalize">
                        {entry.category.replace("-", " ")}
                      </span>
                    </div>
                    <h3 className="text-[14px] font-semibold text-white">
                      {entry.title}
                    </h3>
                    <p className="text-[11.5px] text-[var(--text-tertiary)] mt-1">
                      {entry.summary}
                    </p>
                  </div>
                  <span
                    className="text-[var(--text-faint)] transition-transform"
                    style={{
                      transform: isOpen ? "rotate(90deg)" : "rotate(0)",
                    }}
                  >
                    ▶
                  </span>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 anim-fade-in border-t border-[var(--border-subtle)] pt-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1.5">
                      Step-by-step
                    </div>
                    <ol className="space-y-1.5">
                      {entry.steps.map((s, i) => (
                        <li
                          key={i}
                          className="text-[12px] text-[var(--text-secondary)] flex gap-2"
                        >
                          <span className="text-[var(--accent-blue)] font-mono shrink-0">
                            {i + 1}.
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {entry.warnings.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--accent-amber)] mb-1.5">
                        Warnings
                      </div>
                      <ul className="space-y-1">
                        {entry.warnings.map((w, i) => (
                          <li
                            key={i}
                            className="text-[11.5px] text-[var(--text-secondary)] flex gap-2"
                          >
                            <span className="text-[var(--accent-amber)] shrink-0">
                              ⚠
                            </span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {entry.example && (
                    <div className="surface p-2.5 border-l-2 border-[var(--accent-purple)]">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--accent-purple)] mb-1">
                        Example
                      </div>
                      <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
                        {entry.example}
                      </p>
                    </div>
                  )}
                  {entry.shortcut && (
                    <Link
                      href={entry.shortcut.href}
                      className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--accent-blue)] hover:underline mt-1"
                    >
                      → {entry.shortcut.label}
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="surface text-center py-12 text-[13px] text-[var(--text-tertiary)]">
            No matching plays. Try removing a filter or use{" "}
            <Link
              href="/coach"
              className="text-[var(--accent-blue)] hover:underline"
            >
              Live Coach
            </Link>{" "}
            for a custom answer.
          </div>
        )}
      </div>
    </>
  );
}
