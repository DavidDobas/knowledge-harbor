import { Handle, Position } from "@xyflow/react";

export default function QuestionNode({ data }: { data: { label: string; onDelete?: () => void } }) {
  return (
    <div
      className="group/node rounded-xl relative"
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--border)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
        minWidth: 145,
        maxWidth: 165,
        padding: "10px 12px 8px",
      }}
    >
      <p
        className="leading-snug mb-2.5 pr-5 line-clamp-3"
        style={{ fontSize: "0.72rem", color: "var(--foreground)", wordBreak: "break-word" }}
        title={data.label}
      >
        {data.label}
      </p>
      <div className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
        <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      {data.onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onDelete!(); }}
          className="absolute top-2 right-2 opacity-0 group-hover/node:opacity-100 transition-opacity flex items-center justify-center rounded-md hover:bg-red-50"
          style={{ width: 20, height: 20, color: "#C0392B" }}
          title="Delete question"
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      )}

      {/* Hidden handles — floating edges compute their own border connection points. */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1, border: "none", minWidth: 0, minHeight: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1, border: "none", minWidth: 0, minHeight: 0 }} />
    </div>
  );
}
