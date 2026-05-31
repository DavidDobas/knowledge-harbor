"use client";

import { useCallback, useEffect, useState } from "react";

interface NotesState {
  sourceId: string;
  notes: string;
  ready: boolean;
}

const empty: NotesState = { sourceId: "", notes: "", ready: false };

/** Load notes for a source. Loading is derived — no sync setState in effects. */
export function useSourceNotes(sourceId: string) {
  const [state, setState] = useState<NotesState>(empty);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sources/${sourceId}/notes`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setState({ sourceId, notes: data.notes ?? "", ready: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ sourceId, notes: "", ready: true });
        }
      });
    return () => { cancelled = true; };
  }, [sourceId]);

  const loaded = state.sourceId === sourceId && state.ready;
  const notes = state.sourceId === sourceId ? state.notes : "";

  const setNotes = useCallback((value: string) => {
    setState((prev) =>
      prev.sourceId === sourceId ? { ...prev, notes: value } : prev,
    );
  }, [sourceId]);

  return { notes, loaded, setNotes };
}
