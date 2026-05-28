"use client";

import { useState } from "react";

interface Props {
  selectedText: string;
  page: number;
  rects: { x: number; y: number; w: number; h: number }[];
  sourceId: string;
  sourceTitle: string;
  onQuestionCreated: (questionId: string, question: string, passage: string, page: number) => void;
  onDismiss: () => void;
  onGraphRefresh: () => void;
}

export default function PDFSelectionPanel({ selectedText, page, rects, sourceId, sourceTitle, onQuestionCreated, onDismiss, onGraphRefresh }: Props) {
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  // Per-thread file context: starts attached. User can remove it before sending the first
  // message; that choice is persisted on the question row and applies to all follow-ups.
  const [includeFile, setIncludeFile] = useState(true);
  // Per-thread web search: opt-in. Adds the hosted web_search tool to the Responses call
  // so the model can fetch and cite external sources. Persisted on the question row.
  const [includeWeb, setIncludeWeb] = useState(false);

  async function submit() {
    if (!input.trim() || creating) return;
    setCreating(true);
    const question = input;
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        title: question,
        context: selectedText,
        pdfPage: page,
        pdfHighlightText: selectedText,
        pdfHighlightRects: JSON.stringify(rects),
        includeFile,
        includeWeb,
      }),
    });
    const created = await res.json();
    onGraphRefresh();
    // Node title is generated server-side in the background; refresh once it's ready.
    setTimeout(() => onGraphRefresh(), 3000);
    onQuestionCreated(created.id, question, selectedText, page);
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="shrink-0 px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <span className="type-mono" style={{ fontSize: "0.65rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
          Selection · p.{page}
        </span>
        <button
          onClick={onDismiss}
          className="transition-opacity hover:opacity-60 type-mono"
          style={{ fontSize: "0.8rem", color: "var(--muted)" }}
        >
          ×
        </button>
      </div>

      <div className="mx-5 mt-4 mb-3 shrink-0" style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.875rem" }}>
        <p className="text-sm leading-relaxed line-clamp-6" style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
          {selectedText}
        </p>
      </div>

      <div className="flex-1" />

      <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Ask about this passage</p>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {includeFile && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border" style={{ background: "var(--accent-light)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)" }}>
              <span style={{ fontSize: "0.85rem" }}>📄</span>
              <span className="type-mono truncate max-w-[200px]" style={{ fontSize: "0.7rem", color: "var(--accent)" }} title={sourceTitle}>
                {sourceTitle}
              </span>
              <button
                onClick={() => setIncludeFile(false)}
                className="ml-0.5 hover:opacity-60 transition-opacity"
                style={{ color: "var(--accent)", fontSize: "0.85rem", lineHeight: 1 }}
                title="Remove full-paper context"
              >
                ×
              </button>
            </div>
          )}
          {/* Web search toggle — opt-in. Looks like the file chip when enabled (× to disable),
              like a ghost button when off (click to enable). */}
          <button
            onClick={() => setIncludeWeb((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors"
            style={
              includeWeb
                ? { background: "var(--accent-light)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)", color: "var(--accent)" }
                : { background: "transparent", borderColor: "var(--border)", color: "var(--muted)" }
            }
            title={includeWeb ? "Web search enabled — click to disable" : "Enable web search for this thread"}
          >
            <span style={{ fontSize: "0.85rem" }}>🌐</span>
            <span className="type-mono" style={{ fontSize: "0.7rem" }}>
              Web search
            </span>
            {includeWeb && (
              <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>×</span>
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="e.g. What does this mean?"
            disabled={creating}
            className="flex-1 text-sm px-3 py-2 rounded-lg border outline-none disabled:opacity-50"
            style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          <button
            onClick={submit}
            disabled={creating || !input.trim()}
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
  );
}
