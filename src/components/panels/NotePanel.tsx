"use client";

import { useEffect, useRef, useState } from "react";
import NotesView, { type NotesViewHandle } from "@/components/source/NotesView";
import { useSourceNotes } from "@/hooks/useSourceNotes";

interface Props {
  sourceId: string;
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
}

export default function NotePanel({ sourceId, onOpenThread, onOpenSource }: Props) {
  const { notes, loaded, setNotes } = useSourceNotes(sourceId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<NotesViewHandle | null>(null);

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

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <NotesView
      ref={editorRef}
      content={notes}
      onChange={handleChange}
      saving={saving}
      saveError={saveError}
      onSeekTo={() => {}}
      onSwitchToTranscript={() => {}}
      onOpenThread={onOpenThread}
      onOpenSource={onOpenSource}
    />
  );
}
