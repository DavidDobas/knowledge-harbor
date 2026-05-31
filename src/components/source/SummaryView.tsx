"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import ChatMarkdown from "@/components/source/ChatMarkdown";

/** Survives tab unmounts — keyed by sourceId. */
const summaryCache = new Map<string, string | null>();

interface Props {
  sourceId: string;
  initialSummary?: string | null;
}

interface RemoteSummary {
  sourceId: string;
  summary: string | null;
  done: boolean;
}

export default function SummaryView({ sourceId, initialSummary }: Props) {
  const [remote, setRemote] = useState<RemoteSummary>({ sourceId: "", summary: null, done: false });
  const [regenerating, setRegenerating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cached = summaryCache.has(sourceId) ? summaryCache.get(sourceId)! : undefined;
  const summary = cached ?? (remote.sourceId === sourceId ? remote.summary : null) ?? initialSummary ?? null;
  const fetching = remote.sourceId === sourceId && !remote.done;
  const loading = !summary && (fetching || (remote.sourceId !== sourceId && cached === undefined && initialSummary == null));

  useEffect(() => {
    if (summaryCache.has(sourceId)) return;
    if (initialSummary != null) {
      summaryCache.set(sourceId, initialSummary);
      return;
    }

    let cancelled = false;
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setGenerating(true), 1500);

    fetch(`/api/sources/${sourceId}/summary`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.summary ?? null;
        summaryCache.set(sourceId, s);
        if (!cancelled) setRemote({ sourceId, summary: s, done: true });
      })
      .catch(() => {
        if (!cancelled) setRemote({ sourceId, summary: null, done: true });
      })
      .finally(() => {
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
        if (!cancelled) setGenerating(false);
      });

    return () => { cancelled = true; };
  }, [sourceId, initialSummary]);

  const load = useCallback((force = false) => {
    if (!force && summaryCache.has(sourceId)) return;

    setRegenerating(true);
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setGenerating(true), 1500);

    fetch(`/api/sources/${sourceId}/summary${force ? "?force=true" : ""}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.summary ?? null;
        summaryCache.set(sourceId, s);
        setRemote({ sourceId, summary: s, done: true });
      })
      .finally(() => {
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
        setRegenerating(false);
        setGenerating(false);
      });
  }, [sourceId]);

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
