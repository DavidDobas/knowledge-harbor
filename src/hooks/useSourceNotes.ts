"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface NotesState {
  sourceId: string;
  notes: string;
  ready: boolean;
}

const empty: NotesState = { sourceId: "", notes: "", ready: false };

const SAVE_DEBOUNCE_MS = 1200;

/**
 * Load + autosave notes for a source. `setNotes` updates local state immediately and
 * debounce-saves to the server, exposing `saving`/`saveError` for the UI.
 */
export function useSourceNotes(sourceId: string) {
  const [state, setState] = useState<NotesState>(empty);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sources/${sourceId}/notes`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setState({ sourceId, notes: data.notes ?? "", ready: true });
      })
      .catch(() => {
        if (!cancelled) setState({ sourceId, notes: "", ready: true });
      });
    return () => { cancelled = true; };
  }, [sourceId]);

  const loaded = state.sourceId === sourceId && state.ready;
  const notes = state.sourceId === sourceId ? state.notes : "";

  const setNotes = useCallback((value: string) => {
    setState((prev) => (prev.sourceId === sourceId ? { ...prev, notes: value } : prev));
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
          setSaveError(
            res.status === 413
              ? `Notes too large (${sizeKB} KB). Remove some images to save.`
              : `Save failed (HTTP ${res.status}).`,
          );
        }
      } catch {
        setSaveError("Save failed — check connection.");
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [sourceId]);

  return { notes, loaded, setNotes, saving, saveError };
}
