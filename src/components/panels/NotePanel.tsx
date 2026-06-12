"use client";

import { useRef, useState } from "react";
import NotesView, { type NotesViewHandle } from "@/components/source/NotesView";
import EditableTitle from "@/components/ui/EditableTitle";
import Loading from "@/components/ui/Loading";
import { useSourceNotes } from "@/hooks/useSourceNotes";
import { fetchJson } from "@/lib/fetchJson";

interface Props {
  sourceId: string;
  title: string;
  onTitleChange: (title: string) => void;
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
}

export default function NotePanel({ sourceId, title, onTitleChange, onOpenThread, onOpenSource }: Props) {
  const { notes, loaded, setNotes, saving, saveError } = useSourceNotes(sourceId);
  const [titleError, setTitleError] = useState<string | null>(null);
  const editorRef = useRef<NotesViewHandle | null>(null);

  async function commitTitle(next: string): Promise<boolean> {
    setTitleError(null);
    const updated = await fetchJson(`/api/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!updated) {
      setTitleError("Could not rename note.");
      return false;
    }
    onTitleChange(next);
    return true;
  }

  if (!loaded) return <Loading />;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="shrink-0 px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="mono-label mb-1" style={{ color: "var(--muted)" }}>Note</p>
        <EditableTitle
          value={title}
          onCommit={commitTitle}
          as="h1"
          className="type-serif font-semibold text-lg leading-snug"
        />
        {titleError && <p className="text-xs mt-1" style={{ color: "#c0392b" }}>{titleError}</p>}
      </div>

      <NotesView
        ref={editorRef}
        content={notes}
        onChange={setNotes}
        saving={saving}
        saveError={saveError}
        onSeekTo={() => {}}
        onSwitchToTranscript={() => {}}
        onOpenThread={onOpenThread}
        onOpenSource={onOpenSource}
      />
    </div>
  );
}
