"use client";

import { useEffect, useRef, useMemo } from "react";
import { parseTranscript, type TranscriptSegment } from "@/lib/youtube";

declare global {
  interface Window {
    YT: {
      Player: new (el: HTMLElement, config: {
        videoId: string;
        playerVars?: Record<string, number>;
        events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void };
      }) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

const POSITION_KEY = (videoId: string) => `kh.yt.position.${videoId}`;

interface Chunk { segStart: number; segEnd: number; }

function groupIntoChunks(segments: TranscriptSegment[]): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < segments.length) {
    const start = i;
    let text = "";
    while (i < segments.length) {
      text += (text ? " " : "") + segments[i].text;
      i++;
      if (/[.?!]\s*$/.test(text.trim()) && text.length >= 200) break;
      if (text.length >= 800) break;
    }
    chunks.push({ segStart: start, segEnd: i - 1 });
  }
  return chunks;
}

interface Props {
  videoId: string;
  rawTranscript: string;
  onActiveChunkIdxChange: (idx: number) => void;
  onRegisterSeek: (fn: (ms: number) => void) => void;
}

export default function YouTubePlayer({ videoId, rawTranscript, onActiveChunkIdxChange, onRegisterSeek }: Props) {
  const playerRef = useRef<YTPlayer | null>(null);
  const playerElRef = useRef<HTMLDivElement>(null);
  const playerReadyRef = useRef(false);
  const lastChunkRef = useRef(-1);

  const segments = useMemo(() => (rawTranscript ? parseTranscript(rawTranscript) : []), [rawTranscript]);
  const chunks = useMemo(() => groupIntoChunks(segments), [segments]);

  useEffect(() => {
    // Read previously saved position (in seconds) for this video, if any.
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(POSITION_KEY(videoId)) : null;
    const startSeconds = saved ? Math.max(0, Math.floor(parseFloat(saved))) : 0;

    const init = () => {
      if (!playerElRef.current) return;
      playerRef.current = new window.YT.Player(playerElRef.current, {
        videoId,
        playerVars: {
          modestbranding: 1,
          rel: 0,
          ...(startSeconds > 2 ? { start: startSeconds } : {}),
        },
        events: {
          onReady: () => { playerReadyRef.current = true; },
        },
      });
    };
    if (window.YT?.Player) {
      init();
    } else {
      window.onYouTubeIframeAPIReady = init;
      if (!document.getElementById("yt-iframe-api")) {
        const script = document.createElement("script");
        script.id = "yt-iframe-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }
    return () => { playerRef.current?.destroy(); playerRef.current = null; playerReadyRef.current = false; };
  }, [videoId]);

  useEffect(() => {
    onRegisterSeek((ms) => playerRef.current?.seekTo(ms / 1000, true));
  }, [onRegisterSeek]);

  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerRef.current;
      if (!p || !playerReadyRef.current) return;
      const timeSec = p.getCurrentTime();
      const timeMs = timeSec * 1000;

      // Persist position so the video resumes where the user left off.
      // Avoid persisting before playback has really started, or at the very end.
      const duration = p.getDuration?.() ?? 0;
      if (timeSec > 1 && (duration === 0 || timeSec < duration - 2)) {
        try {
          window.localStorage.setItem(POSITION_KEY(videoId), String(Math.floor(timeSec)));
        } catch {
          /* localStorage may be unavailable (privacy mode) — ignore */
        }
      }

      if (segments.length === 0) return;
      let segIdx = 0;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].offset <= timeMs) segIdx = i;
        else break;
      }
      const chunkIdx = chunks.findIndex((c) => c.segStart <= segIdx && segIdx <= c.segEnd);
      if (chunkIdx !== lastChunkRef.current) {
        lastChunkRef.current = chunkIdx;
        onActiveChunkIdxChange(chunkIdx);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [videoId, segments, chunks, onActiveChunkIdxChange]);

  return <div ref={playerElRef} className="w-full h-full" />;
}
