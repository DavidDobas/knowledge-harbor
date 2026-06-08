"use client";

import { useState } from "react";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import type { DisplayChunk } from "@/lib/transcriptChunks";
import { formatTime } from "@/lib/utils";

interface Props {
  chunk: DisplayChunk;
  chunkIdx: number;
  existingQuestionId?: string;
  onClose: () => void;
  onSubmit: (message: string, includeWeb: boolean) => Promise<string | null>;
  onOpenThread: (questionId: string) => void;
}

export default function MobileAskSheet({
  chunk,
  existingQuestionId,
  onClose,
  onSubmit,
  onOpenThread,
}: Props) {
  const [input, setInput] = useState("");
  const [includeWeb, setIncludeWeb] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!input.trim() || submitting) return;
    if (existingQuestionId) {
      onOpenThread(existingQuestionId);
      return;
    }
    setSubmitting(true);
    const questionId = await onSubmit(input.trim(), includeWeb);
    setSubmitting(false);
    if (questionId) onOpenThread(questionId);
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

        <div className="px-5 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="type-mono text-xs mb-2" style={{ color: "var(--accent)", letterSpacing: "0.04em" }}>
            {formatTime(chunk.offset)}
          </p>
          <p className="text-sm leading-relaxed line-clamp-4" style={{ color: "var(--text-secondary)" }}>
            {chunk.text}
          </p>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="type-serif font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            {existingQuestionId ? "Open thread" : "Ask anything about this segment"}
          </p>
          {!existingQuestionId && (
            <>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What does sim-to-real mean here?"
                rows={3}
                className="w-full rounded-lg px-3 py-2.5 text-sm resize-none outline-none"
                style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              />
              <WebSearchToggle enabled={includeWeb} onChange={setIncludeWeb} />
            </>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || (!existingQuestionId && !input.trim())}
            className="mobile-touch-target w-full py-3 rounded-xl type-mono text-xs disabled:opacity-50"
            style={{ background: "var(--foreground)", color: "var(--background)", letterSpacing: "0.05em" }}
          >
            {submitting ? "Thinking…" : existingQuestionId ? "View thread →" : "Ask →"}
          </button>
        </div>
      </div>
    </>
  );
}
