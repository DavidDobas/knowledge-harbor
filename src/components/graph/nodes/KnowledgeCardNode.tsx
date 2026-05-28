import { Handle, Position } from "@xyflow/react";

export default function KnowledgeCardNode({ data }: { data: { label: string; onDelete?: () => void } }) {
  return (
    <div
      className="group/node rounded-xl relative"
      style={{
        background: "#EEF3EC",
        border: "1px solid #C8DCC5",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        minWidth: 145,
        maxWidth: 165,
        padding: "10px 12px 8px",
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" style={{ color: "#6B9B6B", marginTop: 1 }}>
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
        </svg>
        <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: "#6B9B6B" }}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p
        className="leading-snug pr-4"
        style={{ fontSize: "0.72rem", color: "#2D4A2D", wordBreak: "break-word" }}
      >
        {data.label}
      </p>
      {data.onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onDelete!(); }}
          className="absolute top-2 right-2 opacity-0 group-hover/node:opacity-100 transition-opacity flex items-center justify-center rounded-md"
          style={{ width: 20, height: 20, color: "#5A8A5A" }}
          title="Delete card"
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      )}

      {/* Hidden handle — floating edges compute their own border connection point. */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1, border: "none", minWidth: 0, minHeight: 0 }} />
    </div>
  );
}
