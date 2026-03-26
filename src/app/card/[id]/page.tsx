"use client";

import { useEffect, useState, use } from "react";
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
  cite_url: string;
}

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTag, setEditTag] = useState("");
  const [editEvidence, setEditEvidence] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("cardcutter-name");
    if (saved) setUserName(saved);
  }, []);

  const handleNameChange = (name: string) => {
    setUserName(name);
    localStorage.setItem("cardcutter-name", name);
  };

  useEffect(() => {
    fetch(`/api/cards/${id}`)
      .then((r) => r.json())
      .then((data) => {
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
      }
    } catch (err) {
      console.error("Iterate failed:", err);
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
        body: JSON.stringify({
          tag: editTag,
          evidence_html: editEvidence,
        }),
      });
      const data = await res.json();
      setCard({ ...card, ...data });
      setEditing(false);
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  return (
    <>
      <Navbar userName={userName} onNameChange={handleNameChange} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-20 text-[var(--muted)] font-sans">Loading...</div>
        ) : !card ? (
          <div className="text-center py-20 text-[var(--muted)] font-sans">Card not found.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <a href="/" className="text-sm text-[var(--accent)] hover:underline font-sans">
                &larr; Back to all cards
              </a>
              <button
                onClick={() => setEditing(!editing)}
                className="px-3 py-1.5 text-sm bg-[var(--border)] hover:bg-[var(--accent)] text-[var(--fg)] rounded font-sans transition-colors"
              >
                {editing ? "Cancel Edit" : "Edit Raw"}
              </button>
            </div>

            {editing ? (
              <div className="space-y-4 border border-[var(--border)] rounded-lg p-4 bg-[var(--card-bg)]">
                <div>
                  <label className="block text-sm text-[var(--muted)] font-sans mb-1">Tag</label>
                  <input
                    type="text"
                    value={editTag}
                    onChange={(e) => setEditTag(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--fg)] font-sans focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--muted)] font-sans mb-1">
                    Evidence HTML{" "}
                    <span className="text-xs">(use &lt;mark&gt; tags for highlighting)</span>
                  </label>
                  <textarea
                    value={editEvidence}
                    onChange={(e) => setEditEvidence(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--fg)] font-mono focus:outline-none focus:border-[var(--accent)] min-h-[300px] resize-y"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 text-sm bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded font-sans transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                      setEditTag(card.tag);
                      setEditEvidence(card.evidence_html);
                      setEditing(false);
                    }}
                    className="px-4 py-2 text-sm bg-[var(--border)] hover:bg-[var(--muted)] text-[var(--fg)] rounded font-sans transition-colors"
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
              <div className="text-xs text-[var(--muted)] font-sans">
                Source:{" "}
                <a
                  href={card.cite_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  {card.cite_url}
                </a>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
