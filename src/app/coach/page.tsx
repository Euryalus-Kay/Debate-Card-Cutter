"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";
import { JUDGE_PARADIGMS } from "@/lib/judge-paradigms";
import { consumeSSE } from "@/lib/sse-client";
import MarkdownView from "@/components/ui/MarkdownView";
import { BrainIcon, SparkleIcon, GavelIcon } from "@/components/ui/icons";

type Side = "aff" | "neg" | "either";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "How should I structure my 1NC against a heg-good aff?",
  "When should I kick a DA in the block?",
  "What's the cleanest 2NR collapse with CP + politics DA?",
  "How do I answer T-Substantial as aff?",
  "Build me a frontline against the States CP",
  "Coach me through impact calc for K vs case",
  "What's the best 1AR strategy when block goes hard on K?",
  "Explain double-turning on a politics DA",
];

export default function CoachPage() {
  const { userName, resolution, selectedJudgeId, setSelectedJudgeId } = useApp();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [side, setSide] = useState<Side>("either");
  const [prep, setPrep] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!userName) return;
    fetch(`/api/context?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.context) setPrep(data.context);
      })
      .catch(() => {});
  }, [userName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;

    const newMessages: ChatMsg[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          resolution,
          side,
          judgeId: selectedJudgeId,
          prep,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Coach failed");
      }

      let assistantText = "";
      setMessages([...newMessages, { role: "assistant", content: "" }]);

      await consumeSSE(
        res,
        (event, data) => {
          if (event === "message" || event === "data") {
            const d = data as { text?: string; error?: string; done?: boolean };
            if (d.text) {
              assistantText += d.text;
              setMessages([
                ...newMessages,
                { role: "assistant", content: assistantText },
              ]);
            }
            if (d.error) {
              toast.error("Coach error", d.error);
            }
          }
        },
        { signal: controller.signal }
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("Stopped");
      } else {
        toast.error(
          "Coach failed",
          err instanceof Error ? err.message : "Unknown error"
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const stop = () => abortRef.current?.abort();

  const clearChat = () => setMessages([]);

  const judge = selectedJudgeId
    ? JUDGE_PARADIGMS.find((j) => j.id === selectedJudgeId)
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-72px)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-purple), var(--accent-blue))",
            }}
          >
            <BrainIcon size={15} className="text-white" />
          </div>
          <div>
            <h1 className="text-[16px] font-semibold tracking-tight">
              Live Coach
            </h1>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Streamed coaching from a TOC-level lab leader · Powered by Claude Opus 4
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`btn-ghost ${
              showSettings ? "text-white bg-[var(--bg-elev-2)]" : ""
            }`}
          >
            Settings
          </button>
          {messages.length > 0 && (
            <button onClick={clearChat} className="btn-ghost">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="anim-slide-up py-4 border-b border-[var(--border-subtle)] space-y-3">
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1.5">
              Side
            </label>
            <div className="flex gap-1">
              {(["aff", "neg", "either"] as Side[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`px-3 py-1.5 text-[11.5px] rounded-md border transition-colors ${
                    side === s
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                      : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
                  }`}
                >
                  {s === "either" ? "Either" : s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1.5 flex items-center gap-2">
              <GavelIcon size={11} /> Judge paradigm
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedJudgeId(null)}
                className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                  !selectedJudgeId
                    ? "border-[var(--border-strong)] bg-[var(--bg-elev-3)] text-white"
                    : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
                }`}
              >
                None
              </button>
              {JUDGE_PARADIGMS.map((j) => (
                <button
                  key={j.id}
                  onClick={() => setSelectedJudgeId(j.id)}
                  className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                    selectedJudgeId === j.id
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue-glow)] text-white"
                      : "border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-white"
                  }`}
                  title={j.description}
                >
                  {j.emoji} {j.shortName}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] block mb-1.5">
              Prep notes (auto-loaded from your context)
            </label>
            <textarea
              value={prep}
              onChange={(e) => setPrep(e.target.value)}
              className="textarea"
              rows={2}
              placeholder="Affs you're running, neg strats, key cards you have..."
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div
              className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center anim-glow"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-blue) 100%)",
              }}
            >
              <BrainIcon size={28} className="text-white" />
            </div>
            <h2 className="text-[18px] font-semibold text-white mb-2">
              How can I help?
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] max-w-md mb-6">
              Live policy debate coaching. Strategy, prep, round preparation,
              speech construction, judge adaptation — anything debate.
            </p>

            {judge && (
              <div className="surface px-3 py-2 mb-4 text-[11px] text-[var(--text-tertiary)] flex items-center gap-2">
                <span>Tuned for:</span>
                <span className="text-white font-medium">
                  {judge.emoji} {judge.name}
                </span>
                <span>·</span>
                <span>Tech {judge.tech}</span>
                <span>·</span>
                <span>Speed {judge.speedTolerance}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="surface surface-hover p-3 text-left text-[12px] text-[var(--text-secondary)] hover:text-white anim-fade-in"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`chat-bubble ${
                  msg.role === "user" ? "chat-bubble-user" : "chat-bubble-coach"
                }`}
              >
                {msg.role === "assistant" ? (
                  <MarkdownView text={msg.content || ""} />
                ) : (
                  <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                )}
                {streaming &&
                  i === messages.length - 1 &&
                  msg.role === "assistant" && (
                    <span className="inline-block w-1.5 h-4 bg-[var(--accent-blue)] ml-0.5 anim-pulse-soft" />
                  )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border-subtle)] py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about policy debate strategy..."
            rows={1}
            className="textarea"
            style={{ minHeight: "42px", maxHeight: "180px" }}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 180) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          {streaming ? (
            <button onClick={stop} className="btn-danger self-end">
              Stop
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className="btn-primary self-end"
            >
              <SparkleIcon size={12} />
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
