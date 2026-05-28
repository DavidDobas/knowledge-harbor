"use client";

import { useEffect, useRef, useState } from "react";
import ChatMarkdown from "@/components/source/ChatMarkdown";
import type { Message, Question, Source } from "@/lib/types";

interface Props {
  questionId: string;
  onSummarized: () => void;
  initialMessage?: string;
  // Passage + page from the originating PDF selection. Used to render the highlighted
  // context block immediately on mount, before the question row has been fetched —
  // avoids a flicker between PDFSelectionPanel and this panel.
  initialPassage?: string;
  initialPage?: number;
  source?: Source | null;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
      <ChatMarkdown content={content} />
    </div>
  );
}

export default function QuestionPanel({ questionId, onSummarized, initialMessage, initialPassage, initialPage, source }: Props) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true); // whether the view is stuck to the bottom
  const initialSent = useRef(false);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function doSend(content: string) {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), questionId, role: "user", content, createdAt: new Date().toISOString() }]);
    setStreaming(true);
    setStreamBuffer("");

    const res = await fetch(`/api/questions/${questionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value);
      setStreamBuffer(full);
    }

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), questionId, role: "assistant", content: full, createdAt: new Date().toISOString() }]);
    setStreamBuffer("");
    setStreaming(false);
  }

  useEffect(() => {
    fetch(`/api/questions/${questionId}`).then((r) => r.json()).then(setQuestion);
    fetch(`/api/questions/${questionId}/messages`).then((r) => r.json()).then((msgs: Message[]) => {
      setMessages(msgs);
      setMessagesLoaded(true);
      if (msgs.length === 0 && initialMessage && !initialSent.current) {
        initialSent.current = true;
        doSend(initialMessage);
      }
    });
  }, [questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Only auto-scroll if the user hasn't scrolled up to read earlier content.
    if (pinnedRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer]);

  // When a new user message is sent, re-pin to bottom so their message + the reply are visible.
  useEffect(() => {
    if (streaming) pinnedRef.current = true;
  }, [streaming]);

  async function sendMessage() {
    if (!input.trim() || streaming) return;
    const content = input;
    setInput("");
    await doSend(content);
  }

  async function summarize() {
    setSummarizing(true);
    await fetch(`/api/questions/${questionId}/summarize`, { method: "POST" });
    setSummarizing(false);
    onSummarized();
  }

  // Prefer the canonical row once it's loaded; fall back to the props handed in from
  // PDFSelectionPanel so the passage renders on the very first frame after mount.
  const passageText = question?.pdfHighlightText ?? initialPassage ?? null;
  const passagePage = question?.pdfPage ?? initialPage ?? null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b shrink-0 flex items-start justify-between gap-3" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <p className="type-mono text-xs mb-1" style={{ color: "var(--muted)", fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>Thread</p>
          <h2 className="type-serif font-semibold text-sm leading-snug" style={{ color: "var(--foreground)" }}>{question?.title ?? initialMessage ?? ""}</h2>
        </div>
        <button
          onClick={summarize}
          disabled={summarizing || messages.length === 0}
          className="shrink-0 type-mono text-xs px-2.5 py-1 rounded disabled:opacity-40 hover:opacity-70 transition-opacity mt-0.5"
          style={{ color: "#5A7A56", background: "#F0F5EF", border: "1px solid #C8DCC5" }}
          title="Distill this thread into a Knowledge Card node in the graph"
        >
          {summarizing ? "saving…" : "✦ Save as card"}
        </button>
      </div>

      {/* Passage context — mirrors the highlighted block in PDFSelectionPanel and the
          transcript-chunk quote in TranscriptWithChat so the thread view feels continuous
          with where the question was authored. */}
      {passageText && (
        <div className="shrink-0 mx-5 mt-3 mb-1" style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.875rem" }}>
          {passagePage != null && (
            <div className="type-mono mb-1" style={{ fontSize: "0.65rem", letterSpacing: "0.03em", color: "var(--accent)" }}>
              p.{passagePage}
            </div>
          )}
          <p className="text-sm leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
            {passageText}
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 px-5 py-4 flex flex-col gap-5">
        {/* Optimistic first user bubble — shown until the messages fetch lands and doSend
            seeds the real state. Without this there's a blank frame between submission
            and the streaming UI. */}
        {!messagesLoaded && initialMessage && (
          <div className="flex flex-col gap-1">
            <span className="type-mono text-xs" style={{ color: "var(--text-secondary)", fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              You
            </span>
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{initialMessage}</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-1">
            <span
              className="type-mono text-xs"
              style={{ color: m.role === "user" ? "var(--text-secondary)" : "var(--accent)", fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase" }}
            >
              {m.role === "user" ? "You" : "Assistant"}
            </span>
            {m.role === "assistant" ? (
              <MarkdownMessage content={m.content} />
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{m.content}</p>
            )}
          </div>
        ))}

        {streaming && (
          <div className="flex flex-col gap-1">
            <span className="type-mono text-xs" style={{ color: "var(--accent)", fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Assistant
            </span>
            <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
              <ChatMarkdown content={streamBuffer} />
              <span className="animate-pulse ml-0.5" style={{ color: "var(--accent)" }}>▊</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        {(source?.type === "pdf" && question?.includeFile) || question?.includeWeb ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {source?.type === "pdf" && question?.includeFile && (
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border" style={{ background: "var(--accent-light)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)" }}>
                <span style={{ fontSize: "0.85rem" }}>📄</span>
                <span className="type-mono truncate max-w-[260px]" style={{ fontSize: "0.7rem", color: "var(--accent)" }} title={source.title}>
                  {source.title}
                </span>
              </div>
            )}
            {question?.includeWeb && (
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border" style={{ background: "var(--accent-light)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)" }} title="Web search enabled for this thread">
                <span style={{ fontSize: "0.85rem" }}>🌐</span>
                <span className="type-mono" style={{ fontSize: "0.7rem", color: "var(--accent)" }}>
                  Web search
                </span>
              </div>
            )}
          </div>
        ) : null}
        <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Ask a follow-up…"
          disabled={streaming}
          className="flex-1 text-sm px-3 py-2 rounded-lg border outline-none disabled:opacity-50"
          style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />
        <button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg disabled:opacity-40 hover:opacity-90"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z"/>
          </svg>
        </button>
        </div>
      </div>
    </div>
  );
}
