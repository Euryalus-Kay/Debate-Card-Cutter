"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import CardDisplay from "@/components/CardDisplay";

interface GeneratedCard {
  id: string;
  tag: string;
  cite: string;
  cite_author: string;
  evidence_html: string;
  author_name: string;
}

export default function CreatePage() {
  const [userName, setUserName] = useState("");
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [savedContext, setSavedContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [status, setStatus] = useState("");
  const [iteratingId, setIteratingId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("cardcutter-name");
    if (saved) {
      setUserName(saved);
      // Load saved context
      fetch(`/api/context?user=${encodeURIComponent(saved)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.context) {
            setSavedContext(data.context);
            setContext(data.context);
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleNameChange = (name: string) => {
    setUserName(name);
    localStorage.setItem("cardcutter-name", name);
  };

  const saveContext = async () => {
    if (!userName) return;
    await fetch("/api/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName, context }),
    });
    setSavedContext(context);
  };

  const generateCard = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setCard(null);
    setStatus("Searching for evidence...");

    try {
      const res = await fetch("/api/generate", {
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
        throw new Error(data.error || "Generation failed");
      }

      setStatus("Card generated!");
      const data = await res.json();
      setCard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 3000);
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
        <h1 className="text-xl font-bold font-sans mb-6">Cut a Card</h1>

        <div className="space-y-4">
          {/* Context */}
          <div>
            <label className="block text-sm text-[var(--muted)] font-sans mb-1">
              Debate Context{" "}
              <span className="text-xs">(saves across sessions)</span>
            </label>
            <div className="flex gap-2">
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="e.g., We are running a Copyright reform aff on the 2024-25 topic. We need cards about fair use, licensing failures, and AI training data..."
                className="flex-1 px-3 py-2 text-sm bg-[var(--card-bg)] border border-[var(--border)] rounded text-[var(--fg)] font-sans placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] min-h-[80px] resize-y"
              />
              {context !== savedContext && (
                <button
                  onClick={saveContext}
                  className="self-start px-3 py-2 text-xs bg-[var(--border)] hover:bg-[var(--accent)] text-[var(--fg)] rounded font-sans transition-colors"
                >
                  Save
                </button>
              )}
            </div>
          </div>

          {/* Query */}
          <div>
            <label className="block text-sm text-[var(--muted)] font-sans mb-1">
              What should the card argue?
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Licensing fails because there is no entity that can administer licenses at the scale needed for AI training data, and the costs would be prohibitive..."
              className="w-full px-3 py-2 text-sm bg-[var(--card-bg)] border border-[var(--border)] rounded text-[var(--fg)] font-sans placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] min-h-[100px] resize-y"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) {
                  generateCard();
                }
              }}
            />
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button
              onClick={generateCard}
              disabled={loading || !query.trim()}
              className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded font-sans font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? "Generating..." : "Cut Card"}
            </button>
            {status && (
              <span className="text-sm text-[var(--muted)] font-sans">
                {status}
              </span>
            )}
            <span className="text-xs text-[var(--muted)] font-sans">
              Cmd+Enter to generate
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300 font-sans">
              {error}
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div className="p-6 border border-[var(--border)] rounded-lg bg-[var(--card-bg)]">
              <div className="flex items-center gap-3">
                <div className="animate-spin w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
                <div className="font-sans text-sm">
                  <p className="text-[var(--fg)]">Generating card...</p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Searching sources with Perplexity, then formatting with Claude.
                    This may take 30-60 seconds.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Generated card */}
          {card && (
            <div className="mt-6">
              <h2 className="text-lg font-bold font-sans mb-3">Generated Card</h2>
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
        </div>
      </main>
    </>
  );
}
