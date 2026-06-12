"use client";

import { useState } from "react";
import WebSearchToggle from "@/components/source/WebSearchToggle";
import type { PdfRect } from "@/components/source/PDFViewer";
import type { Source } from "@/lib/types";

interface Props {
  selection: { text: string; page: number; rects: PdfRect[] };
  source: Source;
  onClose: () => void;
  onThreadCreated: (questionId: string) => void;
}

/**
 * Bottom sheet that appears after the user selects text in the mobile PDF viewer,
 * letting them ask a question scoped to that passage.
 */
export default function MobileAskPassageSheet({ selection, source, onClose, onThreadCreated }: Props) {
  const [input, setInput] = useState("");
  const [includeFile, setIncludeFile] = useState(true);
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
          sourceId: source.id,
          title: text,
          context: selection.text,
          pdfPage: selection.page,
          pdfHighlightText: selection.text,
          pdfHighlightRects: JSON.stringify(selection.rects),
          includeFile,
          includeWeb,
        }),
      });
      if (!res.ok) throw new Error();
      const question = await res.json();

      fetch(`/api/questions/${question.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      }).catch(() => {});

      onThreadCreated(question.id);
    } catch {
      setError("Could not create thread — try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(26,25,23,0.4)" }}
        onClick={onClose}
      />
      <div
        className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl flex flex-col"
        style={{ background: "var(--panel-bg)", border: "1px solid var(--border)", maxHeight: "80vh" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
        </div>

        <div className="px-5 pb-5 flex flex-col gap-3 overflow-y-auto">
          {/* Passage preview */}
          <div className="px-3 py-2 rounded-lg" style={{ background: "var(--background)", borderLeft: "3px solid var(--muted)" }}>
            <p className="type-mono text-xs mb-1" style={{ color: "var(--muted)" }}>
              p.{selection.page}
            </p>
            <p
              className="type-serif text-sm italic line-clamp-4"
              style={{ color: "var(--foreground)", opacity: 0.75 }}
            >
              {selection.text}
            </p>
          </div>

          <p className="type-serif font-semibold text-sm" style={{ color: "var(--foreground)" }}>
            Ask about this passage
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

          <div className="flex items-center gap-3 flex-wrap">
            <WebSearchToggle enabled={includeWeb} onChange={setIncludeWeb} />
            <button
              type="button"
              onClick={() => setIncludeFile((v) => !v)}
              className="type-mono text-xs px-2 py-1 rounded"
              style={{
                background: includeFile ? "var(--foreground)" : "var(--background)",
                color: includeFile ? "var(--background)" : "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              {includeFile ? "PDF attached" : "Attach PDF"}
            </button>
          </div>

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
