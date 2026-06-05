"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseTranscript, type TranscriptSegment } from "@/lib/youtube";
import { formatTime } from "@/lib/utils";
import ChatMarkdown from "@/components/source/ChatMarkdown";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import SummaryView from "@/components/source/SummaryView";
import NotesView, { type NotesViewHandle } from "@/components/source/NotesView";
import { useSourceNotes } from "@/hooks/useSourceNotes";
import type { Message } from "@/lib/types";

type Tab = "transcript" | "summary" | "notes";
type View = "transcript" | "chat";

interface DisplayChunk {
  text: string;
  offset: number;
  segStart: number;
  segEnd: number;
}

function groupIntoChunks(segments: TranscriptSegment[]): DisplayChunk[] {
  const chunks: DisplayChunk[] = [];
  let i = 0;
  while (i < segments.length) {
    const start = i;
    let text = "";
    while (i < segments.length) {
      text += (text ? " " : "") + segments[i].text;
      i++;
      if (/[.?!]\s*$/.test(text.trim()) && text.length >= 200) break;
      if (text.length >= 800) break;
    }
    chunks.push({ text, offset: segments[start].offset, segStart: start, segEnd: i - 1 });
  }
  return chunks;
}

function fmtSegs(segments: TranscriptSegment[], from: number, to: number): string {
  return segments.slice(from, to + 1).map((s) => `[${formatTime(s.offset)}] ${s.text}`).join("\n");
}

function buildContext(segments: TranscriptSegment[], chunks: DisplayChunk[], chunkIdx: number): string {
  const chunk = chunks[chunkIdx];
  const current = fmtSegs(segments, chunk.segStart, chunk.segEnd);

  // Up to 2 preceding chunks, kept separate so the LLM knows what's actually being asked about.
  const precFrom = Math.max(0, chunkIdx - 2);
  let preceding = "";
  if (precFrom < chunkIdx) {
    preceding = fmtSegs(segments, chunks[precFrom].segStart, chunks[chunkIdx - 1].segEnd);
  }

  const parts: string[] = [];
  if (preceding) parts.push(`### PRECEDING CONTEXT (for reference only)\n${preceding}`);
  parts.push(`### CURRENT PASSAGE (the question is about THIS)\n${current}`);
  return parts.join("\n\n");
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase().trim();
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let idx = lower.indexOf(q);
  let key = 0;
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <mark key={key++} style={{ background: "var(--accent-light)", color: "var(--accent)", borderRadius: "2px", padding: "0 1px" }}>
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    lastIdx = idx + q.length;
    idx = lower.indexOf(q, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

interface Props {
  sourceId: string;
  rawTranscript: string;
  activeChunkIdx: number;
  onSeekTo: (ms: number) => void;
  onGraphRefresh: () => void;
  viewMode: "graph" | "viewer";
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
  // Called after a successful retry of the transcript fetch so the parent can update
  // `activeSource.transcript` — keeps the YouTube player (CenterPane) and chat context in sync.
  onTranscriptUpdated?: (transcript: string) => void;
  initialSummary?: string | null;
  // When a question node is selected in the graph, open that thread in the chat view
  // (so it shows the same transcript-chunk view it was created with).
  externalQuestionId?: string | null;
  onCloseThread?: () => void;
}

export default function TranscriptWithChat({ sourceId, rawTranscript, activeChunkIdx, onSeekTo, onGraphRefresh, viewMode, onOpenThread, onOpenSource, onTranscriptUpdated, initialSummary, externalQuestionId, onCloseThread }: Props) {
  // Notes is the default tab. We intentionally do NOT auto-switch to Transcript when the
  // video viewer opens — the user prefers to stay on Notes while watching/playing.
  // Initial value still respects viewMode so a fresh mount in viewer mode starts on Transcript.
  const [tab, setTab] = useState<Tab>(viewMode === "viewer" ? "transcript" : "notes");
  const [view, setView] = useState<View>("transcript");

  // Transcript state
  const [chunkQuestions, setChunkQuestions] = useState<Record<number, string>>({});
  const [userScrolling, setUserScrolling] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchCursor, setSearchMatchCursor] = useState(0);
  const [threadsOnly, setThreadsOnly] = useState(false);
  const [transcriptRetrying, setTranscriptRetrying] = useState(false);
  const [transcriptRetryError, setTranscriptRetryError] = useState<string | null>(null);

  // Chat state
  const [activeQuestionChunkIdx, setActiveQuestionChunkIdx] = useState<number | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [questionInput, setQuestionInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [followupInput, setFollowupInput] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [newThreadIncludeWeb, setNewThreadIncludeWeb] = useState(false);
  const [threadIncludeWebState, setThreadIncludeWebState] = useState<{ questionId: string | null; includeWeb: boolean }>({
    questionId: null,
    includeWeb: false,
  });

  // Notes state
  const { notes, loaded: notesLoaded, setNotes } = useSourceNotes(sourceId);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesEditorRef = useRef<NotesViewHandle | null>(null);

  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatPinnedRef = useRef(true); // whether the chat is stuck to the bottom

  function handleChatScroll() {
    const el = chatScrollRef.current;
    if (!el) return;
    chatPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const segments = useMemo(() => (rawTranscript ? parseTranscript(rawTranscript) : []), [rawTranscript]);
  const chunks = useMemo(() => groupIntoChunks(segments), [segments]);

  // Load persisted questions
  useEffect(() => {
    fetch(`/api/questions?sourceId=${sourceId}`)
      .then((r) => r.json())
      .then((qs: Array<{ id: string; chunkOffset: number | null }>) => {
        const map: Record<number, string> = {};
        qs.forEach((q) => {
          if (q.chunkOffset == null) return;
          const ci = chunks.findIndex((c) => c.offset === q.chunkOffset);
          if (ci >= 0) map[ci] = q.id;
        });
        setChunkQuestions(map);
      })
      .catch(() => {});
  }, [sourceId, chunks]);

  const threadQuestionId = externalQuestionId ?? activeQuestionId;
  const threadChunkIdx = externalQuestionId
    ? (() => {
        const entry = Object.entries(chunkQuestions).find(([, qid]) => qid === externalQuestionId);
        return entry ? Number(entry[0]) : null;
      })()
    : activeQuestionChunkIdx;
  const threadView: View = externalQuestionId ? "chat" : view;

  // Load messages when opening an existing thread
  const [messagesState, setMessagesState] = useState<{ questionId: string | null; messages: Message[] }>({
    questionId: null,
    messages: [],
  });
  const messages = threadQuestionId && messagesState.questionId === threadQuestionId
    ? messagesState.messages
    : [];

  useEffect(() => {
    if (!threadQuestionId) return;
    let cancelled = false;
    fetch(`/api/questions/${threadQuestionId}/messages`)
      .then((r) => r.json())
      .then((msgs: Message[]) => {
        if (!cancelled) setMessagesState({ questionId: threadQuestionId, messages: msgs });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [threadQuestionId]);

  const threadIncludeWeb =
    threadQuestionId && threadIncludeWebState.questionId === threadQuestionId
      ? threadIncludeWebState.includeWeb
      : false;

  useEffect(() => {
    if (!threadQuestionId) return;
    let cancelled = false;
    fetch(`/api/questions/${threadQuestionId}`)
      .then((r) => r.json())
      .then((q: { includeWeb?: boolean }) => {
        if (!cancelled) {
          setThreadIncludeWebState({ questionId: threadQuestionId, includeWeb: q.includeWeb === true });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [threadQuestionId]);

  async function patchThreadIncludeWeb(enabled: boolean) {
    if (!threadQuestionId) return;
    const res = await fetch(`/api/questions/${threadQuestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeWeb: enabled }),
    });
    if (res.ok) setThreadIncludeWebState({ questionId: threadQuestionId, includeWeb: enabled });
  }

  // Scroll chat to bottom on update — but only if the user hasn't scrolled up to read earlier.
  useEffect(() => {
    if (chatPinnedRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesState, streamBuffer]);

  // Re-pin to the bottom whenever a new message round starts streaming.
  useEffect(() => {
    if (streaming) chatPinnedRef.current = true;
  }, [streaming]);

  function handleNotesChange(value: string) {
    setNotes(value);
    setNotesSaveError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setNotesSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sources/${sourceId}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        });
        if (!res.ok) {
          const sizeKB = Math.round(new Blob([value]).size / 1024);
          if (res.status === 413) {
            setNotesSaveError(`Notes too large (${sizeKB} KB). Remove some images to save.`);
          } else {
            setNotesSaveError(`Save failed (HTTP ${res.status}).`);
          }
          console.error("[notes] save failed", res.status, await res.text().catch(() => ""));
        }
      } catch (err) {
        setNotesSaveError("Save failed — check connection.");
        console.error("[notes] save error", err);
      } finally {
        setNotesSaving(false);
      }
    }, 1200);
  }

  function handleCite(ci: number) {
    notesEditorRef.current?.insertCitation(chunks[ci].offset);
    setTab("notes");
  }

  async function streamMessage(questionId: string, content: string) {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      questionId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessagesState((prev) => ({
      questionId,
      messages: [...(prev.questionId === questionId ? prev.messages : []), userMsg],
    }));
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

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      questionId,
      role: "assistant",
      content: full,
      createdAt: new Date().toISOString(),
    };
    setMessagesState((prev) => ({
      questionId,
      messages: [...(prev.questionId === questionId ? prev.messages : []), assistantMsg],
    }));
    setStreamBuffer("");
    setStreaming(false);
  }

  const filteredItems = useMemo(() => {
    return chunks
      .map((chunk, ci) => ({ chunk, ci }))
      .filter(({ chunk, ci }) => {
        if (threadsOnly && !chunkQuestions[ci]) return false;
        if (searchQuery.trim() && !chunk.text.toLowerCase().includes(searchQuery.toLowerCase().trim())) return false;
        return true;
      });
  }, [chunks, chunkQuestions, searchQuery, threadsOnly]);

  useEffect(() => {
    if (view !== "transcript" || tab !== "transcript") return;
    if (activeChunkIdx >= 0 && !userScrolling && chunkRefs.current[activeChunkIdx]) {
      chunkRefs.current[activeChunkIdx]!.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeChunkIdx, userScrolling, view, tab]);

  useEffect(() => {
    if (threadView === "chat" && threadQuestionId === null) {
      setTimeout(() => inputRef.current?.focus(), 320);
    }
  }, [threadView, threadQuestionId]);

  const handleScroll = useCallback(() => {
    setUserScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setUserScrolling(false), 4000);
  }, []);

  function scrollToActive() {
    if (activeChunkIdx >= 0 && chunkRefs.current[activeChunkIdx]) {
      chunkRefs.current[activeChunkIdx]!.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setUserScrolling(false);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
  }

  function navigateMatch(dir: -1 | 1) {
    if (filteredItems.length === 0) return;
    const next = (searchMatchCursor + dir + filteredItems.length) % filteredItems.length;
    setSearchMatchCursor(next);
    const item = filteredItems[next];
    if (item && chunkRefs.current[item.ci]) {
      chunkRefs.current[item.ci]!.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function retryTranscript() {
    if (transcriptRetrying) return;
    setTranscriptRetrying(true);
    setTranscriptRetryError(null);
    try {
      const res = await fetch(`/api/sources/${sourceId}/transcript`);
      const data = (await res.json()) as { transcript?: string | null; error?: string };
      if (data.transcript) {
        onTranscriptUpdated?.(data.transcript);
      } else {
        setTranscriptRetryError(data.error ?? "Transcript unavailable for this video.");
      }
    } catch {
      setTranscriptRetryError("Network error while fetching transcript.");
    } finally {
      setTranscriptRetrying(false);
    }
  }

  function handleAsk(ci: number) {
    setActiveQuestionChunkIdx(ci);
    setMessagesState({ questionId: null, messages: [] });
    setStreamBuffer("");
    setFollowupInput("");
    setNewThreadIncludeWeb(false);
    if (chunkQuestions[ci]) {
      setActiveQuestionId(chunkQuestions[ci]);
      setQuestionInput("");
    } else {
      setActiveQuestionId(null);
      setQuestionInput("");
    }
    setView("chat");
  }

  async function submitQuestion() {
    if (!questionInput.trim() || activeQuestionChunkIdx === null || creating) return;
    setCreating(true);
    const initialMsg = questionInput;
    const context = buildContext(segments, chunks, activeQuestionChunkIdx);
    const chunkOffset = chunks[activeQuestionChunkIdx].offset;
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, title: questionInput, context, chunkOffset, includeWeb: newThreadIncludeWeb }),
    });
    const question = await res.json();
    setChunkQuestions((prev) => ({ ...prev, [activeQuestionChunkIdx]: question.id }));
    setQuestionInput("");
    setCreating(false);
    onGraphRefresh();
    setActiveQuestionId(question.id);
    setThreadIncludeWebState({ questionId: question.id, includeWeb: newThreadIncludeWeb });
    await streamMessage(question.id, initialMsg);
    // Refresh after streaming completes — by this point the background title generation
    // has finished and the graph node will show the AI-generated title.
    onGraphRefresh();
  }

  async function sendFollowup() {
    if (!followupInput.trim() || !threadQuestionId || streaming) return;
    const content = followupInput;
    setFollowupInput("");
    await streamMessage(threadQuestionId, content);
  }

  async function summarize() {
    if (!threadQuestionId) return;
    setSummarizing(true);
    await fetch(`/api/questions/${threadQuestionId}/summarize`, { method: "POST" });
    setSummarizing(false);
    onGraphRefresh();
  }

  function goBack() {
    setView("transcript");
    setActiveQuestionId(null);
    setActiveQuestionChunkIdx(null);
    setMessagesState({ questionId: null, messages: [] });
    setStreamBuffer("");
    onCloseThread?.(); // clear the selected graph node, if the thread was opened from there
  }

  const chatChunk = threadChunkIdx !== null ? chunks[threadChunkIdx] : null;
  const isFiltering = searchQuery.trim() !== "" || threadsOnly;
  const showCounter = searchQuery.trim() !== "" && filteredItems.length > 0;

  const TABS: { id: Tab; label: string }[] = [
    { id: "transcript", label: "Transcript" },
    { id: "summary", label: "Summary" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="relative flex-1 overflow-hidden">

        {/* ── Transcript / Summary / Notes panel ── */}
        <div
          className="absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out"
          style={{ transform: threadView === "chat" ? "translateX(-100%)" : "translateX(0)" }}
        >
          {/* Tabs */}
          <div className="shrink-0 px-5 flex items-center gap-3 border-b py-2.5" style={{ borderColor: "var(--border)" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="type-mono transition-colors"
                style={{
                  fontSize: "0.68rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: tab === t.id ? "var(--foreground)" : "var(--muted)",
                  fontWeight: tab === t.id ? 500 : 400,
                  borderBottom: tab === t.id ? "1px solid var(--foreground)" : "1px solid transparent",
                  paddingBottom: "2px",
                }}
              >
                {t.label}
              </button>
            ))}
            {tab === "transcript" && chunks.length > 0 && !isFiltering && (
              <span className="type-mono ml-auto" style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                {chunks.length} passages
              </span>
            )}
            {tab === "transcript" && chunks.length > 0 && isFiltering && (
              <span className="type-mono ml-auto" style={{ fontSize: "0.65rem", color: "var(--accent)" }}>
                {filteredItems.length} shown
              </span>
            )}
          </div>

          {/* Search + filter bar — hidden when there's no transcript to search. */}
          {tab === "transcript" && chunks.length > 0 && (
            <div className="shrink-0 px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="relative flex-1">
                <svg
                  width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                  className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--muted)" }}
                >
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchCursor(0); }}
                  placeholder="Search transcript…"
                  className="w-full pl-6 pr-6 py-1 text-xs rounded-md border outline-none"
                  style={{
                    borderColor: searchQuery ? "var(--accent)" : "var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setSearchMatchCursor(0); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 type-mono"
                    style={{ fontSize: "0.7rem", color: "var(--muted)" }}
                  >
                    ×
                  </button>
                )}
              </div>
              {showCounter && (
                <>
                  <span className="type-mono shrink-0" style={{ fontSize: "0.62rem", color: "var(--muted)", minWidth: 32, textAlign: "center" }}>
                    {searchMatchCursor + 1}/{filteredItems.length}
                  </span>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => navigateMatch(-1)} className="w-5 h-5 flex items-center justify-center rounded" style={{ color: "var(--muted)", background: "var(--active-row)" }}>
                      <span style={{ fontSize: "0.6rem" }}>↑</span>
                    </button>
                    <button onClick={() => navigateMatch(1)} className="w-5 h-5 flex items-center justify-center rounded" style={{ color: "var(--muted)", background: "var(--active-row)" }}>
                      <span style={{ fontSize: "0.6rem" }}>↓</span>
                    </button>
                  </div>
                </>
              )}
              <button
                onClick={() => { setThreadsOnly((v) => !v); setSearchMatchCursor(0); }}
                className="type-mono shrink-0 px-2 py-1 rounded-md transition-colors"
                style={{
                  fontSize: "0.6rem",
                  letterSpacing: "0.04em",
                  background: threadsOnly ? "var(--accent-light)" : "transparent",
                  color: threadsOnly ? "var(--accent)" : "var(--muted)",
                  border: `1px solid ${threadsOnly ? "var(--accent-light)" : "var(--border)"}`,
                }}
              >
                threads
              </button>
            </div>
          )}

          {/* Tab content — keep Summary mounted so client cache survives tab switches. */}
          <div
            className="flex-1 flex flex-col min-h-0 overflow-hidden"
            style={{ display: tab === "summary" ? "flex" : "none" }}
          >
            <SummaryView sourceId={sourceId} initialSummary={initialSummary} />
          </div>

          {tab === "notes" && !notesLoaded && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
            </div>
          )}

          {tab === "notes" && notesLoaded && (
            <NotesView
              ref={notesEditorRef}
              content={notes}
              onChange={handleNotesChange}
              saving={notesSaving}
              saveError={notesSaveError}
              onSeekTo={onSeekTo}
              onSwitchToTranscript={() => setTab("transcript")}
              onOpenThread={onOpenThread}
              onOpenSource={onOpenSource}
            />
          )}

          {tab === "transcript" && chunks.length === 0 && (
            <div className="flex-1 flex items-center justify-center px-6 py-8">
              <div className="flex flex-col items-center gap-3 text-center max-w-xs">
                <p className="text-sm" style={{ color: "var(--foreground)" }}>
                  No transcript available
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  YouTube didn&apos;t return captions when this source was added.
                  This can happen for videos without subtitles, or when the
                  transcript service is temporarily unreachable.
                </p>
                <button
                  onClick={retryTranscript}
                  disabled={transcriptRetrying}
                  className="type-mono mt-1 px-3 py-1.5 rounded-md transition-opacity disabled:opacity-50 hover:opacity-80"
                  style={{
                    fontSize: "0.68rem",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    background: "var(--accent)",
                    color: "#fff",
                  }}
                >
                  {transcriptRetrying ? "Fetching…" : "↺ Retry fetch"}
                </button>
                {transcriptRetryError && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {transcriptRetryError}
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "transcript" && chunks.length > 0 && (
            <div className="relative flex-1 min-h-0">
              <div className="h-full overflow-y-auto" onScroll={handleScroll}>
                {filteredItems.length === 0 && isFiltering && (
                  <p className="px-5 py-4 text-xs" style={{ color: "var(--muted)" }}>
                    {threadsOnly ? "No threads yet" : "No matches found"}
                  </p>
                )}
                {filteredItems.map(({ chunk, ci }, matchIdx) => {
                  const isActive = ci === activeChunkIdx;
                  const isHighlighted = ci === activeQuestionChunkIdx;
                  const hasThread = !!chunkQuestions[ci];
                  const isFocusedMatch = searchQuery.trim() !== "" && matchIdx === searchMatchCursor;

                  return (
                    <div
                      key={ci}
                      ref={(el) => { chunkRefs.current[ci] = el; }}
                      className="transcript-row group flex items-start gap-3 px-5 py-3 cursor-pointer"
                      data-active={isActive ? "true" : undefined}
                      data-highlighted={isHighlighted && !isActive ? "true" : undefined}
                      data-threaded={hasThread && !isHighlighted && !isActive ? "true" : undefined}
                      style={isFocusedMatch ? { background: "var(--accent-light)" } : undefined}
                      onClick={() => onSeekTo(chunk.offset)}
                    >
                      <span
                        className="type-mono shrink-0 pt-0.5"
                        style={{ fontSize: "0.68rem", letterSpacing: "0.03em", color: isActive ? "var(--accent)" : "var(--muted)", minWidth: 38 }}
                      >
                        {formatTime(chunk.offset)}
                      </span>

                      <span
                        className="flex-1 text-sm leading-relaxed"
                        style={{ color: isActive ? "var(--foreground)" : "var(--text-secondary)" }}
                      >
                        {isActive && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 mb-0.5" style={{ background: "var(--accent)", verticalAlign: "middle" }} />
                        )}
                        {searchQuery.trim() ? highlightText(chunk.text, searchQuery) : chunk.text}
                      </span>

                      <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCite(ci); }}
                          className="type-mono opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ fontSize: "0.65rem", letterSpacing: "0.03em", color: "var(--muted)" }}
                          title="Reference this passage in Notes"
                        >
                          ref →
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAsk(ci); }}
                          className={`type-mono transition-opacity ${hasThread ? "" : "opacity-0 group-hover:opacity-100"}`}
                          style={{ fontSize: "0.68rem", letterSpacing: "0.03em", color: "var(--accent)", opacity: hasThread ? 0.7 : undefined }}
                        >
                          {hasThread ? "thread →" : "ask →"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="absolute bottom-4 inset-x-0 flex justify-center transition-opacity duration-200"
                style={{ opacity: userScrolling && activeChunkIdx >= 0 ? 1 : 0, pointerEvents: userScrolling && activeChunkIdx >= 0 ? "auto" : "none" }}
              >
                <button
                  onClick={scrollToActive}
                  className="type-mono flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-md"
                  style={{ fontSize: "0.68rem", letterSpacing: "0.04em", background: "var(--foreground)", color: "var(--background)" }}
                >
                  ↑ {activeChunkIdx >= 0 && chunks[activeChunkIdx] ? formatTime(chunks[activeChunkIdx].offset) : "jump back"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Chat panel ── */}
        <div
          className="absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out"
          style={{ transform: threadView === "chat" ? "translateX(0)" : "translateX(100%)" }}
        >
          {/* Header */}
          <div className="shrink-0 px-5 py-2.5 border-b flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={goBack}
              className="type-mono transition-opacity hover:opacity-60 flex items-center gap-1"
              style={{ fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--accent)" }}
            >
              ← Transcript
            </button>
            <div className="flex items-center gap-3">
              {chatChunk && (
                <span className="type-mono" style={{ fontSize: "0.68rem", letterSpacing: "0.03em", color: "var(--muted)" }}>
                  {formatTime(chatChunk.offset)}
                </span>
              )}
              {threadQuestionId && messages.length > 0 && (
                <button
                  onClick={summarize}
                  disabled={summarizing}
                  className="type-mono text-xs px-2.5 py-1 rounded disabled:opacity-40 hover:opacity-70 transition-opacity"
                  style={{ color: "#5A7A56", background: "#F0F5EF", border: "1px solid #C8DCC5", fontSize: "0.68rem" }}
                >
                  {summarizing ? "saving…" : "✦ Save as card"}
                </button>
              )}
            </div>
          </div>

          {/* Chunk quote — always pinned below header */}
          {chatChunk && (
            <div
              className="shrink-0 mx-5 my-3"
              style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.875rem" }}
            >
              <div className="type-mono mb-1" style={{ fontSize: "0.65rem", letterSpacing: "0.03em", color: "var(--accent)" }}>
                {formatTime(chatChunk.offset)}
              </div>
              <p className="text-sm leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)" }}>
                {chatChunk.text}
              </p>
            </div>
          )}

          {/* Pre-question input (no thread yet) */}
          {threadQuestionId === null && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1" />
              <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Ask a question about this passage</p>
                <div className="mb-2">
                  <WebSearchToggle enabled={newThreadIncludeWeb} onChange={setNewThreadIncludeWeb} disabled={creating} />
                </div>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitQuestion(); }}
                    placeholder="e.g. Why does this require a vacuum?"
                    disabled={creating}
                    className="flex-1 text-sm px-3 py-2 rounded-lg border outline-none disabled:opacity-50"
                    style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                  <button
                    onClick={submitQuestion}
                    disabled={creating || !questionInput.trim()}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg disabled:opacity-40 hover:opacity-90"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {creating ? <span className="text-xs">…</span> : (
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Conversation (thread loaded or just created) */}
          {threadQuestionId !== null && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto min-h-0 px-5 py-3 flex flex-col gap-4">
                {messages.map((m) => (
                  <div key={m.id} className="flex flex-col gap-1">
                    <span
                      className="type-mono"
                      style={{ fontSize: "0.65rem", letterSpacing: "0.05em", textTransform: "uppercase", color: m.role === "user" ? "var(--text-secondary)" : "var(--accent)" }}
                    >
                      {m.role === "user" ? "You" : "Assistant"}
                    </span>
                    {m.role === "assistant" ? (
                      <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
                        <ChatMarkdown content={m.content} />
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{m.content}</p>
                    )}
                  </div>
                ))}

                {streaming && (
                  <div className="flex flex-col gap-1">
                    <span className="type-mono" style={{ fontSize: "0.65rem", letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--accent)" }}>
                      Assistant
                    </span>
                    <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
                      <ChatMarkdown content={streamBuffer} />
                      <span className="animate-pulse ml-0.5" style={{ color: "var(--accent)" }}>▊</span>
                    </div>
                  </div>
                )}

                {messages.length === 0 && !streaming && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
                <div className="mb-2">
                  <WebSearchToggle
                    enabled={threadIncludeWeb}
                    onChange={patchThreadIncludeWeb}
                    disabled={streaming}
                  />
                </div>
                <div className="flex gap-2">
                <input
                  value={followupInput}
                  onChange={(e) => setFollowupInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFollowup(); } }}
                  placeholder="Ask a follow-up…"
                  disabled={streaming}
                  className="flex-1 text-sm px-3 py-2 rounded-lg border outline-none disabled:opacity-50"
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
                <button
                  onClick={sendFollowup}
                  disabled={streaming || !followupInput.trim()}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg disabled:opacity-40 hover:opacity-90"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" />
                  </svg>
                </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
