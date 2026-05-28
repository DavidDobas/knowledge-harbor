"use client";

import { useEffect, useState } from "react";
import type { Space, Source } from "@/lib/types";
import { SPACE_COLORS } from "@/lib/colors";
import AddSourceModal from "@/components/modals/AddSourceModal";

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

function YouTubeIcon() {
  return (
    <span
      className="shrink-0 flex items-center justify-center rounded-md"
      style={{ width: 28, height: 20, background: "#FF0000" }}
    >
      <svg width="9" height="9" fill="white" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

function PDFIcon() {
  return (
    <span className="shrink-0 relative" style={{ width: 22, height: 26 }}>
      <svg width="22" height="26" fill="none" viewBox="0 0 22 26">
        <path
          d="M3 1h11l6 6v18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"
          fill="var(--background)"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <path d="M14 1v6h6" stroke="var(--border)" strokeWidth="1.5" fill="none" />
        <text
          x="11"
          y="20"
          textAnchor="middle"
          style={{ fontFamily: "monospace", fontSize: "6px", fill: "#E05252", fontWeight: 700, letterSpacing: "0.02em" }}
        >
          PDF
        </text>
      </svg>
    </span>
  );
}

interface Props {
  selectedSpaceId: string | null;
  onSelectSpace: (id: string | null) => void;
  onSelectSource: (source: Source) => void;
  onSourceAdded: () => void;
  refreshKey: number;
}

export default function Sidebar({ selectedSpaceId, onSelectSpace, onSelectSource, onSourceAdded, refreshKey }: Props) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [addingSpace, setAddingSpace] = useState(false);

  useEffect(() => {
    fetch("/api/spaces").then((r) => r.json()).then(setSpaces);
  }, [refreshKey]);

  useEffect(() => {
    const url = selectedSpaceId ? `/api/sources?spaceId=${selectedSpaceId}` : "/api/sources";
    fetch(url).then((r) => r.json()).then(setSources);
  }, [selectedSpaceId, refreshKey]);

  async function createSpace() {
    if (!newSpaceName.trim()) return;
    await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSpaceName }),
    });
    setNewSpaceName("");
    setAddingSpace(false);
    fetch("/api/spaces").then((r) => r.json()).then(setSpaces);
  }

  return (
    <div
      className="shrink-0 flex flex-col h-full"
      style={{ width: 240, background: "var(--panel-bg)", borderRight: "1px solid var(--border)" }}
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
          {sources.map((src) => (
            <button
              key={src.id}
              onClick={() => onSelectSource(src)}
              className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg mb-0.5 text-left transition-colors group"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--active-row)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span className="shrink-0 mt-0.5">
                {src.type === "youtube" ? <YouTubeIcon /> : <PDFIcon />}
              </span>
              <span
                className="text-xs leading-snug"
                style={{ color: "var(--foreground)", wordBreak: "break-word" }}
              >
                {src.title}
              </span>
            </button>
          ))}
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
