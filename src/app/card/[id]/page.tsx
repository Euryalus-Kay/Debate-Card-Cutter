"use client";

import { useEffect, useState, use } from "react";
import { useApp } from "@/components/AppShell";
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
  const { userName } = useApp();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTag, setEditTag] = useState("");
  const [editEvidence, setEditEvidence] = useState("");

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
        body: JSON.stringify({ tag: editTag, evidence_html: editEvidence }),
      });
      const data = await res.json();
      setCard({ ...card, ...data });
      setEditing(false);
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-[#444] text-sm">Loading...</div>;
  }

  if (!card) {
    return <div className="text-center py-20 text-[#444] text-sm">Card not found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <a href="/" className="text-[13px] text-[#666] hover:text-[#999] transition-colors">
          &larr; Back
        </a>
        <button
          onClick={() => setEditing(!editing)}
          className="text-[13px] text-[#666] hover:text-[#999] transition-colors"
        >
          {editing ? "Cancel" : "Edit raw"}
        </button>
      </div>

      {editing ? (
        <div className="space-y-4 border border-[#1a1a1a] rounded-lg p-4 bg-[#0a0a0a]">
          <div>
            <label className="text-[13px] text-[#666] mb-1.5 block">Tag</label>
            <input
              type="text"
              value={editTag}
              onChange={(e) => setEditTag(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white focus:outline-none focus:border-[#333]"
            />
          </div>
          <div>
            <label className="text-[13px] text-[#666] mb-1.5 block">
              Evidence HTML <span className="text-[11px] text-[#444]">(&lt;mark&gt; = highlight)</span>
            </label>
            <textarea
              value={editEvidence}
              onChange={(e) => setEditEvidence(e.target.value)}
              className="w-full px-3 py-2.5 text-[11px] bg-[#111] border border-[#1a1a1a] rounded-lg text-[#999] font-mono focus:outline-none focus:border-[#333] min-h-[300px] resize-y"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              className="px-4 py-2 text-[13px] bg-white text-black rounded-lg hover:bg-[#e5e5e5] transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditTag(card.tag);
                setEditEvidence(card.evidence_html);
                setEditing(false);
              }}
              className="px-4 py-2 text-[13px] text-[#666] hover:text-[#999] transition-colors"
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
        <p className="text-[11px] text-[#333]">
          Source:{" "}
          <a
            href={card.cite_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#666] hover:text-[#999] underline transition-colors"
          >
            {card.cite_url}
          </a>
        </p>
      )}
    </div>
  );
}
