"use client";

import { forwardRef } from "react";
import ChatTextarea, { type ChatTextareaHandle } from "@/components/ui/ChatTextarea";

export type ChatInputHandle = ChatTextareaHandle;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  // Disables typing and sending (e.g. while a request is in flight).
  disabled?: boolean;
  // Shows a spinner glyph in the send button instead of the arrow.
  sending?: boolean;
  autoFocus?: boolean;
  maxHeight?: number;
}

// Shared chat composer: an auto-growing textarea + send button.
// The bordered wrapper owns the background and the textarea is transparent, so when
// the textarea scrolls internally and rubber-bands, the overscroll reveals the same
// colour as the box rather than the panel behind it.
//
// Keyboard: Enter submits, Shift+Enter inserts a newline. Suppressed during IME
// composition so users typing Japanese/Chinese/Korean don't fire submits mid-word.
const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  { value, onChange, onSend, placeholder, disabled = false, sending = false, autoFocus, maxHeight },
  ref,
) {
  const canSend = value.trim().length > 0 && !disabled && !sending;

  return (
    <div className="flex gap-2 items-end">
      <div
        className="flex-1 rounded-lg border overflow-hidden"
        style={{ background: "var(--background)", borderColor: "var(--border)" }}
      >
        <ChatTextarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          maxHeight={maxHeight}
          className="block w-full text-sm px-3 py-2 bg-transparent outline-none disabled:opacity-50"
          style={{ color: "var(--foreground)" }}
        />
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg disabled:opacity-40 hover:opacity-90"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {sending ? (
          <span className="text-xs">…</span>
        ) : (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        )}
      </button>
    </div>
  );
});

export default ChatInput;
