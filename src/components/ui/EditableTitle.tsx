"use client";

import { useRef, useState } from "react";

interface Props {
  value: string;
  /** Persist the new title. Return false to reject (the draft is then reverted). */
  onCommit: (next: string) => boolean | void | Promise<boolean | void>;
  as?: "h1" | "h2";
  /** Typography classes for the heading/input. */
  className?: string;
  /** When true, shows a pulsing placeholder instead of the heading (e.g. "Generating title…"). */
  pending?: boolean;
  pendingLabel?: string;
}

/**
 * Click-to-edit heading. Click switches to an input; Enter/blur commits, Escape cancels.
 * Used by QuestionPanel (thread title) and NotePanel (note title).
 */
export default function EditableTitle({
  value,
  onCommit,
  as = "h2",
  className = "type-serif font-semibold text-sm leading-snug",
  pending = false,
  pendingLabel = "Generating title…",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) return;
    const ok = await onCommit(trimmed);
    if (ok === false) setDraft(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        className={`${className} w-full rounded px-1 -mx-1 outline-none`}
        style={{ color: "var(--foreground)", background: "var(--active-row)", border: "1px solid var(--accent)" }}
      />
    );
  }

  if (pending) {
    return (
      <p className="type-mono text-xs animate-pulse" style={{ color: "var(--muted)", letterSpacing: "0.04em" }}>
        {pendingLabel}
      </p>
    );
  }

  const Heading = as;
  return (
    <Heading
      onClick={startEdit}
      title="Click to rename"
      className={`${className} cursor-text group/title relative`}
      style={{ color: "var(--foreground)" }}
    >
      {value}
      <span
        className="opacity-0 group-hover/title:opacity-100 transition-opacity ml-1.5 type-mono"
        style={{ fontSize: "0.6rem", color: "var(--muted)", verticalAlign: "middle" }}
      >
        edit
      </span>
    </Heading>
  );
}
