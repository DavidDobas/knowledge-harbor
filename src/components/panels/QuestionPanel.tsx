"use client";

import { useEffect, useRef, useState } from "react";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import ChatInput from "@/components/ui/ChatInput";
import EditableTitle from "@/components/ui/EditableTitle";
import FileChip from "@/components/ui/FileChip";
import PassageQuote from "@/components/ui/PassageQuote";
import { ChatMessage, StreamingMessage } from "@/components/source/ChatMessage";
import { fetchJson } from "@/lib/fetchJson";
import { patchQuestion } from "@/lib/questions";
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

const INIT_MARKER = "\x00INIT\x00";
const SEARCHING_MARKER = "\x00SEARCHING\x00";

export default function QuestionPanel({ questionId, onSummarized, onGraphRefresh, initialMessage, initialPassage, initialPage, source, onPendingMessageSent }: Props) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [webSearching, setWebSearching] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
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
    setWebSearching(false);
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
      const chunk = decoder.decode(value).replaceAll(INIT_MARKER, "");
      if (chunk.includes(SEARCHING_MARKER)) {
        setWebSearching(true);
        full += chunk.replaceAll(SEARCHING_MARKER, "");
      } else {
        if (chunk) setWebSearching(false);
        full += chunk;
      }
      setStreamBuffer(full);
    }

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), questionId, role: "assistant", content: full, createdAt: new Date().toISOString() }]);
    setStreamBuffer("");
    setWebSearching(false);
    setStreaming(false);

    // Re-fetch the question to pick up the AI-generated title, and refresh the graph node.
    // The title is written to the DB by a background task (~1-2s after creation), so by
    // the time the first response finishes streaming it is reliably available.
    fetchJson<Question>(`/api/questions/${questionId}`).then((q) => q && setQuestion(q));
    onGraphRefresh?.();
  }

  useEffect(() => {
    fetchJson<Question>(`/api/questions/${questionId}`).then((q) => q && setQuestion(q));

    if (initialMessage && !initialSent.current) {
      // New thread — no prior messages. Start streaming immediately without waiting for the
      // messages fetch, so the "Thinking…" indicator appears on the very first render.
      initialSent.current = true;
      onPendingMessageSent?.();
      setMessagesLoaded(true);
      doSend(initialMessage);
    } else {
      fetchJson<Message[]>(`/api/questions/${questionId}/messages`).then((msgs) => {
        setMessages(msgs ?? []);
        setMessagesLoaded(true);
      });
    }
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

  async function commitTitle(next: string): Promise<boolean> {
    const updated = await patchQuestion(questionId, { title: next });
    if (!updated) return false;
    setQuestion(updated);
    onGraphRefresh?.();
    return true;
  }

  async function patchThreadSettings(patch: { includeWeb?: boolean; includeFile?: boolean }) {
    const updated = await patchQuestion(questionId, patch);
    if (updated) setQuestion(updated);
  }

  // Prefer the canonical row once it's loaded; fall back to the props handed in from
  // PDFSelectionPanel so the passage renders on the very first frame after mount.
  const passageText = question?.pdfHighlightText ?? initialPassage ?? null;
  const passagePage = question?.pdfPage ?? initialPage ?? null;
  // Show "Generating title…" until the background LLM task replaces the raw question.
  const titlePending = !!initialMessage && (!question || question.title === initialMessage);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b shrink-0 flex items-start justify-between gap-3" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0 flex-1">
          <p className="mono-label mb-1" style={{ color: "var(--muted)" }}>Thread</p>
          <EditableTitle
            value={question?.title ?? initialMessage ?? ""}
            onCommit={commitTitle}
            pending={titlePending}
          />
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

      {/* Passage context — mirrors PDFSelectionPanel / the transcript-chunk quote so the
          thread view feels continuous with where the question was authored. */}
      {passageText && (
        <PassageQuote
          text={passageText}
          label={passagePage != null ? `p.${passagePage}` : undefined}
          className="shrink-0 mx-5 mt-3 mb-1"
        />
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 px-5 py-4 flex flex-col gap-5">
        {/* Optimistic first user bubble — shown until the messages fetch lands and doSend
            seeds the real state. Without this there's a blank frame between submission
            and the streaming UI. */}
        {!messagesLoaded && initialMessage && <ChatMessage role="user" content={initialMessage} />}
        {messages.map((m) => (
          <ChatMessage key={m.id} role={m.role} content={m.content} />
        ))}

        {sendError && <p className="text-xs" style={{ color: "#c0392b" }}>{sendError}</p>}
        {streaming && <StreamingMessage buffer={streamBuffer} webSearching={webSearching} />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {source?.type === "pdf" && question?.includeFile && (
            <FileChip
              title={source.title}
              onRemove={() => patchThreadSettings({ includeFile: false })}
              removeDisabled={streaming}
            />
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
