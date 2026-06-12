"use client";

import ChatMarkdown from "@/components/source/ChatMarkdown";

function RoleLabel({ role }: { role: "user" | "assistant" }) {
  return (
    <span
      className="mono-label"
      style={{ color: role === "user" ? "var(--text-secondary)" : "var(--accent)" }}
    >
      {role === "user" ? "You" : "Assistant"}
    </span>
  );
}

/** A single chat turn: role label + markdown-rendered content. */
export function ChatMessage({ role, content }: { role: "user" | "assistant"; content: string }) {
  return (
    <div className="flex flex-col gap-1">
      <RoleLabel role={role} />
      <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
        <ChatMarkdown content={content} />
      </div>
    </div>
  );
}

/**
 * The in-progress assistant turn. Shows streamed markdown once tokens arrive, otherwise
 * a "Searching the web…" or "Thinking…" status while we wait for the first token.
 */
export function StreamingMessage({ buffer, webSearching }: { buffer: string; webSearching: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <RoleLabel role="assistant" />
      <div className="prose-answer text-sm" style={{ color: "var(--foreground)" }}>
        {buffer ? (
          <ChatMarkdown content={buffer} />
        ) : webSearching ? (
          <span className="flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
            <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Searching the web…
          </span>
        ) : (
          <span style={{ color: "var(--muted)" }}>Thinking…</span>
        )}
        {!webSearching && <span className="animate-pulse ml-0.5" style={{ color: "var(--accent)" }}>▊</span>}
      </div>
    </div>
  );
}
