"use client";

import { useEffect, useRef, useState } from "react";
import ChatMarkdown from "@/components/source/ChatMarkdown";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import ChatInput from "@/components/ui/ChatInput";
import type { Message, Question, Source } from "@/lib/types";

interface Props {
  questionId: string;
  onSummarized: () => void;
  onGraphRefresh?: () => void;
  initialMessage?: string;
  // Passage + page from the originating PDF selection. Used to render the highlighted
  // context block immediately on mount, before the question row has been fetched —
  // avoids a flicker between PDFSelectionPanel and this panel.
  initialPassage?: string;
  initialPage?: number;
  source?: Source | null;
  onPendingMessageSent?: () => void;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
      <ChatMarkdown content={content} />
    </div>
  );
}

export default function QuestionPanel({ questionId, onSummarized, onGraphRefresh, initialMessage, initialPassage, initialPage, source, onPendingMessageSent }: Props) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
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
    setSendError(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), questionId, role: "user", content, createdAt: new Date().toISOString() }]);
    setStreaming(true);
    setStreamBuffer("");

    const res = await fetch(`/api/questions/${questionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
      setSendError("Failed to get a response — try again.");
      return;
    }

    const reader = res.body.getReader();
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

    // Re-fetch the question to pick up the AI-generated title, and refresh the graph node.
    // The title is written to the DB by a background task (~1-2s after creation), so by
    // the time the first response finishes streaming it is reliably available.
    fetch(`/api/questions/${questionId}`).then((r) => r.json()).then(setQuestion).catch(() => {});
    onGraphRefresh?.();
  }

  useEffect(() => {
    fetch(`/api/questions/${questionId}`).then((r) => r.json()).then(setQuestion).catch(() => {});
    fetch(`/api/questions/${questionId}/messages`).then((r) => r.json()).then((msgs: Message[]) => {
      setMessages(msgs);
      setMessagesLoaded(true);
      if (msgs.length === 0 && initialMessage && !initialSent.current) {
        initialSent.current = true;
        onPendingMessageSent?.();
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

  function startEditTitle() {
    setTitleDraft(question?.title ?? "");
    setEditingTitle(true);
    setTimeout(() => { titleInputRef.current?.select(); }, 0);
  }

  async function commitTitle() {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === question?.title) return;
    const res = await fetch(`/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (res.ok) {
      const updated = await res.json();
      setQuestion(updated);
      onGraphRefresh?.();
    }
  }

  async function patchThreadSettings(patch: { includeWeb?: boolean; includeFile?: boolean }) {
    const res = await fetch(`/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) setQuestion(await res.json());
  }

  // Prefer the canonical row once it's loaded; fall back to the props handed in from
  // PDFSelectionPanel so the passage renders on the very first frame after mount.
  const passageText = question?.pdfHighlightText ?? initialPassage ?? null;
  const passagePage = question?.pdfPage ?? initialPage ?? null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b shrink-0 flex items-start justify-between gap-3" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0 flex-1">
          <p className="type-mono text-xs mb-1" style={{ color: "var(--muted)", fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>Thread</p>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                if (e.key === "Escape") { setEditingTitle(false); }
              }}
              className="type-serif font-semibold text-sm leading-snug w-full rounded px-1 -mx-1 outline-none"
              style={{ color: "var(--foreground)", background: "var(--active-row)", border: "1px solid var(--accent)" }}
            />
          ) : (
            <h2
              onClick={startEditTitle}
              title="Click to rename"
              className="type-serif font-semibold text-sm leading-snug cursor-text group/title relative"
              style={{ color: "var(--foreground)" }}
            >
              {question?.title ?? initialMessage ?? ""}
              <span
                className="opacity-0 group-hover/title:opacity-100 transition-opacity ml-1.5 type-mono"
                style={{ fontSize: "0.6rem", color: "var(--muted)", verticalAlign: "middle" }}
              >
                edit
              </span>
            </h2>
          )}
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
              <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
                <ChatMarkdown content={m.content} />
              </div>
            )}
          </div>
        ))}

        {sendError && (
          <p className="text-xs" style={{ color: "#c0392b" }}>{sendError}</p>
        )}
        {streaming && (
          <div className="flex flex-col gap-1">
            <span className="type-mono text-xs" style={{ color: "var(--accent)", fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Assistant
            </span>
            <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
              {streamBuffer ? (
                <ChatMarkdown content={streamBuffer} />
              ) : (
                <span style={{ color: "var(--muted)" }}>Thinking…</span>
              )}
              <span className="animate-pulse ml-0.5" style={{ color: "var(--accent)" }}>▊</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {source?.type === "pdf" && question?.includeFile && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border" style={{ background: "var(--accent-light)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)" }}>
              <span style={{ fontSize: "0.85rem" }}>📄</span>
              <span className="type-mono truncate max-w-[260px]" style={{ fontSize: "0.7rem", color: "var(--accent)" }} title={source.title}>
                {source.title}
              </span>
              <button
                type="button"
                onClick={() => patchThreadSettings({ includeFile: false })}
                className="ml-0.5 hover:opacity-60 transition-opacity"
                style={{ color: "var(--accent)", fontSize: "0.85rem", lineHeight: 1 }}
                title="Remove full-paper context"
                disabled={streaming}
              >
                ×
              </button>
            </div>
          )}
          {source?.type === "pdf" && question && !question.includeFile && (
            <button
              type="button"
              onClick={() => patchThreadSettings({ includeFile: true })}
              disabled={streaming}
              className="type-mono text-xs px-2 py-1 rounded-md border transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--muted)", fontSize: "0.7rem" }}
            >
              + Attach PDF
            </button>
          )}
          {question && (
            <WebSearchToggle
              enabled={question.includeWeb}
              onChange={(v) => patchThreadSettings({ includeWeb: v })}
              disabled={streaming}
            />
          )}
        </div>
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={sendMessage}
          placeholder="Ask a follow-up…"
          disabled={streaming}
        />
      </div>
    </div>
  );
}
