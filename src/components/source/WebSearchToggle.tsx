"use client";

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

/** Per-thread opt-in for hosted web_search on OpenAI Responses API calls. */
export default function WebSearchToggle({ enabled, onChange, disabled }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors disabled:opacity-50"
      style={
        enabled
          ? { background: "var(--accent-light)", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)", color: "var(--accent)" }
          : { background: "transparent", borderColor: "var(--border)", color: "var(--muted)" }
      }
      title={enabled ? "Web search enabled — click to disable" : "Enable web search for this thread"}
    >
      <span style={{ fontSize: "0.85rem" }}>🌐</span>
      <span className="type-mono" style={{ fontSize: "0.7rem" }}>
        Web search
      </span>
      {enabled && (
        <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>×</span>
      )}
    </button>
  );
}
