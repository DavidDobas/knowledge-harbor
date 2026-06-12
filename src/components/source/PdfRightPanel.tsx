"use client";

import { useRef, useState } from "react";
import NotesView from "@/components/source/NotesView";
import SummaryView from "@/components/source/SummaryView";
import { useSourceNotes } from "@/hooks/useSourceNotes";
import type { Question } from "@/lib/types";

type Tab = "notes" | "summary" | "threads";

interface Props {
  sourceId: string;
  initialSummary?: string | null;
  questions: Question[];
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
}

export default function PdfRightPanel({ sourceId, initialSummary, questions, onOpenThread, onOpenSource }: Props) {
  const [tab, setTab] = useState<Tab>("notes");
  const { notes, loaded, setNotes } = useSourceNotes(sourceId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(value: string) {
    setNotes(value);
    setSaveError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sources/${sourceId}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: value }),
        });
        if (!res.ok) {
          const sizeKB = Math.round(new Blob([value]).size / 1024);
          setSaveError(res.status === 413 ? `Notes too large (${sizeKB} KB).` : `Save failed (HTTP ${res.status}).`);
        }
      } catch {
        setSaveError("Save failed — check connection.");
      } finally {
        setSaving(false);
      }
    }, 1200);
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "notes", label: "Notes" },
    { id: "summary", label: "Summary" },
    { id: "threads", label: "Threads" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
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
      </div>

      {tab === "notes" && !loaded && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
        </div>
      )}

      {tab === "notes" && loaded && (
        <NotesView
          content={notes}
          onChange={handleChange}
          saving={saving}
          saveError={saveError}
          onSeekTo={() => { /* no transcript timestamps in PDFs */ }}
          onSwitchToTranscript={() => { /* no transcript in PDFs */ }}
          onOpenThread={onOpenThread}
          onOpenSource={onOpenSource}
        />
      )}

      <div
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
        style={{ display: tab === "summary" ? "flex" : "none" }}
      >
        <SummaryView sourceId={sourceId} initialSummary={initialSummary} />
      </div>

      {tab === "threads" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {questions.length === 0 ? (
            <p className="px-5 py-8 text-xs text-center" style={{ color: "var(--muted)" }}>
              No threads yet. Select text in the PDF and ask a question.
            </p>
          ) : (
            <ul className="px-3 py-3 flex flex-col gap-1">
              {[...questions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() => onOpenThread(q.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg transition-colors hover:opacity-80"
                    style={{ background: "var(--background)", border: "1px solid var(--border)" }}
                  >
                    <p className="type-serif text-sm truncate" style={{ color: "var(--foreground)" }}>
                      {q.title}
                    </p>
                    {q.pdfPage != null && (
                      <p className="type-mono mt-0.5" style={{ fontSize: "0.65rem", color: "var(--muted)", letterSpacing: "0.04em" }}>
                        p.{q.pdfPage}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
