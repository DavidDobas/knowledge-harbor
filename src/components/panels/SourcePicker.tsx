"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SourceTypeIcon from "@/components/ui/SourceTypeIcon";
import type { Source } from "@/lib/types";

interface Props {
  // IDs already attached or implicitly in scope (the thread's own source) — these are
  // hidden from the picker so the user can't double-add them.
  excludeIds: string[];
  onPick: (source: Source) => void;
  // Optional label override for the trigger button.
  label?: string;
}

// Small "+ source" button that opens a popover listing every source in the user's library
// and lets them attach one to the current chat. Used by PDFSelectionPanel (new thread)
// and QuestionPanel (existing thread).
export default function SourcePicker({ excludeIds, onPick, label = "+ source" }: Props) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [query, setQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy-load the source list the first time the popover opens. We don't refresh on every
  // open — a fresh upload is rare during a chat, and a stale list is harmless.
  useEffect(() => {
    if (!open || sources != null) return;
    fetch("/api/sources").then((r) => r.json()).then((rows: Source[]) => setSources(rows)).catch(() => setSources([]));
  }, [open, sources]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    const onDocClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const filtered = useMemo(() => {
    if (!sources) return [];
    const q = query.trim().toLowerCase();
    return sources
      .filter((s) => !excludeSet.has(s.id))
      .filter((s) => (q ? s.title.toLowerCase().includes(q) : true));
  }, [sources, excludeSet, query]);

  return (
    <div ref={popoverRef} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border transition-colors"
        style={{
          background: "transparent",
          borderColor: "var(--border)",
          color: "var(--muted)",
        }}
        title="Attach another source as context"
      >
        <span className="type-mono" style={{ fontSize: "0.7rem" }}>{label}</span>
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-64 rounded-lg border shadow-lg"
          style={{ background: "var(--panel-bg)", borderColor: "var(--border)", bottom: "100%", marginBottom: 6 }}
        >
          <div className="p-2 border-b" style={{ borderColor: "var(--border)" }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sources…"
              className="w-full text-xs px-2 py-1 rounded outline-none border"
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {sources == null ? (
              <p className="px-3 py-2 type-mono" style={{ fontSize: "0.65rem", color: "var(--muted)" }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 type-mono" style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                {query ? "No matches" : "No more sources to attach"}
              </p>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onPick(s); setOpen(false); setQuery(""); }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--active-row)] transition-colors"
                >
                  <SourceTypeIcon type={s.type} compact />
                  <span className="text-xs truncate" style={{ color: "var(--foreground)" }}>{s.title}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
