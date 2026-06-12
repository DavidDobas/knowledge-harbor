"use client";

import { useRef, useState } from "react";
import NotesView, { type NotesViewHandle } from "@/components/source/NotesView";
import { useSourceNotes } from "@/hooks/useSourceNotes";

interface Props {
  sourceId: string;
  onSeekTo: (ms: number) => void;
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
  editorRef?: React.RefObject<NotesViewHandle | null>;
}

export default function MobileNotesTab({ sourceId, onSeekTo, onOpenThread, onOpenSource, editorRef: externalRef }: Props) {
  const { notes, loaded, setNotes } = useSourceNotes(sourceId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const internalRef = useRef<NotesViewHandle | null>(null);
  const editorRef = externalRef ?? internalRef;
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
        if (!res.ok) setSaveError(`Save failed (HTTP ${res.status}).`);
      } catch {
        setSaveError("Save failed — check connection.");
      } finally {
        setSaving(false);
      }
    }, 1200);
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {(saving || saveError) && (
        <div className="shrink-0 px-4 py-1 text-right">
          {saveError ? (
            <span className="type-mono text-xs" style={{ color: "#C0392B" }}>{saveError}</span>
          ) : (
            <span className="type-mono text-xs" style={{ color: "var(--muted)" }}>saving…</span>
          )}
        </div>
      )}
      <NotesView
        ref={editorRef}
        content={notes}
        onChange={handleChange}
        saving={saving}
        saveError={saveError}
        onSeekTo={onSeekTo}
        onSwitchToTranscript={() => {}}
        onOpenThread={onOpenThread}
        onOpenSource={onOpenSource}
      />
    </div>
  );
}
