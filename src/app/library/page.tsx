"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import { consumeSSE } from "@/lib/sse-client";
import CardDisplay from "@/components/CardDisplay";
import FolderView from "@/components/FolderView";
import {
  BookIcon,
  SearchIcon,
  SparkleIcon,
  ZapIcon,
} from "@/components/ui/icons";

interface Card {
  id: string;
  tag: string;
  cite: string;
  cite_author: string;
  cite_year: string;
  evidence_html: string;
  author_name: string;
  library_id: string | null;
  argument_id: string | null;
  created_at: string;
}

interface ArgumentComponent {
  index: number;
  type: string;
  label: string;
  purpose: string;
  id?: string;
  tag?: string;
  cite?: string;
  cite_author?: string;
  evidence_html?: string;
  content?: string;
  sectionHeader?: string;
}

interface Argument {
  id: string;
  title: string;
  description: string;
  author_name: string;
  card_ids: string[];
  argument_type?: string;
  strategy_overview?: string;
  file_notes?: string;
  components?: ArgumentComponent[];
  created_at: string;
}

interface UploadProgressState {
  label: string;
  percent: number;
  step: string;
  chunkDone?: number;
  chunkTotal?: number;
  cardsExtracted?: number;
  cardsSaved?: number;
  cardsTotal?: number;
  eta?: number | null;
  elapsed?: number;
}

function shortTag(tag: string, max = 80): string {
  if (tag.length <= max) return tag;
  return tag.substring(0, max - 3) + "...";
}

function authorShort(cite: string): string {
  const parenIdx = cite.indexOf("(");
  if (parenIdx > 0) return cite.substring(0, parenIdx).trim();
  return cite.substring(0, 30);
}

function typeColor(t?: string): string {
  switch (t) {
    case "aff":
      return "badge-blue";
    case "da":
      return "badge-red";
    case "cp":
      return "badge-green";
    case "k":
      return "badge-purple";
    case "t":
      return "badge-amber";
    case "theory":
      return "badge-pink";
    default:
      return "badge-neutral";
  }
}

function typeLabel(t?: string): string {
  switch (t) {
    case "aff":
      return "AFF";
    case "da":
      return "DA";
    case "cp":
      return "CP";
    case "k":
      return "K";
    case "t":
      return "T";
    case "theory":
      return "Th";
    default:
      return "Custom";
  }
}

export default function LibraryPage() {
  const { userName } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<"cards" | "arguments">("cards");
  const [viewMode, setViewMode] = useState<"list" | "folders">("list");
  const [cards, setCards] = useState<Card[]>([]);
  const [arguments_, setArguments] = useState<Argument[]>([]);
  const [argCards, setArgCards] = useState<Record<string, Card[]>>({});
  const [search, setSearch] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [argTypeFilter, setArgTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadState, setUploadState] = useState<UploadProgressState | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [expandedArgId, setExpandedArgId] = useState<string | null>(null);
  const [iteratingId, setIteratingId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadCards = useCallback(async () => {
    const res = await fetch(`/api/library/search?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    setCards(data || []);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then(async (allCards: Card[]) => {
        const argRes = await fetch("/api/argument?list=true");
        if (argRes.ok) {
          const args = await argRes.json();
          setArguments(args || []);
          const grouped: Record<string, Card[]> = {};
          for (const card of allCards) {
            if (card.argument_id) {
              if (!grouped[card.argument_id]) grouped[card.argument_id] = [];
              grouped[card.argument_id].push(card);
            }
          }
          setArgCards(grouped);
        }
      })
      .catch(() => {});
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadState({
      label: "Starting upload...",
      percent: 0,
      step: "init",
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("collection_name", file.name.replace(/\.[^.]+$/, ""));
    formData.append("uploaded_by", userName);

    try {
      const res = await fetch("/api/library/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }

      await consumeSSE(res, (event, data) => {
        if (event === "progress") {
          const d = data as UploadProgressState;
          setUploadState((prev) => ({ ...prev, ...d }));
        } else if (event === "done") {
          const d = data as { count: number; elapsed?: number };
          setUploadState({
            label: `✓ Imported ${d.count} cards in ${d.elapsed || "?"}s`,
            percent: 100,
            step: "done",
          });
          toast.success(`Imported ${d.count} cards`, file.name);
          loadCards();
          fetch("/api/argument?list=true")
            .then((r) => r.json())
            .then((args) => setArguments(args || []))
            .catch(() => {});
        } else if (event === "error") {
          const d = data as { message?: string };
          toast.error("Upload failed", d.message || "Unknown error");
          setUploadState({
            label: `✕ ${d.message || "Upload failed"}`,
            percent: 0,
            step: "error",
          });
        }
      });
    } catch (err) {
      toast.error(
        "Upload failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setUploading(false);
      setTimeout(() => setUploadState(null), 6000);
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
      if (data.tag && data.evidence_html) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId
              ? { ...c, tag: data.tag, evidence_html: data.evidence_html }
              : c
          )
        );
        toast.success("Card updated");
      } else if (data.error) {
        toast.error("Iterate failed", data.error);
      }
    } catch {
      toast.error("Iterate failed");
    } finally {
      setIteratingId(null);
    }
  };

  const handleDelete = async (cardId: string) => {
    if (!confirm("Delete this card?")) return;
    await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setExpandedCardId(null);
    toast.info("Card deleted");
  };

  const handleVerify = async (cardId: string) => {
    setVerifying(cardId);
    try {
      const res = await fetch("/api/verify-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, includeRelated: true }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error("Verify failed", data.error);
      } else {
        const v = data.verification;
        const summary = v.citationConfirmed
          ? "Citation confirmed"
          : "Citation could not be confirmed";
        toast.info(
          summary,
          `${data.related?.length || 0} related sources surfaced`
        );
      }
    } catch {
      toast.error("Verify failed");
    } finally {
      setVerifying(null);
    }
  };

  const copyArgument = (arg: Argument, argCardList: Card[]) => {
    const html = argCardList
      .map((c) => {
        const evidence = c.evidence_html
          .replace(
            /<mark>/g,
            '</span><b><u><span style="font-family:Georgia,serif;font-size:11px;">'
          )
          .replace(
            /<\/mark>/g,
            '</span></u></b><span style="font-family:Georgia,serif;font-size:8px;color:#666;">'
          );
        return (
          `<p style="font-family:Georgia,serif;font-size:13px;font-weight:bold;margin:12px 0 4px 0;">${c.tag}</p>` +
          `<p style="font-family:Georgia,serif;font-size:11px;margin:0 0 4px 0;">${c.cite}</p>` +
          `<p style="font-family:Georgia,serif;font-size:8px;color:#666;margin:0 0 8px 0;line-height:1.4;"><span style="font-size:8px;color:#666;">${evidence}</span></p>`
        );
      })
      .join("");
    navigator.clipboard
      .write([
        new ClipboardItem({
          "text/html": new Blob(
            [
              `<p style="font-family:Georgia,serif;font-size:16px;font-weight:bold;text-align:center;">${arg.title}</p>` +
                html,
            ],
            { type: "text/html" }
          ),
          "text/plain": new Blob(
            [argCardList.map((c) => c.tag).join("\n\n")],
            { type: "text/plain" }
          ),
        }),
      ])
      .then(() => toast.success("Argument copied", "Paste into Google Docs"));
  };

  // Derive filter options
  const allAuthors = Array.from(new Set(cards.map((c) => c.author_name).filter(Boolean))).sort();
  const allYears = Array.from(new Set(cards.map((c) => c.cite_year).filter(Boolean))).sort().reverse();
  const allArgTypes = Array.from(new Set(arguments_.map((a) => a.argument_type).filter(Boolean)));

  const filteredCards = cards.filter((c) => {
    if (authorFilter !== "all" && c.author_name !== authorFilter) return false;
    if (yearFilter !== "all" && c.cite_year !== yearFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.tag.toLowerCase().includes(q) ||
      c.cite.toLowerCase().includes(q) ||
      c.author_name.toLowerCase().includes(q)
    );
  });

  const filteredArgs = arguments_.filter((a) => {
    if (argTypeFilter !== "all" && a.argument_type !== argTypeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Compact header with inline counts and upload */}
      <div className="flex items-center justify-between gap-3 flex-wrap anim-fade-in">
        <div className="flex items-center gap-3">
          <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-2">
            <BookIcon size={18} className="text-[var(--accent-cyan)]" />
            Library
          </h1>
          <span className="text-[11px] text-[var(--text-tertiary)]">
            {cards.length} cards · {arguments_.length} arguments
          </span>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.pdf,.txt"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-primary"
          >
            <ZapIcon size={12} />
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>

      {/* Upload progress */}
      {uploadState && (
        <div
          className={`surface-elev p-4 anim-slide-up ${
            uploadState.step === "error"
              ? "border-l-2 border-[var(--accent-red)]"
              : uploadState.step === "done"
              ? "border-l-2 border-[var(--accent-green)]"
              : "border-l-2 border-[var(--accent-blue)]"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {uploadState.step !== "done" && uploadState.step !== "error" && (
                <span className="spinner" />
              )}
              <span className="text-[12.5px] font-medium text-white">
                {uploadState.label}
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
              {Math.round(uploadState.percent)}%
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${uploadState.percent}%` }}
            />
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10.5px] text-[var(--text-tertiary)] flex-wrap">
            {uploadState.chunkDone !== undefined && uploadState.chunkTotal && (
              <span>
                Chunks: {uploadState.chunkDone}/{uploadState.chunkTotal}
              </span>
            )}
            {uploadState.cardsExtracted !== undefined && (
              <span>Extracted: {uploadState.cardsExtracted}</span>
            )}
            {uploadState.cardsSaved !== undefined &&
              uploadState.cardsTotal !== undefined && (
                <span>
                  Saved: {uploadState.cardsSaved}/{uploadState.cardsTotal}
                </span>
              )}
            {uploadState.eta && (
              <span className="text-[var(--accent-amber)]">
                ~{uploadState.eta}s remaining
              </span>
            )}
            {uploadState.elapsed !== undefined && (
              <span className="ml-auto">{uploadState.elapsed}s elapsed</span>
            )}
          </div>
        </div>
      )}

      {/* Sticky toolbar — tabs + search + filters all in one row.
          Stays visible while you scroll the card list. */}
      <div
        className="sticky top-12 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-2 glass-strong border-b border-[var(--border-subtle)]"
        style={{ backdropFilter: "blur(12px) saturate(140%)" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tabs as compact pill buttons */}
          <div className="flex bg-[var(--bg-elev-1)] border border-[var(--border-default)] rounded-md p-0.5">
            <button
              onClick={() => setTab("cards")}
              className={`px-3 py-1 text-[11.5px] rounded transition-colors ${
                tab === "cards"
                  ? "bg-[var(--bg-elev-3)] text-white"
                  : "text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              Cards{" "}
              <span className="text-[var(--text-faint)]">
                {filteredCards.length}
              </span>
            </button>
            <button
              onClick={() => setTab("arguments")}
              className={`px-3 py-1 text-[11.5px] rounded transition-colors ${
                tab === "arguments"
                  ? "bg-[var(--bg-elev-3)] text-white"
                  : "text-[var(--text-tertiary)] hover:text-white"
              }`}
            >
              Arguments{" "}
              <span className="text-[var(--text-faint)]">
                {filteredArgs.length}
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "cards"
                  ? "Search by tag, author, citation..."
                  : "Search arguments..."
              }
              className="input"
              style={{ paddingLeft: "28px", paddingTop: "6px", paddingBottom: "6px" }}
            />
          </div>

          {tab === "cards" && (
            <>
              {allAuthors.length > 0 && (
                <select
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                  className="input"
                  style={{ width: "auto", paddingTop: "6px", paddingBottom: "6px" }}
                >
                  <option value="all">All authors</option>
                  {allAuthors.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              )}
              {allYears.length > 0 && (
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="input"
                  style={{ width: "auto", paddingTop: "6px", paddingBottom: "6px" }}
                >
                  <option value="all">Year</option>
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      &apos;{y}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex bg-[var(--bg-elev-1)] border border-[var(--border-default)] rounded-md p-0.5">
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    viewMode === "list"
                      ? "bg-[var(--bg-elev-3)] text-white"
                      : "text-[var(--text-tertiary)]"
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode("folders")}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    viewMode === "folders"
                      ? "bg-[var(--bg-elev-3)] text-white"
                      : "text-[var(--text-tertiary)]"
                  }`}
                >
                  Folders
                </button>
              </div>
            </>
          )}

          {tab === "arguments" && allArgTypes.length > 0 && (
            <select
              value={argTypeFilter}
              onChange={(e) => setArgTypeFilter(e.target.value)}
              className="input"
              style={{ width: "auto", paddingTop: "6px", paddingBottom: "6px" }}
            >
              <option value="all">All types</option>
              {allArgTypes.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          )}

          {/* Clear filters when any are active */}
          {(authorFilter !== "all" ||
            yearFilter !== "all" ||
            argTypeFilter !== "all" ||
            search) && (
            <button
              onClick={() => {
                setSearch("");
                setAuthorFilter("all");
                setYearFilter("all");
                setArgTypeFilter("all");
              }}
              className="text-[10.5px] text-[var(--text-faint)] hover:text-white px-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Folder view */}
      {tab === "cards" && viewMode === "folders" && (
        <FolderView
          cards={cards.map((c) => ({
            id: c.id,
            tag: c.tag,
            cite_author: c.cite_author,
            cite_year: c.cite_year,
            cite: c.cite,
            evidence_html: c.evidence_html,
          }))}
          userName={userName}
          onCardClick={(id) =>
            setExpandedCardId(expandedCardId === id ? null : id)
          }
        />
      )}

      {/* Cards grid */}
      {tab === "cards" && viewMode === "list" && (
        <>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="surface shimmer"
                  style={{ height: "84px" }}
                />
              ))}
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="surface text-center py-12 text-[12.5px] text-[var(--text-tertiary)]">
              No cards match. Upload a file or cut a card.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {filteredCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() =>
                      setExpandedCardId(
                        expandedCardId === card.id ? null : card.id
                      )
                    }
                    className={`text-left p-2.5 rounded-lg border transition-all ${
                      expandedCardId === card.id
                        ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-elev-1)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elev-2)]"
                    }`}
                  >
                    <div
                      className="text-[11px] font-semibold text-white leading-tight mb-1.5 line-clamp-3"
                      style={{ fontFamily: "Georgia, serif" }}
                    >
                      {shortTag(card.tag, 70)}
                    </div>
                    <div
                      className="text-[10px] text-[var(--text-tertiary)] leading-tight mb-1.5"
                      style={{ fontFamily: "Georgia, serif" }}
                    >
                      {authorShort(card.cite)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-[var(--text-faint)]">
                        {card.author_name}
                      </span>
                      <span className="text-[9px] text-[var(--text-faint)]">
                        {new Date(card.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {expandedCardId &&
                (() => {
                  const card = filteredCards.find((c) => c.id === expandedCardId);
                  if (!card) return null;
                  return (
                    <div className="mt-3 anim-fade-in">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => handleVerify(card.id)}
                          disabled={verifying === card.id}
                          className="btn-ghost"
                        >
                          {verifying === card.id ? (
                            <>
                              <span className="spinner" /> Verifying...
                            </>
                          ) : (
                            <>
                              <SparkleIcon size={11} /> Verify online
                            </>
                          )}
                        </button>
                      </div>
                      <CardDisplay
                        id={card.id}
                        tag={card.tag}
                        cite={card.cite}
                        citeAuthor={card.cite_author}
                        evidenceHtml={card.evidence_html}
                        authorName={card.author_name}
                        createdAt={card.created_at}
                        onIterate={(instr) => handleIterate(card.id, instr)}
                        onDelete={() => handleDelete(card.id)}
                        isLoading={iteratingId === card.id}
                      />
                    </div>
                  );
                })()}
            </>
          )}
        </>
      )}

      {/* Arguments tab */}
      {tab === "arguments" && (
        <>
          {filteredArgs.length === 0 ? (
            <div className="surface text-center py-12">
              <p className="text-[12.5px] text-[var(--text-tertiary)] mb-1">
                No arguments yet
              </p>
              <p className="text-[11px] text-[var(--text-faint)]">
                Build arguments from /argument or upload a debate file.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredArgs.map((arg) => {
                const isExpanded = expandedArgId === arg.id;
                const argCardList = argCards[arg.id] || [];

                return (
                  <div
                    key={arg.id}
                    className="surface overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedArgId(isExpanded ? null : arg.id)
                      }
                      className="w-full text-left px-4 py-3 hover:bg-[var(--bg-elev-2)] transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {arg.argument_type && (
                            <span className={`badge ${typeColor(arg.argument_type)}`}>
                              {typeLabel(arg.argument_type)}
                            </span>
                          )}
                          <h3 className="text-[14px] font-semibold text-white truncate">
                            {arg.title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="badge badge-neutral">
                            {argCardList.length} cards
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                confirm(
                                  `Delete "${arg.title}"? Cards stay in the library.`
                                )
                              ) {
                                fetch("/api/argument", {
                                  method: "DELETE",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: arg.id }),
                                }).then(() => {
                                  setArguments((prev) =>
                                    prev.filter((a) => a.id !== arg.id)
                                  );
                                });
                              }
                            }}
                            className="text-[10px] text-[var(--text-faint)] hover:text-[var(--accent-red)] px-1.5 py-0.5 rounded"
                            title="Delete argument"
                          >
                            ✕
                          </button>
                          <span
                            className="text-[var(--text-tertiary)] transition-transform"
                            style={{
                              transform: isExpanded
                                ? "rotate(90deg)"
                                : "rotate(0)",
                            }}
                          >
                            ▶
                          </span>
                        </div>
                      </div>
                      <p className="text-[11.5px] text-[var(--text-tertiary)] line-clamp-2">
                        {arg.description}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-[var(--text-faint)]">
                          by {arg.author_name}
                        </span>
                        <span className="text-[10px] text-[var(--text-faint)]">
                          {new Date(arg.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-[var(--border-subtle)]">
                        {(arg.file_notes || arg.strategy_overview) && (
                          <div className="px-4 py-3 bg-[var(--bg-elev-1)] border-b border-[var(--border-subtle)]">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--text-faint)] mb-1">
                              Strategy notes
                            </div>
                            <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
                              {arg.file_notes || arg.strategy_overview}
                            </p>
                          </div>
                        )}

                        <div className="p-4 space-y-3">
                          {argCardList.length === 0 ? (
                            <p className="text-[11.5px] text-[var(--text-tertiary)]">
                              No cards linked to this argument.
                            </p>
                          ) : (
                            argCardList.map((card) => (
                              <CardDisplay
                                key={card.id}
                                id={card.id}
                                tag={card.tag}
                                cite={card.cite}
                                citeAuthor={card.cite_author}
                                evidenceHtml={card.evidence_html}
                                authorName={card.author_name}
                                createdAt={card.created_at}
                                onIterate={(instr) =>
                                  handleIterate(card.id, instr)
                                }
                                isLoading={iteratingId === card.id}
                              />
                            ))
                          )}

                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => copyArgument(arg, argCardList)}
                              className="btn-secondary"
                            >
                              Copy complete argument
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
