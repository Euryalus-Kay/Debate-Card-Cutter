"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/components/AppShell";
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
  const { userName } = useApp();
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [savedContext, setSavedContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [iteratingId, setIteratingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userName) return;
    fetch(`/api/context?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.context) {
          setSavedContext(data.context);
          setContext(data.context);
        }
      })
      .catch(() => {});
  }, [userName]);

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

      const data = await res.json();
      setCard(data);
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
      <h1 className="text-lg font-semibold tracking-tight mb-6">Cut a Card</h1>

      <div className="space-y-5">
        {/* Context */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-[13px] text-[#666]">Debate Context</label>
            {context !== savedContext && (
              <button
                onClick={saveContext}
                className="text-[11px] text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
              >
                Save context
              </button>
            )}
          </div>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g., Running a copyright reform aff on the 2024-25 topic..."
            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors min-h-[70px] resize-y"
          />
        </div>

        {/* Query */}
        <div>
          <label className="text-[13px] text-[#666] mb-1.5 block">
            What should this card argue?
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., Licensing fails because there is no entity that can administer licenses at the scale needed for AI training data..."
            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#333] focus:outline-none focus:border-[#333] transition-colors min-h-[100px] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) generateCard();
            }}
          />
        </div>

        {/* Generate */}
        <div className="flex items-center gap-3">
          <button
            onClick={generateCard}
            disabled={loading || !query.trim()}
            className="px-5 py-2 bg-white text-black text-[13px] font-medium rounded-lg hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors"
          >
            {loading ? "Generating..." : "Cut Card"}
          </button>
          <span className="text-[11px] text-[#333]">Cmd+Enter</span>
        </div>

        {error && (
          <div className="px-3 py-2.5 bg-red-950/50 border border-red-900/50 rounded-lg text-[13px] text-red-400">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 px-4 py-5 border border-[#1a1a1a] rounded-lg bg-[#0a0a0a]">
            <div className="animate-spin w-4 h-4 border-2 border-[#333] border-t-white rounded-full" />
            <div className="text-[13px]">
              <span className="text-[#999]">Searching and formatting...</span>
              <span className="text-[#444] ml-2">~30-60s</span>
            </div>
          </div>
        )}

        {card && (
          <div className="pt-2">
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
    </>
  );
}
