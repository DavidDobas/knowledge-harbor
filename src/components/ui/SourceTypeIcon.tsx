import type { Source } from "@/lib/types";

// Shared source-type icons. Used by the sidebar (large) and by chat chips / source
// picker (small / compact). Keeping a single source of truth means the icon a user
// sees in the sidebar matches the icon on any attached-source chip.

function YouTubeIcon({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <span
        className="shrink-0 flex items-center justify-center rounded-sm"
        style={{ width: 18, height: 13, background: "#FF0000" }}
      >
        <svg width="7" height="7" fill="white" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    );
  }
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

function NoteIcon({ compact }: { compact: boolean }) {
  const box = compact ? 16 : 28;
  const svg = compact ? 9 : 13;
  return (
    <span
      className="shrink-0 flex items-center justify-center rounded-sm"
      style={{ width: box, height: box, background: "#6B8F7122", border: "1px solid #6B8F7144" }}
    >
      <svg width={svg} height={svg} fill="none" stroke="#6B8F71" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </span>
  );
}

function PDFIcon({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <span className="shrink-0 relative" style={{ width: 14, height: 16 }}>
        <svg width="14" height="16" fill="none" viewBox="0 0 22 26">
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

export default function SourceTypeIcon({ type, compact = false }: { type: Source["type"]; compact?: boolean }) {
  if (type === "youtube") return <YouTubeIcon compact={compact} />;
  if (type === "note") return <NoteIcon compact={compact} />;
  return <PDFIcon compact={compact} />;
}
