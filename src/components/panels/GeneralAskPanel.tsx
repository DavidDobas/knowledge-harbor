"use client";

import { useState } from "react";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import ChatInput from "@/components/ui/ChatInput";
import SourcePicker from "@/components/panels/SourcePicker";
import SourceTypeIcon from "@/components/ui/SourceTypeIcon";
import { createQuestion } from "@/lib/questions";
import type { Source } from "@/lib/types";

interface Props {
  source: Source;
  onQuestionCreated: (questionId: string, message: string) => void;
  onDismiss: () => void;
}

const HINTS: Record<Source["type"], string> = {
  youtube: "Ask about this video — summary and transcript are in context.",
  pdf: "Ask about this PDF — the full document is in context.",
  note: "Ask about this note — the full note is in context.",
};

export default function GeneralAskPanel({ source, onQuestionCreated, onDismiss }: Props) {
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [includeWeb, setIncludeWeb] = useState(false);
  const [attached, setAttached] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const text = message.trim();
    if (!text || creating) return;
    setCreating(true);
    setError(null);
    const question = await createQuestion({
      sourceId: source.id,
      title: text,
      origin: "general",
      includeFile: source.type === "pdf",
      includeWeb,
      attachedSourceIds: attached.map((s) => s.id),
    });
    setCreating(false);
    if (!question) {
      setError("Could not start thread — try again.");
      return;
    }
    onQuestionCreated(question.id, text);
    setMessage("");
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-4 py-2 border-b shrink-0 flex items-center justify-between gap-2" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={onDismiss}
          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--accent)" }}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <span className="type-mono text-xs" style={{ color: "var(--muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          New thread
        </span>
      </div>

      {/* Empty scrollable middle keeps the input glued to the bottom even before the
          parent finishes its first layout pass. The earlier `justify-end` approach
          clipped the composer on initial mount when the panel hadn't sized yet. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4" />

      <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs mb-2 leading-relaxed" style={{ color: "var(--muted)" }}>
          {HINTS[source.type]}
        </p>
        {error && (
          <p className="text-xs mb-2" style={{ color: "#c0392b" }}>{error}</p>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
            excludeIds={[source.id, ...attached.map((s) => s.id)]}
            onPick={(s) => setAttached((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s]))}
          />
        </div>
        <ChatInput
          value={message}
          onChange={setMessage}
          onSend={handleSubmit}
          placeholder="What do you want to know?"
          disabled={creating}
          sending={creating}
          autoFocus
        />
      </div>
    </div>
  );
}
