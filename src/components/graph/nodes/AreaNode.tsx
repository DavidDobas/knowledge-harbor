"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

interface AreaData {
  label: string;
  color?: string;
  onRename: (label: string) => void;
  onDelete: () => void;
}

export default function AreaNode({ data, selected }: NodeProps) {
  const d = data as unknown as AreaData;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(d.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function startEdit() {
    setVal(d.label);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = val.trim() || "Untitled";
    if (next !== d.label) d.onRename(next);
  }

  return (
    <>
      <NodeResizer
        minWidth={160}
        minHeight={110}
        isVisible={!!selected}
        lineStyle={{ borderColor: "var(--accent)", borderWidth: 1, pointerEvents: "auto" }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: "#fff", border: "1.5px solid var(--accent)", pointerEvents: "auto" }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          border: `1.5px dashed ${selected ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 16,
          background: "rgba(255,255,255,0.12)",
          position: "relative",
        }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{ position: "absolute", top: 8, left: 10, right: 10 }}
        >
          {/* Drag handle — grab here to move the area */}
          <span
            className="area-drag shrink-0 flex items-center justify-center rounded"
            title="Drag to move area"
            style={{ width: 20, height: 20, cursor: "move", color: "var(--muted)" }}
          >
            <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
            </svg>
          </span>
          {editing ? (
            <input
              ref={inputRef}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setVal(d.label); setEditing(false); }
              }}
              className="nodrag type-serif font-semibold bg-transparent outline-none"
              style={{ fontSize: "0.85rem", color: "var(--foreground)", border: "none", flex: 1, minWidth: 0 }}
            />
          ) : (
            <span
              onDoubleClick={startEdit}
              title="Double-click to rename"
              className="nodrag type-serif font-semibold truncate"
              style={{ fontSize: "0.85rem", color: "var(--foreground)", flex: 1, cursor: "text" }}
            >
              {d.label}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); d.onDelete(); }}
            title="Delete area"
            className="nodrag shrink-0 flex items-center justify-center rounded hover:opacity-70"
            style={{ width: 18, height: 18, color: "var(--muted)" }}
          >
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
