"use client";

import { useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const text = message.trim();
    if (!text || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          title: text,
          origin: "general",
          includeFile: source.type === "pdf",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const question = await res.json();
      onQuestionCreated(question.id, text);
      setMessage("");
    } catch {
      setError("Could not start thread — try again.");
    } finally {
      setCreating(false);
    }
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

      <div className="flex-1 flex flex-col justify-end px-5 py-4 min-h-0">
        <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--muted)" }}>
          {HINTS[source.type]}
        </p>
        {error && (
          <p className="text-xs mb-2" style={{ color: "#c0392b" }}>{error}</p>
        )}
        <div className="flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="What do you want to know?"
            disabled={creating}
            autoFocus
            className="flex-1 text-sm px-3 py-2 rounded-lg border outline-none disabled:opacity-50"
            style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          <button
            onClick={handleSubmit}
            disabled={creating || !message.trim()}
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg disabled:opacity-40 hover:opacity-90"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {creating ? (
              <span className="text-xs">…</span>
            ) : (
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
