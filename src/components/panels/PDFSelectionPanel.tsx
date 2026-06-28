"use client";

import { useState } from "react";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import ChatInput from "@/components/ui/ChatInput";
import FileChip from "@/components/ui/FileChip";
import PassageQuote from "@/components/ui/PassageQuote";
import SourcePicker from "@/components/panels/SourcePicker";
import SourceTypeIcon from "@/components/ui/SourceTypeIcon";
import { createQuestion } from "@/lib/questions";
import type { Source } from "@/lib/types";

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
  // Additional sources attached to this thread. Stored locally as full Source objects so
  // we can render the title/type on chips; only IDs go to the server.
  const [attached, setAttached] = useState<Source[]>([]);

  async function submit() {
    if (!input.trim() || creating) return;
    setCreating(true);
    const question = input;
    const created = await createQuestion({
      sourceId,
      title: question,
      context: selectedText,
      pdfPage: page,
      pdfHighlightText: selectedText,
      pdfHighlightRects: JSON.stringify(rects),
      includeFile,
      includeWeb,
      attachedSourceIds: attached.map((s) => s.id),
    });
    if (!created) { setCreating(false); return; }
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

      <PassageQuote text={selectedText} clamp={6} className="mx-5 mt-4 mb-3 shrink-0" />

      <div className="flex-1" />

      <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>Ask about this passage</p>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {includeFile && (
            <FileChip title={sourceTitle} onRemove={() => setIncludeFile(false)} maxWidth={200} />
          )}
          {attached.map((s) => (
            <div
              key={s.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border"
              style={{ background: "var(--accent-light)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)" }}
            >
              <SourceTypeIcon type={s.type} compact />
              <span className="type-mono truncate" style={{ fontSize: "0.7rem", color: "var(--accent)", maxWidth: 160 }} title={s.title}>
                {s.title}
              </span>
              <button
                type="button"
                onClick={() => setAttached((prev) => prev.filter((p) => p.id !== s.id))}
                disabled={creating}
                className="ml-0.5 hover:opacity-60 transition-opacity"
                style={{ color: "var(--accent)", fontSize: "0.85rem", lineHeight: 1 }}
                title="Remove attached source"
              >
                ×
              </button>
            </div>
          ))}
          <WebSearchToggle enabled={includeWeb} onChange={setIncludeWeb} disabled={creating} />
          <SourcePicker
            excludeIds={[sourceId, ...attached.map((s) => s.id)]}
            onPick={(s) => setAttached((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s]))}
          />
        </div>
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={submit}
          placeholder="e.g. What does this mean?"
          disabled={creating}
          sending={creating}
          autoFocus
        />
      </div>
    </div>
  );
}
