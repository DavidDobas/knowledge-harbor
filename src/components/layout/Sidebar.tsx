"use client";

import { useState } from "react";
import type { Space, Source } from "@/lib/types";
import { SPACE_COLORS } from "@/lib/colors";
import { SIDEBAR_WIDTH } from "@/lib/layout";
import AddSourceModal from "@/components/modals/AddSourceModal";
import SourceTypeIcon from "@/components/ui/SourceTypeIcon";

function SpaceIcon({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="shrink-0 flex items-center justify-center rounded-lg font-semibold"
      style={{
        width: 28,
        height: 28,
        background: color + "22",
        border: `1px solid ${color}44`,
        color,
        fontSize: "0.7rem",
        letterSpacing: "-0.01em",
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}


interface Props {
  spaces: Space[];
  sources: Source[];
  selectedSpaceId: string | null;
  activeSourceId?: string | null;
  onSelectSpace: (id: string | null) => void;
  onSelectSource: (source: Source) => void;
  onSourceAdded: () => void;
  onSpaceAdded: () => void;
}

export default function Sidebar({
  spaces, sources, selectedSpaceId, activeSourceId, onSelectSpace, onSelectSource, onSourceAdded, onSpaceAdded,
}: Props) {
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [addingSpace, setAddingSpace] = useState(false);

  async function createSpace() {
    if (!newSpaceName.trim()) return;
    await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSpaceName }),
    });
    setNewSpaceName("");
    setAddingSpace(false);
    onSpaceAdded();
  }

  return (
    <div
      className="shrink-0 flex flex-col h-full"
      style={{ width: SIDEBAR_WIDTH, background: "var(--panel-bg)", borderRight: "1px solid var(--border)" }}
    >
      {/* ── Spaces section ── */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span
            className="type-mono"
            style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}
          >
            Spaces
          </span>
          <button
            onClick={() => setAddingSpace(true)}
            className="transition-opacity hover:opacity-60"
            style={{ color: "var(--muted)" }}
            title="New space"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* All sources entry */}
        <button
          onClick={() => onSelectSpace(null)}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg mb-0.5 text-left transition-colors"
          style={{
            background: selectedSpaceId === null ? "var(--active-row)" : "transparent",
            color: selectedSpaceId === null ? "var(--foreground)" : "var(--text-secondary)",
          }}
        >
          <span
            className="shrink-0 flex items-center justify-center rounded-lg"
            style={{ width: 28, height: 28, background: "var(--active-row)", border: "1px solid var(--border)" }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" style={{ color: "var(--muted)" }}>
              <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            </svg>
          </span>
          <span className="text-xs font-medium">All sources</span>
        </button>

        {/* Space list */}
        {spaces.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onSelectSpace(s.id)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg mb-0.5 text-left transition-colors"
            style={{
              background: selectedSpaceId === s.id ? "var(--active-row)" : "transparent",
              color: selectedSpaceId === s.id ? "var(--foreground)" : "var(--text-secondary)",
            }}
          >
            <SpaceIcon name={s.name} color={SPACE_COLORS[i % SPACE_COLORS.length]} />
            <span className="text-xs font-medium truncate">{s.name}</span>
          </button>
        ))}

        {/* New space input */}
        {addingSpace && (
          <div className="flex gap-1.5 mt-1.5">
            <input
              autoFocus
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createSpace();
                if (e.key === "Escape") setAddingSpace(false);
              }}
              placeholder="Space name"
              className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border outline-none"
              style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--background)" }}
            />
            <button
              onClick={createSpace}
              className="text-xs px-2.5 rounded-lg font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: "var(--border)", margin: "0 0" }} />

      {/* ── Sources section ── */}
      <div className="flex flex-col flex-1 min-h-0 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span
            className="type-mono"
            style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}
          >
            Sources
          </span>
          <button
            onClick={() => setShowAddSource(true)}
            className="transition-opacity hover:opacity-60"
            style={{ color: "var(--muted)" }}
            title="Add source"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {sources.length === 0 && (
            <p className="text-xs py-2 px-1" style={{ color: "var(--muted)" }}>
              No sources yet
            </p>
          )}
          {sources.map((src) => {
            const isActive = activeSourceId === src.id;
            return (
            <button
              key={src.id}
              onClick={() => onSelectSource(src)}
              className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg mb-0.5 text-left transition-colors group"
              style={{ background: isActive ? "var(--active-row)" : "transparent" }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--active-row)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <span className="shrink-0 mt-0.5">
                <SourceTypeIcon type={src.type} />
              </span>
              <span
                className="text-xs leading-snug"
                style={{ color: "var(--foreground)", wordBreak: "break-word" }}
              >
                {src.title}
              </span>
            </button>
            );
          })}
        </div>
      </div>

      {showAddSource && (
        <AddSourceModal
          spaceId={selectedSpaceId}
          onClose={() => setShowAddSource(false)}
          onAdded={() => { setShowAddSource(false); onSourceAdded(); }}
        />
      )}
    </div>
  );
}
