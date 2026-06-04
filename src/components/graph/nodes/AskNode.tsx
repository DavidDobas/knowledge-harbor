import { Handle, Position } from "@xyflow/react";

export default function AskNode() {
  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: 52,
        height: 52,
        background: "var(--panel-bg)",
        border: "1.5px solid var(--accent)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <span
        className="type-mono"
        style={{
          fontSize: "0.62rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--accent)",
          fontWeight: 500,
        }}
      >
        Ask
      </span>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1, border: "none", minWidth: 0, minHeight: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1, border: "none", minWidth: 0, minHeight: 0 }} />
    </div>
  );
}
