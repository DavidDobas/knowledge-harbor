"use client";

import { useState } from "react";
import AddSourceModal from "@/components/modals/AddSourceModal";
import type { Source, Space } from "@/lib/types";

interface Props {
  spaces: Space[];
  sources: Source[];
  onSelectSource: (source: Source) => void;
  onRefresh: () => void;
}

export default function MobileLibrary({ spaces, sources, onSelectSource, onRefresh }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const ungrouped = sources.filter((s) => !s.spaceId);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <header className="mobile-safe-top shrink-0 flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h1 className="type-serif font-semibold text-lg" style={{ color: "var(--foreground)" }}>
          Knowledge Harbor
        </h1>
        <button
          onClick={() => setShowAdd(true)}
          className="mobile-touch-target w-10 h-10 rounded-full flex items-center justify-center type-mono text-lg"
          style={{ background: "var(--foreground)", color: "var(--background)" }}
        >
          +
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {spaces.map((space) => {
          const ss = sources.filter((s) => s.spaceId === space.id);
          if (ss.length === 0) return null;
          return (
            <section key={space.id} className="mb-6">
              <h2 className="type-mono text-xs mb-2 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                {space.name}
              </h2>
              <div className="flex flex-col gap-2">
                {ss.map((s) => (
                  <SourceRow key={s.id} source={s} onSelect={() => onSelectSource(s)} />
                ))}
              </div>
            </section>
          );
        })}

        {ungrouped.length > 0 && (
          <section className="mb-6">
            <h2 className="type-mono text-xs mb-2 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Ungrouped
            </h2>
            <div className="flex flex-col gap-2">
              {ungrouped.map((s) => (
                <SourceRow key={s.id} source={s} onSelect={() => onSelectSource(s)} />
              ))}
            </div>
          </section>
        )}

        {sources.length === 0 && (
          <p className="text-sm text-center py-12" style={{ color: "var(--muted)" }}>
            No sources yet. Tap + to add a video or note.
          </p>
        )}
      </div>

      {showAdd && (
        <AddSourceModal
          spaceId={null}
          mobileOnly
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

function SourceRow({ source, onSelect }: { source: Source; onSelect: () => void }) {
  const icon = source.type === "youtube" ? "▶" : source.type === "note" ? "✎" : "📄";
  return (
    <button
      onClick={onSelect}
      className="mobile-touch-target w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl"
      style={{ background: "var(--panel-bg)", border: "1px solid var(--border)" }}
    >
      <span className="text-lg shrink-0" style={{ opacity: 0.7 }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="type-serif font-semibold text-sm truncate" style={{ color: "var(--foreground)" }}>
          {source.title}
        </p>
        <p className="type-mono text-xs capitalize" style={{ color: "var(--muted)" }}>
          {source.type}
        </p>
      </div>
    </button>
  );
}
