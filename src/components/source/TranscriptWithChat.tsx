"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseTranscript, type TranscriptSegment } from "@/lib/youtube";
import { formatTime } from "@/lib/utils";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import ChatInput, { type ChatInputHandle } from "@/components/ui/ChatInput";
import PassageQuote from "@/components/ui/PassageQuote";
import SummaryView from "@/components/source/SummaryView";
import NotesView, { type NotesViewHandle } from "@/components/source/NotesView";
import { useSourceNotes } from "@/hooks/useSourceNotes";
import { fetchJson } from "@/lib/fetchJson";
import { createQuestion } from "@/lib/questions";

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
  // Called when a NEW transcript question is just created — parent navigates to QuestionPanel.
  onTranscriptQuestionCreated?: (questionId: string, message: string) => void;
}

export default function TranscriptWithChat({ sourceId, rawTranscript, activeChunkIdx, onSeekTo, onGraphRefresh, viewMode, onOpenThread, onOpenSource, onTranscriptUpdated, initialSummary, onTranscriptQuestionCreated }: Props) {
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
  const autoPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPollAttemptsRef = useRef(0);

  // Compose state — for starting a new question about a transcript passage. Once created,
  // we navigate to QuestionPanel (the single home for all threads), so no message/stream
  // state lives here anymore.
  const [activeQuestionChunkIdx, setActiveQuestionChunkIdx] = useState<number | null>(null);
  const [questionInput, setQuestionInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [newThreadIncludeWeb, setNewThreadIncludeWeb] = useState(false);

  // Notes — load + debounced autosave handled by the hook.
  const { notes, loaded: notesLoaded, setNotes, saving: notesSaving, saveError: notesSaveError } = useSourceNotes(sourceId);
  const notesEditorRef = useRef<NotesViewHandle | null>(null);

  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<ChatInputHandle>(null);

  const segments = useMemo(() => (rawTranscript ? parseTranscript(rawTranscript) : []), [rawTranscript]);
  const chunks = useMemo(() => groupIntoChunks(segments), [segments]);

  // Load persisted questions
  useEffect(() => {
    fetchJson<Array<{ id: string; chunkOffset: number | null }>>(`/api/questions?sourceId=${sourceId}`)
      .then((qs) => {
        if (!qs) return;
        const map: Record<number, string> = {};
        qs.forEach((q) => {
          if (q.chunkOffset == null) return;
          const ci = chunks.findIndex((c) => c.offset === q.chunkOffset);
          if (ci >= 0) map[ci] = q.id;
        });
        setChunkQuestions(map);
      });
  }, [sourceId, chunks]);

  function handleCite(ci: number) {
    notesEditorRef.current?.insertCitation(chunks[ci].offset);
    setTab("notes");
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
    if (view === "chat") {
      setTimeout(() => inputRef.current?.focus(), 320);
    }
  }, [view]);

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
        autoPollAttemptsRef.current = 99; // stop auto-polling on success
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

  // When a source has no transcript (e.g. the upload-time fetch failed), silently retry in
  // the background up to MAX_AUTO_POLL times. Each attempt calls the same server route that
  // already does its own 3-attempt retry with backoff, so we space client polls wider apart.
  const MAX_AUTO_POLL = 3;
  const AUTO_POLL_INTERVAL_MS = 8_000;

  useEffect(() => {
    if (rawTranscript) return; // already have transcript — nothing to do

    autoPollAttemptsRef.current = 0;

    function scheduleNextPoll() {
      autoPollRef.current = setTimeout(async () => {
        if (autoPollAttemptsRef.current >= MAX_AUTO_POLL) return;
        autoPollAttemptsRef.current += 1;
        try {
          const res = await fetch(`/api/sources/${sourceId}/transcript`);
          const data = (await res.json()) as { transcript?: string | null };
          if (data.transcript) {
            onTranscriptUpdated?.(data.transcript);
            return; // success — stop polling
          }
        } catch {
          // silently ignore network errors during background polling
        }
        scheduleNextPoll();
      }, AUTO_POLL_INTERVAL_MS);
    }

    scheduleNextPoll();

    return () => {
      if (autoPollRef.current) clearTimeout(autoPollRef.current);
    };
    // intentionally omit onTranscriptUpdated to avoid re-running on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, rawTranscript]);

  function handleAsk(ci: number) {
    // Existing thread on this chunk → open it directly in QuestionPanel.
    if (chunkQuestions[ci]) {
      onOpenThread(chunkQuestions[ci]);
      return;
    }
    // New question → open the compose view for this passage.
    setActiveQuestionChunkIdx(ci);
    setQuestionInput("");
    setNewThreadIncludeWeb(false);
    setView("chat");
  }

  async function submitQuestion() {
    if (!questionInput.trim() || activeQuestionChunkIdx === null || creating) return;
    const chunkIdx = activeQuestionChunkIdx;
    setCreating(true);
    const initialMsg = questionInput;
    const question = await createQuestion({
      sourceId,
      title: questionInput,
      context: buildContext(segments, chunks, chunkIdx),
      chunkOffset: chunks[chunkIdx].offset,
      includeWeb: newThreadIncludeWeb,
    });
    setCreating(false);
    if (!question) return;
    setChunkQuestions((prev) => ({ ...prev, [chunkIdx]: question.id }));
    setQuestionInput("");
    // Reset compose view so a later "Back" lands on the transcript, not a stale compose box.
    setView("transcript");
    setActiveQuestionChunkIdx(null);
    onGraphRefresh();

    // Navigate to QuestionPanel — it owns streaming + title generation.
    if (onTranscriptQuestionCreated) onTranscriptQuestionCreated(question.id, initialMsg);
    else onOpenThread(question.id);
  }

  function goBack() {
    setView("transcript");
    setActiveQuestionChunkIdx(null);
    setQuestionInput("");
  }

  const chatChunk = activeQuestionChunkIdx !== null ? chunks[activeQuestionChunkIdx] : null;
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
          style={{ transform: view === "chat" ? "translateX(-100%)" : "translateX(0)" }}
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
              onChange={setNotes}
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

        {/* ── Compose panel — ask a new question about a passage, then navigate away ── */}
        <div
          className="absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out"
          style={{ transform: view === "chat" ? "translateX(0)" : "translateX(100%)" }}
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
            {chatChunk && (
              <span className="type-mono" style={{ fontSize: "0.68rem", letterSpacing: "0.03em", color: "var(--muted)" }}>
                {formatTime(chatChunk.offset)}
              </span>
            )}
          </div>

          {/* Chunk quote — the passage being asked about */}
          {chatChunk && (
            <PassageQuote
              text={chatChunk.text}
              label={formatTime(chatChunk.offset)}
              className="shrink-0 mx-5 my-3"
            />
          )}

          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1" />
            <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Ask a question about this passage</p>
              <div className="mb-2">
                <WebSearchToggle enabled={newThreadIncludeWeb} onChange={setNewThreadIncludeWeb} disabled={creating} />
              </div>
              <ChatInput
                ref={inputRef}
                value={questionInput}
                onChange={setQuestionInput}
                onSend={submitQuestion}
                placeholder="e.g. Why does this require a vacuum?"
                disabled={creating}
                sending={creating}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
