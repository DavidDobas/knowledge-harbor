"use client";

import { useState } from "react";
import WebSearchToggle from "@/components/source/WebSearchToggle";

interface Props {
  sourceId: string;
  sourceType: "pdf" | "youtube" | "note";
  onClose: () => void;
  /** Called with the new questionId once created. Parent should navigate to thread. */
  onThreadCreated: (questionId: string) => void;
}

/**
 * Bottom sheet for asking a general (non-passage) question about any source.
 * Used in the Threads tab on both YouTube and PDF screens.
 */
export default function MobileGeneralAskSheet({ sourceId, sourceType, onClose, onThreadCreated }: Props) {
  const [input, setInput] = useState("");
  const [includeWeb, setIncludeWeb] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const text = input.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          title: text,
          origin: "general",
          includeFile: sourceType === "pdf",
          includeWeb,
        }),
      });
      if (!res.ok) throw new Error();
      const question = await res.json();

      // Kick off the first message in the background so it's ready when the thread opens.
      fetch(`/api/questions/${question.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      }).catch(() => {});

      onThreadCreated(question.id);
    } catch {
      setError("Could not start thread — try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(26,25,23,0.4)" }}
        onClick={onClose}
      />
      <div
        className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl flex flex-col"
        style={{ background: "var(--panel-bg)", border: "1px solid var(--border)", maxHeight: "75vh" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="type-serif font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            New thread
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What do you want to know?"
            rows={3}
            autoFocus
            className="w-full rounded-lg px-3 py-2.5 text-sm resize-none outline-none"
            style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
          />
          <WebSearchToggle enabled={includeWeb} onChange={setIncludeWeb} />
          {error && <p className="type-mono text-xs" style={{ color: "#c0392b" }}>{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={submitting || !input.trim()}
            className="mobile-touch-target w-full py-3 rounded-xl type-mono text-xs disabled:opacity-50"
            style={{ background: "var(--foreground)", color: "var(--background)", letterSpacing: "0.05em" }}
          >
            {submitting ? "Creating…" : "Ask →"}
          </button>
        </div>
      </div>
    </>
  );
}
