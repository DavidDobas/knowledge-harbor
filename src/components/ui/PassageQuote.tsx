"use client";

interface Props {
  text: string;
  /** Optional small accent label above the quote (e.g. "p.3" or a timestamp). */
  label?: string;
  /** Max lines before truncation. */
  clamp?: 3 | 6;
  className?: string;
}

/** Left-bordered italic quote of the passage a thread is about. */
export default function PassageQuote({ text, label, clamp = 3, className = "" }: Props) {
  return (
    <div className={className} style={{ borderLeft: "2px solid var(--border)", paddingLeft: "0.875rem" }}>
      {label && (
        <div className="type-mono mb-1" style={{ fontSize: "0.65rem", letterSpacing: "0.03em", color: "var(--accent)" }}>
          {label}
        </div>
      )}
      <p
        className={`text-sm leading-relaxed ${clamp === 6 ? "line-clamp-6" : "line-clamp-3"}`}
        style={{ color: "var(--text-secondary)", fontStyle: "italic" }}
      >
        {text}
      </p>
    </div>
  );
}
