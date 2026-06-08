"use client";

import { useEffect, useRef, useState } from "react";
import ChatMarkdown from "@/components/source/ChatMarkdown";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import { useThreadChat } from "@/hooks/useThreadChat";
import type { Question } from "@/lib/types";
import { formatTime } from "@/lib/utils";

interface Props {
  question: Question;
  passageText?: string | null;
  onBack: () => void;
  onSummarized?: () => void;
}

export default function MobileThreadScreen({ question, passageText, onBack, onSummarized }: Props) {
  const {
    messages,
    includeWeb,
    streaming,
    streamBuffer,
    streamMessage,
    patchIncludeWeb,
  } = useThreadChat(question.id);

  const [followup, setFollowup] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer]);

  async function sendFollowup() {
    if (!followup.trim() || streaming) return;
    const content = followup;
    setFollowup("");
    await streamMessage(content);
  }

  async function summarize() {
    setSummarizing(true);
    await fetch(`/api/questions/${question.id}/summarize`, { method: "POST" });
    setSummarizing(false);
    onSummarized?.();
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <header className="mobile-safe-top shrink-0 flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={onBack} className="mobile-touch-target type-mono text-xs" style={{ color: "var(--accent)" }}>
          ← Back
        </button>
        <h1 className="type-serif font-semibold text-sm flex-1 truncate" style={{ color: "var(--foreground)" }}>
          {question.title}
        </h1>
        <button
          onClick={summarize}
          disabled={summarizing || messages.length === 0}
          className="type-mono text-xs px-2 py-1 rounded disabled:opacity-40"
          style={{ color: "#5A7A56", background: "#F0F5EF", border: "1px solid #C8DCC5" }}
        >
          {summarizing ? "…" : "✦"}
        </button>
      </header>

      {passageText && (
        <div className="shrink-0 mx-4 my-3" style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.875rem" }}>
          {question.chunkOffset != null && (
            <div className="type-mono mb-1" style={{ fontSize: "0.65rem", color: "var(--accent)" }}>
              {formatTime(question.chunkOffset)}
            </div>
          )}
          <p className="text-sm leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
            {passageText}
          </p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-4 flex flex-col gap-4">
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-1">
            <span className="type-mono text-xs" style={{ color: m.role === "user" ? "var(--text-secondary)" : "var(--accent)" }}>
              {m.role === "user" ? "You" : "Assistant"}
            </span>
            {m.role === "assistant" ? (
              <div className="prose-answer text-sm"><ChatMarkdown content={m.content} /></div>
            ) : (
              <p className="text-sm leading-relaxed">{m.content}</p>
            )}
          </div>
        ))}
        {streaming && (
          <div className="flex flex-col gap-1">
            <span className="type-mono text-xs" style={{ color: "var(--accent)" }}>Assistant</span>
            <div className="prose-answer text-sm">
              {streamBuffer ? <ChatMarkdown content={streamBuffer} /> : <span style={{ color: "var(--muted)" }}>Thinking…</span>}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mobile-safe-bottom shrink-0 px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="mb-2">
          <WebSearchToggle enabled={includeWeb} onChange={patchIncludeWeb} />
        </div>
        <div className="flex gap-2">
          <input
            value={followup}
            onChange={(e) => setFollowup(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendFollowup(); } }}
            placeholder="Follow up…"
            className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--background)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={sendFollowup}
            disabled={!followup.trim() || streaming}
            className="mobile-touch-target px-4 rounded-lg type-mono text-xs disabled:opacity-50"
            style={{ background: "var(--foreground)", color: "var(--background)" }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
