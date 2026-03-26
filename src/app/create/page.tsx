"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/components/AppShell";
import CardDisplay from "@/components/CardDisplay";
import ProgressTracker from "@/components/ProgressTracker";

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

export default function CreatePage() {
  const { userName } = useApp();
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [savedContext, setSavedContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [card, setCard] = useState<GeneratedCard | null>(null);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [rapid, setRapid] = useState(false);
  const [progress, setProgress] = useState<ProgressStep | null>(null);

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
    setProgress(null);

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
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (eventType === "progress") {
              setProgress(data);
            } else if (eventType === "done") {
              setCard(data);
              setProgress(null);
            } else if (eventType === "error") {
              throw new Error(data.message);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setProgress(null);
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
            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#666] focus:outline-none focus:border-[#333] transition-colors min-h-[70px] resize-y"
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
            className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#666] focus:outline-none focus:border-[#333] transition-colors min-h-[100px] resize-y"
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
          <button
            onClick={() => setRapid(!rapid)}
            className={`px-3 py-2 text-[11px] rounded-lg border transition-colors ${
              rapid
                ? "border-amber-500/50 text-amber-400 bg-amber-950/30"
                : "border-[#1a1a1a] text-[#888] hover:text-[#aaa]"
            }`}
          >
            {rapid ? "Rapid" : "Standard"}
          </button>
          <span className="text-[11px] text-[#777]">
            {rapid ? "Faster, uses Sonnet" : "Cmd+Enter"}
          </span>
        </div>

        {error && (
          <div className="px-3 py-2.5 bg-red-950/50 border border-red-900/50 rounded-lg text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* Progress tracker */}
        {loading && <ProgressTracker current={progress} />}

        {/* Generated card */}
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
