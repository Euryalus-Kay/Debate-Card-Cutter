"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
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
  argument: {
    id: string;
    title: string;
    description: string;
  };
  cards: GeneratedCard[];
  planned: number;
  generated: number;
}

export default function ArgumentPage() {
  const [userName, setUserName] = useState("");
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ArgumentResult | null>(null);
  const [iteratingId, setIteratingId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("cardcutter-name");
    if (saved) {
      setUserName(saved);
      fetch(`/api/context?user=${encodeURIComponent(saved)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.context) setContext(data.context);
        })
        .catch(() => {});
    }
  }, []);

  const handleNameChange = (name: string) => {
    setUserName(name);
    localStorage.setItem("cardcutter-name", name);
  };

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

      const data = await res.json();
      setResult(data);
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
      <Navbar userName={userName} onNameChange={handleNameChange} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold font-sans mb-2">Build an Argument</h1>
        <p className="text-sm text-[var(--muted)] font-sans mb-6">
          Describe your argument and the AI will plan and generate multiple cards
          to build a complete argument block.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--muted)] font-sans mb-1">
              Context
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Debate topic, aff/neg position, etc..."
              className="w-full px-3 py-2 text-sm bg-[var(--card-bg)] border border-[var(--border)] rounded text-[var(--fg)] font-sans placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] min-h-[60px] resize-y"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--muted)] font-sans mb-1">
              What argument do you want to build?
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Build an argument block proving that copyright licensing regimes fail for AI training data — cover administrative infeasibility, orphan works problems, dataset scale issues, and low payments to creators..."
              className="w-full px-3 py-2 text-sm bg-[var(--card-bg)] border border-[var(--border)] rounded text-[var(--fg)] font-sans placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] min-h-[120px] resize-y"
            />
          </div>

          <button
            onClick={generateArgument}
            disabled={loading || !query.trim()}
            className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded font-sans font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? "Building argument..." : "Build Argument"}
          </button>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300 font-sans">
              {error}
            </div>
          )}

          {loading && (
            <div className="p-6 border border-[var(--border)] rounded-lg bg-[var(--card-bg)]">
              <div className="flex items-center gap-3">
                <div className="animate-spin w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
                <div className="font-sans text-sm">
                  <p className="text-[var(--fg)]">Building argument block...</p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Planning argument structure, searching for evidence, and
                    generating cards. This may take 2-5 minutes for multiple
                    cards.
                  </p>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <div className="p-4 border border-[var(--border)] rounded-lg bg-[var(--card-bg)]">
                <h2 className="text-lg font-bold font-sans">
                  {result.argument.title}
                </h2>
                <p className="text-sm text-[var(--muted)] font-sans mt-1">
                  {result.argument.description}
                </p>
                <p className="text-xs text-[var(--muted)] font-sans mt-2">
                  Generated {result.generated} of {result.planned} planned cards
                </p>
              </div>

              {result.cards.map((card, i) => (
                <div key={card.id}>
                  <div className="text-xs text-[var(--muted)] font-sans mb-1">
                    Card {i + 1}: {card.purpose}
                  </div>
                  <CardDisplay
                    id={card.id}
                    tag={card.tag}
                    cite={card.cite}
                    citeAuthor={card.cite_author}
                    evidenceHtml={card.evidence_html}
                    authorName={userName || "Anonymous"}
                    onIterate={(instruction) =>
                      handleIterate(card.id, instruction)
                    }
                    isLoading={iteratingId === card.id}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
