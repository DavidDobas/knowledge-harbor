"use client";

import { useEffect, useRef, useMemo } from "react";
import { parseTranscript } from "@/lib/youtube";
import { groupIntoChunkIndices } from "@/lib/transcriptChunks";

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
  const pendingSeekMsRef = useRef<number | null>(null);
  const lastChunkRef = useRef(-1);

  function seekToMs(ms: number) {
    const p = playerRef.current;
    if (!p || !playerReadyRef.current || typeof p.seekTo !== "function") {
      pendingSeekMsRef.current = ms;
      return;
    }
    p.seekTo(ms / 1000, true);
  }

  const segments = useMemo(() => (rawTranscript ? parseTranscript(rawTranscript) : []), [rawTranscript]);
  const chunks = useMemo(() => groupIntoChunkIndices(segments), [segments]);

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
          onReady: () => {
            playerReadyRef.current = true;
            const pending = pendingSeekMsRef.current;
            if (pending != null) {
              pendingSeekMsRef.current = null;
              const ready = playerRef.current;
              if (ready && typeof ready.seekTo === "function") {
                ready.seekTo(pending / 1000, true);
              }
            }
          },
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
    return () => {
      playerReadyRef.current = false;
      pendingSeekMsRef.current = null;
      const p = playerRef.current;
      playerRef.current = null;
      if (p && typeof p.destroy === "function") p.destroy();
    };
  }, [videoId]);

  useEffect(() => {
    onRegisterSeek(seekToMs);
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

  // Wrap in a stable container div that React owns. The YouTube IFrame API replaces
  // the inner div with an <iframe>, so React must never try to removeChild it directly —
  // only the outer wrapper is managed by React's reconciler.
  return (
    <div className="w-full h-full">
      <div ref={playerElRef} className="w-full h-full" />
    </div>
  );
}
