"use client";

import { useEffect, useState } from "react";

interface Props {
  sourceId: string;
}

export default function TranscriptView({ sourceId }: Props) {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sources/${sourceId}/transcript`)
      .then((r) => r.json())
      .then((d) => { setTranscript(d.transcript); setError(d.error ?? ""); })
      .catch(() => setError("Failed to load transcript"))
      .finally(() => setLoading(false));
  }, [sourceId]);

  if (loading) return <p className="text-xs p-4" style={{ color: "var(--muted)" }}>Loading transcript…</p>;
  if (error && !transcript) return <p className="text-xs p-4" style={{ color: "#f87171" }}>{error || "No transcript available"}</p>;
  if (!transcript) return <p className="text-xs p-4" style={{ color: "var(--muted)" }}>No transcript available</p>;

  return (
    <div className="p-4 text-sm leading-relaxed overflow-y-auto" style={{ color: "var(--foreground)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {transcript}
    </div>
  );
}
