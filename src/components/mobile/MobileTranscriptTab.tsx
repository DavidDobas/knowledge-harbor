"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DisplayChunk } from "@/lib/transcriptChunks";
import { formatTime } from "@/lib/utils";

interface Props {
  chunks: DisplayChunk[];
  activeChunkIdx: number;
  chunkQuestions: Record<number, string>;
  onSeekTo: (ms: number) => void;
  onAsk: (chunkIdx: number) => void;
  onCite?: (chunkIdx: number) => void;
}

export default function MobileTranscriptTab({
  chunks,
  activeChunkIdx,
  chunkQuestions,
  onSeekTo,
  onAsk,
  onCite,
}: Props) {
  const [userScrolling, setUserScrolling] = useState(false);
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    setUserScrolling(true);
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setUserScrolling(false), 4000);
  }, []);

  useEffect(() => {
    if (activeChunkIdx >= 0 && !userScrolling && chunkRefs.current[activeChunkIdx]) {
      chunkRefs.current[activeChunkIdx]!.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeChunkIdx, userScrolling]);

  if (chunks.length === 0) {
    return (
      <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--muted)" }}>
        No transcript available.
      </p>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div className="h-full overflow-y-auto" onScroll={handleScroll}>
        {chunks.map((chunk, ci) => {
          const isActive = ci === activeChunkIdx;
          const hasThread = !!chunkQuestions[ci];
          return (
            <div
              key={ci}
              ref={(el) => { chunkRefs.current[ci] = el; }}
              className="mobile-transcript-row flex items-start gap-3 px-3 py-3 mx-2 rounded-xl"
              data-active={isActive ? "true" : undefined}
              data-threaded={hasThread && !isActive ? "true" : undefined}
              onClick={() => onSeekTo(chunk.offset)}
            >
              <span
                className="type-mono shrink-0 pt-0.5"
                style={{ fontSize: "0.68rem", color: isActive ? "var(--accent)" : "var(--muted)", minWidth: 38 }}
              >
                {formatTime(chunk.offset)}
              </span>
              <span
                className="flex-1 text-sm leading-relaxed"
                style={{ color: isActive ? "var(--foreground)" : "var(--text-secondary)" }}
              >
                {isActive && (
                  <span className="type-mono mr-1.5" style={{ color: "var(--accent)", fontSize: "0.75rem" }}>››</span>
                )}
                {chunk.text}
              </span>
              <div className="shrink-0 flex flex-col gap-2">
                {onCite && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCite(ci); }}
                    className="type-mono text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    ref
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onAsk(ci); }}
                  className="type-mono text-xs"
                  style={{ color: "var(--accent)" }}
                >
                  {hasThread ? "thread" : "ask"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
