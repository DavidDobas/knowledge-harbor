"use client";

import { useEffect, useState, useCallback } from "react";

interface Props {
  sourceId: string;
}

export default function SummaryView({ sourceId }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((force = false) => {
    setLoading(true);
    setSummary(null);
    const url = `/api/sources/${sourceId}/summary${force ? "?force=true" : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => setSummary(data.summary ?? null))
      .finally(() => setLoading(false));
  }, [sourceId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>Generating summary…</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>This may take a moment</div>
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

  const lines = summary.split("\n");

  return (
    <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
      <div className="flex items-center justify-end px-4 pt-2 pb-1 shrink-0">
        <button
          onClick={() => load(true)}
          className="text-xs px-2 py-1 rounded-md transition-opacity hover:opacity-70"
          style={{ color: "var(--muted)", background: "transparent" }}
        >
          ↺ Regenerate
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
        {lines.map((line, i) => {
          if (line.startsWith("## ")) {
            return (
              <h3 key={i} className="type-serif font-semibold mt-5 mb-1.5 first:mt-0" style={{ fontSize: "0.9rem", color: "var(--foreground)" }}>
                {line.slice(3)}
              </h3>
            );
          }
          if (line.startsWith("- ") || line.startsWith("• ")) {
            return (
              <div key={i} className="flex items-start gap-2 mb-1">
                <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full" style={{ background: "var(--accent)" }} />
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {line.slice(2)}
                </p>
              </div>
            );
          }
          if (line.trim() === "") return <div key={i} className="h-1" />;
          return (
            <p key={i} className="text-sm leading-relaxed mb-1" style={{ color: "var(--text-secondary)" }}>
              {line}
            </p>
          );
        })}
      </div>
    </div>
  );
}
