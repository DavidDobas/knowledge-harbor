"use client";

import { useEffect, useState } from "react";
import ChatMarkdown from "@/components/source/ChatMarkdown";
import type { Question } from "@/lib/types";
import { formatTime } from "@/lib/utils";

/** Truncate without leaving unclosed markdown markers. */
function truncatePreview(text: string, max = 160): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max).trimEnd();
  const boldCount = (cut.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) cut += "**";
  return cut + "…";
}

interface Props {
  questions: Question[];
  onOpenThread: (questionId: string) => void;
}

export default function MobileThreadsTab({ questions, onOpenThread }: Props) {
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const sorted = [...questions].sort((a, b) => {
    const ao = a.chunkOffset ?? 0;
    const bo = b.chunkOffset ?? 0;
    if (ao !== bo) return ao - bo;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const questionIds = sorted.map((q) => q.id).join(",");

  useEffect(() => {
    sorted.forEach((q) => {
      fetch(`/api/questions/${q.id}/messages`)
        .then((r) => r.json())
        .then((msgs: Array<{ role: string; content: string }>) => {
          const assistant = msgs.find((m) => m.role === "assistant");
          if (assistant) {
            const preview = truncatePreview(assistant.content);
            setPreviews((prev) => (prev[q.id] ? prev : { ...prev, [q.id]: preview }));
          }
        })
        .catch(() => {});
    });
  }, [questionIds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sorted.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--muted)" }}>
          No threads yet. Ask a question from the transcript.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
      <ul className="flex flex-col gap-3 list-none m-0 p-0">
        {sorted.map((q) => (
          <li key={q.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onOpenThread(q.id)}
              className="mobile-thread-card w-full text-left rounded-xl px-4 py-3.5 transition-opacity active:opacity-80"
              style={{ background: "var(--panel-bg)", border: "1px solid var(--border)" }}
            >
              {q.chunkOffset != null && (
                <span
                  className="type-mono text-xs block mb-2"
                  style={{ color: "var(--accent)", letterSpacing: "0.03em" }}
                >
                  {formatTime(q.chunkOffset)}
                </span>
              )}
              <p
                className="type-serif font-semibold text-sm leading-snug mb-1.5"
                style={{ color: "var(--foreground)" }}
              >
                {q.title}
              </p>
              {previews[q.id] && (
                <div
                  className="mobile-thread-preview prose-answer text-xs leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <ChatMarkdown content={previews[q.id]} />
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
