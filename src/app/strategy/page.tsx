"use client";

import { useState, useEffect, useRef } from "react";
import { useApp } from "@/components/AppShell";

interface Message {
  role: "user" | "model";
  content: string;
}

const STARTER_PROMPTS = [
  "How should I structure my 1NC against a big-stick heg aff?",
  "When should I kick arguments in the neg block?",
  "How do I answer the States CP as aff?",
  "What's the best 2AR strategy when they go for the K?",
  "How do I beat condo theory as neg?",
  "Explain how to properly extend a DA in the 2NC",
  "What are the strongest answers to T-Substantial?",
  "How do I do impact calculus in the 2NR?",
];

export default function StrategyPage() {
  const { userName } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [resolution, setResolution] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [context, setContext] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load saved context
  useEffect(() => {
    if (!userName) return;
    fetch(`/api/context?user=${encodeURIComponent(userName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.context) setContext(data.context);
      })
      .catch(() => {});

    // Load saved resolution
    const saved = localStorage.getItem("debate_resolution");
    if (saved) setResolution(saved);
  }, [userName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const saveResolution = (res: string) => {
    setResolution(res);
    localStorage.setItem("debate_resolution", res);
  };

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || streaming) return;

    const userMsg: Message = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          context,
          resolution,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages([...newMessages, { role: "model", content: "" }]);

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) {
                  assistantText += data.text;
                  setMessages([
                    ...newMessages,
                    { role: "model", content: assistantText },
                  ]);
                }
                if (data.error) {
                  assistantText += `\n\n⚠️ Error: ${data.error}`;
                  setMessages([
                    ...newMessages,
                    { role: "model", content: assistantText },
                  ]);
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "model",
          content: `Error: ${err instanceof Error ? err.message : "Failed to reach strategy AI"}`,
        },
      ]);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-1 py-3 border-b border-[#1a1a1a]">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Debate Strategist
          </h1>
          <p className="text-[11px] text-[#555] mt-0.5">
            AI debate coach powered by Gemini · Ask anything about policy debate
            strategy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`px-3 py-1.5 text-[11px] rounded-lg border transition-colors ${
              showSettings
                ? "border-blue-500/50 text-blue-400 bg-blue-950/30"
                : "border-[#1a1a1a] text-[#888] hover:text-white hover:border-[#333]"
            }`}
          >
            Settings
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="px-3 py-1.5 text-[11px] text-[#888] hover:text-white border border-[#1a1a1a] hover:border-[#333] rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-1 py-3 border-b border-[#1a1a1a] space-y-3">
          <div>
            <label className="text-[11px] text-[#888] block mb-1">
              Resolution
            </label>
            <input
              type="text"
              value={resolution}
              onChange={(e) => saveResolution(e.target.value)}
              placeholder="e.g., Resolved: The United States federal government should substantially..."
              className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#444] focus:outline-none focus:border-[#333]"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#888] block mb-1">
              Your debate context (auto-loaded from profile)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g., Running a copyright reform aff, prepping for TOC..."
              className="w-full px-3 py-2 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-lg text-white placeholder:text-[#444] focus:outline-none focus:border-[#333] min-h-[60px] resize-y"
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-1 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-[40px] mb-4">🎯</div>
            <h2 className="text-[15px] font-medium text-white mb-2">
              Debate Strategy AI
            </h2>
            <p className="text-[13px] text-[#888] max-w-md mb-8">
              Ask about argument strategy, speech structure, round management,
              evidence comparison, judge adaptation, or anything debate.
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-xl w-full">
              {STARTER_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  className="px-3 py-2.5 text-left text-[12px] text-[#999] bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg hover:border-[#333] hover:text-white transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-xl text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-[#111] border border-[#1a1a1a] text-[#ddd]"
              }`}
            >
              {msg.role === "model" ? (
                <div
                  className="prose prose-invert prose-sm max-w-none [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_p]:text-[13px] [&_li]:text-[13px] [&_strong]:text-white [&_code]:text-amber-300 [&_code]:bg-[#1a1a1a] [&_code]:px-1 [&_code]:rounded"
                  dangerouslySetInnerHTML={{
                    __html: formatMarkdown(msg.content),
                  }}
                />
              ) : (
                <span>{msg.content}</span>
              )}
              {streaming && i === messages.length - 1 && msg.role === "model" && (
                <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 animate-pulse" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#1a1a1a] px-1 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about debate strategy..."
            rows={1}
            className="flex-1 px-4 py-2.5 text-[13px] bg-[#111] border border-[#1a1a1a] rounded-xl text-white placeholder:text-[#555] focus:outline-none focus:border-[#333] resize-none"
            style={{ minHeight: "42px", maxHeight: "120px" }}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={streaming || !input.trim()}
            className="px-5 py-2.5 bg-white text-black text-[13px] font-medium rounded-xl hover:bg-[#e5e5e5] disabled:opacity-30 transition-colors self-end"
          >
            {streaming ? "..." : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/^### (.*$)/gm, '<h3 style="margin:12px 0 4px;">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 style="margin:16px 0 6px;">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 style="margin:16px 0 6px;">$1</h1>')
    .replace(/^- (.*$)/gm, '<li style="margin:2px 0;padding-left:4px;">$1</li>')
    .replace(
      /(<li.*<\/li>\n?)+/g,
      (m) => `<ul style="list-style:disc;padding-left:20px;margin:4px 0;">${m}</ul>`
    )
    .replace(/^\d+\. (.*$)/gm, '<li style="margin:2px 0;">$1</li>')
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}
