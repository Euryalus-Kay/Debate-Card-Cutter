"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/components/AppShell";
import CardDisplay from "@/components/CardDisplay";

interface GeneratedCard {
  id: string;
  tag: string;
  cite: string;
  cite_author?: string;
  evidence_html: string;
  purpose: string;
}

interface ArgumentResult {
  argument: { id: string; title: string; description: string };
  cards: GeneratedCard[];
  planned: number;
  generated: number;
}

export default function ArgumentPage() {
  const { userName } = useApp();
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ArgumentResult | null>(null);
  const [iteratingId, setIteratingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userName) return;
    fetch(`/api/context?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.context) setContext(data.context);
      })
      .catch(() => {});
  }, [userName]);

  const generateArgument = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/argument", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          context,
          authorName: userName || "Anonymous",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Argument generation failed");
      }

      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
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
      if (data.tag && data.evidence_html && result) {
        setResult({
          ...result,
          cards: result.cards.map((c) =>
            c.id === cardId
              ? { ...c, tag: data.tag, evidence_html: data.evidence_html }
              : c
          ),
        });
      }
    } catch (err) {
      console.error("Iterate failed:", err);
    } finally {
      setIteratingId(null);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight">Build Argument</h1>
        <p className="text-[13px] text-[#444] mt-1">
          AI plans and generates multiple cards for a complete argument block.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-[13px] text-[#666] mb-1.5 block">Context</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Debate topic, position..."
            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors min-h-[60px] resize-y"
          />
        </div>

        <div>
          <label className="text-[13px] text-[#666] mb-1.5 block">
            What argument do you want to build?
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., Build an argument block proving copyright licensing regimes fail for AI training data..."
            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors min-h-[100px] resize-y"
          />
        </div>

        <button
          onClick={generateArgument}
          disabled={loading || !query.trim()}
          className="px-5 py-2 bg-white text-black text-[13px] font-medium rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors"
        >
          {loading ? "Building..." : "Build Argument"}
        </button>

        {error && (
          <div className="px-3 py-2.5 bg-red-950/50 border border-red-900/50 rounded-lg text-[13px] text-red-400">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 px-4 py-5 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a]">
            <div className="animate-spin w-4 h-4 border-2 border-[#333] border-t-white rounded-full" />
            <div className="text-[13px]">
              <span className="text-[#999]">Planning and generating cards...</span>
              <span className="text-[#444] ml-2">~2-5 min</span>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3 pt-2">
            <div className="px-4 py-3 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a]">
              <h2 className="text-[15px] font-semibold">{result.argument.title}</h2>
              <p className="text-[13px] text-[#666] mt-1">{result.argument.description}</p>
              <p className="text-[11px] text-[#444] mt-2">
                {result.generated}/{result.planned} cards generated
              </p>
            </div>

            {result.cards.map((card, i) => (
              <div key={card.id}>
                <p className="text-[11px] text-[#444] mb-1">
                  {i + 1}. {card.purpose}
                </p>
                <CardDisplay
                  id={card.id}
                  tag={card.tag}
                  cite={card.cite}
                  citeAuthor={card.cite_author}
                  evidenceHtml={card.evidence_html}
                  authorName={userName || "Anonymous"}
                  onIterate={(instruction) => handleIterate(card.id, instruction)}
                  isLoading={iteratingId === card.id}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
