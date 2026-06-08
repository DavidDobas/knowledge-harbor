"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { extractVideoId } from "@/lib/youtube";
import { parseTranscript } from "@/lib/youtube";
import { groupIntoChunks, buildContext } from "@/lib/transcriptChunks";
import { useChunkQuestions } from "@/hooks/useSourceQuestions";
import type { NotesViewHandle } from "@/components/source/NotesView";
import type { Question, Source } from "@/lib/types";
import MobileTabBar from "./MobileTabBar";
import MobileTranscriptTab from "./MobileTranscriptTab";
import MobileNotesTab from "./MobileNotesTab";
import MobileThreadsTab from "./MobileThreadsTab";
import MobileAskSheet from "./MobileAskSheet";

const YouTubePlayer = dynamic(() => import("@/components/source/YouTubePlayer"), { ssr: false });

type Tab = "transcript" | "notes" | "threads";

interface Props {
  source: Source;
  questions: Question[];
  activeChunkIdx: number;
  onBack: () => void;
  onSeekTo: (ms: number) => void;
  onRegisterSeek: (fn: (ms: number) => void) => void;
  onActiveChunkIdxChange: (idx: number) => void;
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
  onQuestionsRefresh: () => void;
}

export default function MobileYouTubeSource({
  source,
  questions,
  activeChunkIdx,
  onBack,
  onSeekTo,
  onRegisterSeek,
  onActiveChunkIdxChange,
  onOpenThread,
  onOpenSource,
  onQuestionsRefresh,
}: Props) {
  const [tab, setTab] = useState<Tab>("transcript");
  const [askChunkIdx, setAskChunkIdx] = useState<number | null>(null);
  const notesEditorRef = useRef<NotesViewHandle | null>(null);

  const videoId = source.youtubeUrl ? extractVideoId(source.youtubeUrl) : null;
  const segments = useMemo(() => (source.transcript ? parseTranscript(source.transcript) : []), [source.transcript]);
  const chunks = useMemo(() => groupIntoChunks(segments), [segments]);
  const { chunkQuestions, setChunkQuestions } = useChunkQuestions(source.id, chunks);

  async function handleAskSubmit(message: string, includeWeb: boolean): Promise<string | null> {
    if (askChunkIdx === null) return null;
    const context = buildContext(segments, chunks, askChunkIdx);
    const chunkOffset = chunks[askChunkIdx].offset;
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: source.id, title: message, context, chunkOffset, includeWeb }),
    });
    if (!res.ok) return null;
    const question = await res.json();
    setChunkQuestions((prev) => ({ ...prev, [askChunkIdx]: question.id }));
    onQuestionsRefresh();

    const streamRes = await fetch(`/api/questions/${question.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    if (streamRes.body) {
      const reader = streamRes.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }
    onQuestionsRefresh();
    return question.id;
  }

  function handleCite(ci: number) {
    notesEditorRef.current?.insertCitation(chunks[ci].offset);
    setTab("notes");
  }

  const askChunk = askChunkIdx !== null ? chunks[askChunkIdx] : null;

  return (
    <div className="mobile-youtube-layout flex flex-col h-full min-h-0" style={{ background: "var(--background)" }}>
      <div className="mobile-video-stage relative shrink-0 z-0">
        <div className="w-full aspect-video bg-black">
          {videoId && (
            <YouTubePlayer
              key={source.id}
              videoId={videoId}
              rawTranscript={source.transcript ?? ""}
              onActiveChunkIdxChange={onActiveChunkIdxChange}
              onRegisterSeek={onRegisterSeek}
            />
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mobile-video-overlay-btn"
          aria-label="Back to library"
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      <div className="mobile-content-sheet flex-1 flex flex-col min-h-0 z-10">
        <MobileTabBar
          tabs={[
            { id: "transcript", label: "Transcript" },
            { id: "notes", label: "Notes" },
            { id: "threads", label: "Threads" },
          ]}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
        />

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {tab === "transcript" && (
          <MobileTranscriptTab
            chunks={chunks}
            activeChunkIdx={activeChunkIdx}
            chunkQuestions={chunkQuestions}
            onSeekTo={onSeekTo}
            onAsk={(ci) => setAskChunkIdx(ci)}
            onCite={handleCite}
          />
        )}
        {tab === "notes" && (
          <MobileNotesTab
            sourceId={source.id}
            onSeekTo={onSeekTo}
            onOpenThread={onOpenThread}
            onOpenSource={onOpenSource}
            editorRef={notesEditorRef}
          />
        )}
        {tab === "threads" && (
          <MobileThreadsTab questions={questions} onOpenThread={onOpenThread} />
        )}
        </div>
      </div>

      {askChunk && askChunkIdx !== null && (
        <MobileAskSheet
          chunk={askChunk}
          chunkIdx={askChunkIdx}
          existingQuestionId={chunkQuestions[askChunkIdx]}
          onClose={() => setAskChunkIdx(null)}
          onSubmit={handleAskSubmit}
          onOpenThread={(qid) => {
            setAskChunkIdx(null);
            onOpenThread(qid);
          }}
        />
      )}
    </div>
  );
}
