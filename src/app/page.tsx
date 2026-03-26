"use client";

import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import CardDisplay from "@/components/CardDisplay";

interface Card {
  id: string;
  tag: string;
  cite: string;
  cite_author: string;
  evidence_html: string;
  author_name: string;
  created_at: string;
}

export default function Home() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("cardcutter-name");
    if (saved) setUserName(saved);
  }, []);

  const handleNameChange = (name: string) => {
    setUserName(name);
    localStorage.setItem("cardcutter-name", name);
  };

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch("/api/cards");
      const data = await res.json();
      if (Array.isArray(data)) setCards(data);
    } catch (err) {
      console.error("Failed to fetch cards:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards();
    // Poll for new cards every 30s
    const interval = setInterval(fetchCards, 30000);
    return () => clearInterval(interval);
  }, [fetchCards]);

  const handleIterate = async (cardId: string, instruction: string) => {
    setIteratingId(cardId);
    try {
      const res = await fetch("/api/iterate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, instruction }),
      });
      const data = await res.json();
      if (data.tag && data.evidence_html) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId
              ? { ...c, tag: data.tag, evidence_html: data.evidence_html }
              : c
          )
        );
      }
    } catch (err) {
      console.error("Iterate failed:", err);
    } finally {
      setIteratingId(null);
    }
  };

  const handleDelete = async (cardId: string) => {
    if (!confirm("Delete this card?")) return;
    try {
      await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const filteredCards = cards.filter((c) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      c.tag.toLowerCase().includes(q) ||
      c.cite.toLowerCase().includes(q) ||
      c.author_name.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Navbar userName={userName} onNameChange={handleNameChange} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold font-sans">All Cards</h1>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search cards..."
            className="w-64 px-3 py-1.5 text-sm bg-[var(--card-bg)] border border-[var(--border)] rounded text-[var(--fg)] font-sans placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {loading ? (
          <div className="text-center py-20 text-[var(--muted)] font-sans">
            Loading cards...
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[var(--muted)] font-sans mb-4">
              {filter ? "No cards match your search." : "No cards yet."}
            </p>
            {!filter && (
              <a
                href="/create"
                className="inline-block px-4 py-2 bg-[var(--accent)] text-white rounded font-sans hover:bg-[var(--accent-hover)] transition-colors"
              >
                Cut Your First Card
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCards.map((card) => (
              <CardDisplay
                key={card.id}
                id={card.id}
                tag={card.tag}
                cite={card.cite}
                citeAuthor={card.cite_author}
                evidenceHtml={card.evidence_html}
                authorName={card.author_name}
                createdAt={card.created_at}
                onIterate={(instruction) => handleIterate(card.id, instruction)}
                onDelete={() => handleDelete(card.id)}
                isLoading={iteratingId === card.id}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
