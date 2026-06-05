"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

const DEFAULT_MAX_HEIGHT = 160;

export interface ChatTextareaHandle {
  focus: () => void;
}

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> {
  maxHeight?: number;
}

const ChatTextarea = forwardRef<ChatTextareaHandle, Props>(function ChatTextarea(
  { value, onChange, maxHeight = DEFAULT_MAX_HEIGHT, className = "", style, ...rest },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      rows={1}
      className={`resize-none ${className}`}
      style={{ ...style, overflowY: "hidden" }}
      {...rest}
    />
  );
});

export default ChatTextarea;
