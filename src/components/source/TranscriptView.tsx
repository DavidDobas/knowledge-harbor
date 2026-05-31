"use client";

import { useEffect, useState } from "react";

interface Props {
  sourceId: string;
}

interface TranscriptState {
  sourceId: string;
  transcript: string | null;
  error: string;
  ready: boolean;
}

export default function TranscriptView({ sourceId }: Props) {
  const [state, setState] = useState<TranscriptState>({
    sourceId: "",
    transcript: null,
    error: "",
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sources/${sourceId}/transcript`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setState({ sourceId, transcript: d.transcript, error: d.error ?? "", ready: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ sourceId, transcript: null, error: "Failed to load transcript", ready: true });
        }
      });
    return () => { cancelled = true; };
  }, [sourceId]);

  const loading = state.sourceId !== sourceId || !state.ready;
  const transcript = state.sourceId === sourceId ? state.transcript : null;
  const error = state.sourceId === sourceId ? state.error : "";

  if (loading) return <p className="text-xs p-4" style={{ color: "var(--muted)" }}>Loading transcript…</p>;
  if (error && !transcript) return <p className="text-xs p-4" style={{ color: "#f87171" }}>{error || "No transcript available"}</p>;
  if (!transcript) return <p className="text-xs p-4" style={{ color: "var(--muted)" }}>No transcript available</p>;

  return (
    <div className="p-4 text-sm leading-relaxed overflow-y-auto" style={{ color: "var(--foreground)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {transcript}
    </div>
  );
}
