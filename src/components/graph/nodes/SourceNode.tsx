import { Handle, Position } from "@xyflow/react";

function TrashIcon() {
  return (
    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

interface NodeData {
  label: string;
  sourceType: string;
  videoId?: string | null;
  // Presigned URL for the rendered first page of a PDF (uploaded with the source).
  thumbnailUrl?: string | null;
  onDelete?: () => void;
  compact?: boolean;
  showHandle?: boolean; // only show bottom handle when source has children (level 3)
}

export default function SourceNode({ data }: { data: NodeData }) {
  const youtubeThumb = data.videoId ? `https://img.youtube.com/vi/${data.videoId}/mqdefault.jpg` : null;
  const pdfThumb = data.sourceType === "pdf" ? data.thumbnailUrl ?? null : null;
  const compact = data.compact;

  return (
    <div
      className="group/node rounded-2xl overflow-hidden"
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--border)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        minWidth: compact ? 150 : 190,
        maxWidth: compact ? 160 : 200,
      }}
    >
      {youtubeThumb ? (
        <div className="relative" style={{ height: compact ? 78 : 108 }}>
          <img
            src={youtubeThumb}
            alt=""
            className="w-full h-full object-cover"
            style={{ display: "block" }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.22)" }}
          >
            <div
              className={compact ? "w-7 h-7 rounded-full flex items-center justify-center" : "w-9 h-9 rounded-full flex items-center justify-center"}
              style={{ background: "rgba(255,255,255,0.92)" }}
            >
              <svg width={compact ? "11" : "13"} height={compact ? "11" : "13"} fill="currentColor" viewBox="0 0 24 24" style={{ color: "#1A1917", marginLeft: 2 }}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      ) : pdfThumb ? (
        // PDF cover (first page rendered client-side at upload). Anchored at the top so
        // the title block is visible — pages are taller than they are wide, so cropping
        // from the bottom preserves the most visually informative part of the page.
        <div
          className="relative"
          style={{ height: compact ? 108 : 150, background: "var(--active-row)" }}
        >
          <img
            src={pdfThumb}
            alt=""
            className="w-full h-full"
            style={{ display: "block", objectFit: "cover", objectPosition: "top" }}
          />
        </div>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ height: compact ? 44 : 60, background: "var(--active-row)" }}
        >
          <svg width={compact ? "18" : "22"} height={compact ? "18" : "22"} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: "var(--muted)" }}>
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
          </svg>
        </div>
      )}

      <div className={compact ? "px-2.5 py-2 relative" : "px-3 py-2.5 relative"}>
        <p
          className={`type-serif font-semibold leading-tight mb-1.5 ${compact ? "line-clamp-2" : ""}`}
          style={{ fontSize: compact ? "0.72rem" : "0.8rem", color: "var(--foreground)", wordBreak: "break-word" }}
        >
          {data.label}
        </p>
        <p
          className="type-mono"
          style={{ fontSize: compact ? "0.54rem" : "0.58rem", color: "var(--muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}
        >
          {data.sourceType === "youtube" ? "YouTube" : "PDF"}
        </p>
        {data.onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); data.onDelete!(); }}
            className="absolute top-2 right-2 opacity-0 group-hover/node:opacity-100 transition-opacity flex items-center justify-center rounded-md hover:bg-red-50"
            style={{ width: 22, height: 22, color: "#C0392B" }}
            title="Delete source"
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {/* Hidden handle — floating edges compute their own border connection points,
          but the handle must exist for the edge to be valid. */}
      {data.showHandle && (
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1, border: "none", minWidth: 0, minHeight: 0 }} />
      )}
    </div>
  );
}
