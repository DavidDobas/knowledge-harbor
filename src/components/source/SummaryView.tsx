"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import ChatMarkdown from "@/components/source/ChatMarkdown";

/** Survives tab unmounts — keyed by sourceId. */
const summaryCache = new Map<string, string | null>();

interface Props {
  sourceId: string;
  initialSummary?: string | null;
}

export default function SummaryView({ sourceId, initialSummary }: Props) {
  const [summary, setSummary] = useState<string | null>(() => {
    if (summaryCache.has(sourceId)) return summaryCache.get(sourceId)!;
    return initialSummary ?? null;
  });
  const [loading, setLoading] = useState(() => {
    if (summaryCache.has(sourceId)) return false;
    return !initialSummary;
  });
  const [regenerating, setRegenerating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((force = false) => {
    if (!force && summaryCache.has(sourceId)) {
      setSummary(summaryCache.get(sourceId)!);
      setLoading(false);
      return;
    }

    if (force) {
      setRegenerating(true);
    } else {
      setLoading(true);
    }

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setGenerating(true), 1500);

    fetch(`/api/sources/${sourceId}/summary${force ? "?force=true" : ""}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.summary ?? null;
        summaryCache.set(sourceId, s);
        setSummary(s);
      })
      .finally(() => {
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
        setLoading(false);
        setRegenerating(false);
        setGenerating(false);
      });
  }, [sourceId]);

  // Resolve on mount / source change / when parent delivers summary from full-source fetch.
  useEffect(() => {
    if (summaryCache.has(sourceId)) {
      setSummary(summaryCache.get(sourceId)!);
      setLoading(false);
      setGenerating(false);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      return;
    }
    if (initialSummary) {
      summaryCache.set(sourceId, initialSummary);
      setSummary(initialSummary);
      setLoading(false);
      setGenerating(false);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      return;
    }
    load();
  }, [sourceId, initialSummary, load]);

  if (loading && !summary) {
    const label = regenerating || generating ? "Generating summary…" : "Loading summary…";
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>{label}</div>
          {(regenerating || generating) && (
            <div className="text-xs" style={{ color: "var(--muted)" }}>This may take a moment</div>
          )}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs" style={{ color: "var(--muted)" }}>No summary available</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
      <div className="flex items-center justify-end px-4 pt-2 pb-1 shrink-0">
        <button
          onClick={() => load(true)}
          disabled={regenerating}
          className="text-xs px-2 py-1 rounded-md transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ color: "var(--muted)", background: "transparent" }}
        >
          {regenerating ? "Regenerating…" : "↺ Regenerate"}
        </button>
      </div>
      <div className="prose-answer flex-1 overflow-y-auto px-4 pb-4 min-h-0 text-sm" style={{ color: "var(--text-secondary)" }}>
        <ChatMarkdown content={summary} />
      </div>
    </div>
  );
}
