"use client";

import { useEffect, useRef, useState } from "react";
import NotesView from "@/components/source/NotesView";
import SummaryView from "@/components/source/SummaryView";

type Tab = "notes" | "summary";

interface Props {
  sourceId: string;
  onOpenThread: (questionId: string) => void;
}

export default function PdfRightPanel({ sourceId, onOpenThread }: Props) {
  const [tab, setTab] = useState<Tab>("notes");

  // Notes state
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/sources/${sourceId}/notes`)
      .then((r) => r.json())
      .then((data) => { setNotes(data.notes ?? ""); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [sourceId]);

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

      {tab === "notes" && loaded && (
        <NotesView
          content={notes}
          onChange={handleChange}
          saving={saving}
          saveError={saveError}
          onSeekTo={() => { /* no transcript timestamps in PDFs */ }}
          onSwitchToTranscript={() => { /* no transcript in PDFs */ }}
          onOpenThread={onOpenThread}
        />
      )}

      {tab === "summary" && <SummaryView sourceId={sourceId} />}
    </div>
  );
}
