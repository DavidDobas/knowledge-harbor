"use client";

import { useRef, useState } from "react";
import NotesView, { type NotesViewHandle } from "@/components/source/NotesView";
import { useSourceNotes } from "@/hooks/useSourceNotes";

interface Props {
  sourceId: string;
  title: string;
  onTitleChange: (title: string) => void;
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
}

export default function NotePanel({ sourceId, title, onTitleChange, onOpenThread, onOpenSource }: Props) {
  const { notes, loaded, setNotes } = useSourceNotes(sourceId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<NotesViewHandle | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

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

  function startEditTitle() {
    setTitleDraft(title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  }

  async function commitTitle() {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === title) return;
    setTitleError(null);
    try {
      const res = await fetch(`/api/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        setTitleError("Could not rename note.");
        setTitleDraft(title);
        return;
      }
      onTitleChange(trimmed);
    } catch {
      setTitleError("Could not rename note.");
      setTitleDraft(title);
    }
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="shrink-0 px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <p
          className="type-mono text-xs mb-1"
          style={{ color: "var(--muted)", fontSize: "0.68rem", letterSpacing: "0.05em", textTransform: "uppercase" }}
        >
          Note
        </p>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
              if (e.key === "Escape") { setEditingTitle(false); setTitleDraft(title); }
            }}
            className="type-serif font-semibold text-lg leading-snug w-full rounded px-1 -mx-1 outline-none"
            style={{ color: "var(--foreground)", background: "var(--active-row)", border: "1px solid var(--accent)" }}
          />
        ) : (
          <h1
            onClick={startEditTitle}
            title="Click to rename"
            className="type-serif font-semibold text-lg leading-snug cursor-text group/title"
            style={{ color: "var(--foreground)" }}
          >
            {title}
            <span
              className="opacity-0 group-hover/title:opacity-100 transition-opacity ml-2 type-mono"
              style={{ fontSize: "0.6rem", color: "var(--muted)", verticalAlign: "middle" }}
            >
              edit
            </span>
          </h1>
        )}
        {titleError && (
          <p className="text-xs mt-1" style={{ color: "#c0392b" }}>{titleError}</p>
        )}
      </div>

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
    </div>
  );
}
