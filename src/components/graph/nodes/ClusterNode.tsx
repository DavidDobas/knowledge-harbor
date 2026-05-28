interface NodeData {
  label: string;
  count: number;
  color: string;
  spaceId: string;
  onHeaderClick?: (spaceId: string) => void;
}

export default function ClusterNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        border: "1.5px dashed var(--border)",
        borderRadius: 32,
        background: "rgba(255,255,255,0.18)",
        position: "relative",
        pointerEvents: "none", // children handle their own clicks
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); data.onHeaderClick?.(data.spaceId); }}
        className="absolute flex items-center gap-2 hover:opacity-70 transition-opacity"
        style={{
          top: 14,
          left: 20,
          pointerEvents: "auto",
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          className="rounded-full shrink-0"
          style={{ width: 8, height: 8, background: data.color }}
        />
        <span className="flex flex-col">
          <span
            className="type-serif font-semibold leading-tight"
            style={{ fontSize: "0.9rem", color: "var(--foreground)" }}
          >
            {data.label}
          </span>
          <span
            className="type-mono"
            style={{ fontSize: "0.62rem", color: "var(--muted)", letterSpacing: "0.04em", marginTop: 1 }}
          >
            {data.count} {data.count === 1 ? "source" : "sources"}
          </span>
        </span>
      </button>
    </div>
  );
}
