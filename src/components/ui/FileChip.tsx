"use client";

interface Props {
  title: string;
  /** When provided, shows a × button that calls this. */
  onRemove?: () => void;
  removeDisabled?: boolean;
  maxWidth?: number;
}

/** Pill showing an attached PDF source, with optional remove button. */
export default function FileChip({ title, onRemove, removeDisabled, maxWidth = 260 }: Props) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border"
      style={{ background: "var(--accent-light)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)" }}
    >
      <span style={{ fontSize: "0.85rem" }}>📄</span>
      <span className="type-mono truncate" style={{ fontSize: "0.7rem", color: "var(--accent)", maxWidth }} title={title}>
        {title}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removeDisabled}
          className="ml-0.5 hover:opacity-60 transition-opacity"
          style={{ color: "var(--accent)", fontSize: "0.85rem", lineHeight: 1 }}
          title="Remove full-paper context"
        >
          ×
        </button>
      )}
    </div>
  );
}
