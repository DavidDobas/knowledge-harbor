"use client";

import { useCallback, useEffect, useState } from "react";
import type { Question, Source, Space } from "@/lib/types";
import MobileLibrary from "./MobileLibrary";
import MobileYouTubeSource from "./MobileYouTubeSource";
import MobileNoteSource from "./MobileNoteSource";
import MobileThreadScreen from "./MobileThreadScreen";
import { groupIntoChunks } from "@/lib/transcriptChunks";
import { parseTranscript } from "@/lib/youtube";

type Screen = "library" | "source" | "thread";

type WorkspaceData = {
  spaces: Space[];
  allSources: Source[];
  refresh: () => void;
  loadSourceGraphData: (sourceId: string) => Promise<{ questions: Question[] }>;
  fetchFullSource: (sourceId: string) => Promise<Source>;
  handleRegisterSeek: (fn: (ms: number) => void) => void;
  handleSeekTo: (ms: number) => void;
  handleSourceTitleChange: (sourceId: string, title: string) => void;
};

export default function MobileShell({
  spaces,
  allSources,
  refresh,
  loadSourceGraphData,
  fetchFullSource,
  handleRegisterSeek,
  handleSeekTo,
  handleSourceTitleChange,
}: WorkspaceData) {
  const [screen, setScreen] = useState<Screen>("library");
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [sourceQuestions, setSourceQuestions] = useState<Question[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeChunkIdx, setActiveChunkIdx] = useState(-1);

  const openSource = useCallback(async (source: Source) => {
    const full = await fetchFullSource(source.id);
    const merged = { ...source, ...full };
    const graph = await loadSourceGraphData(source.id);
    setActiveSource(merged);
    setSourceQuestions(graph.questions);
    setActiveChunkIdx(-1);
    setScreen("source");
  }, [fetchFullSource, loadSourceGraphData]);

  const refreshQuestions = useCallback(async () => {
    if (!activeSource) return;
    const qs = await fetch(`/api/questions?sourceId=${activeSource.id}`).then((r) => r.json());
    setSourceQuestions(Array.isArray(qs) ? qs : []);
    refresh();
  }, [activeSource, refresh]);

  const openThread = useCallback(async (questionId: string) => {
    let q = sourceQuestions.find((x) => x.id === questionId);
    if (!q) {
      try {
        q = await fetch(`/api/questions/${questionId}`).then((r) => r.json());
        if (q?.sourceId && q.sourceId !== activeSource?.id) {
          const src = allSources.find((s) => s.id === q!.sourceId);
          if (src) {
            await openSource(src);
          }
        }
        if (q?.id) {
          setSourceQuestions((prev) => (prev.some((x) => x.id === q!.id) ? prev : [...prev, q!]));
        }
      } catch { /* ignore */ }
    }
    setActiveQuestionId(questionId);
    setScreen("thread");
  }, [sourceQuestions, activeSource, allSources, openSource]);

  const activeQuestionFromList = activeQuestionId
    ? sourceQuestions.find((q) => q.id === activeQuestionId) ?? null
    : null;

  const [remoteQuestion, setRemoteQuestion] = useState<{ id: string; question: Question | null }>({
    id: "",
    question: null,
  });

  useEffect(() => {
    if (!activeQuestionId || activeQuestionFromList) return;
    let cancelled = false;
    fetch(`/api/questions/${activeQuestionId}`)
      .then((r) => r.json())
      .then((q: Question) => {
        if (!cancelled) setRemoteQuestion({ id: activeQuestionId, question: q });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeQuestionId, activeQuestionFromList]);

  const activeQuestion = activeQuestionFromList ?? (
    remoteQuestion.id === activeQuestionId ? remoteQuestion.question : null
  );

  const passageText = (() => {
    if (!activeQuestion || !activeSource?.transcript || activeQuestion.chunkOffset == null) return null;
    const segments = parseTranscript(activeSource.transcript);
    const chunks = groupIntoChunks(segments);
    const chunk = chunks.find((c) => c.offset === activeQuestion.chunkOffset);
    return chunk?.text ?? null;
  })();

  if (screen === "thread" && activeQuestion) {
    return (
      <MobileThreadScreen
        question={activeQuestion}
        passageText={passageText}
        onBack={() => setScreen("source")}
        onSummarized={refreshQuestions}
      />
    );
  }

  if (screen === "source" && activeSource) {
    if (activeSource.type === "youtube") {
      return (
        <MobileYouTubeSource
          source={activeSource}
          questions={sourceQuestions}
          activeChunkIdx={activeChunkIdx}
          onBack={() => { setScreen("library"); setActiveSource(null); }}
          onSeekTo={handleSeekTo}
          onRegisterSeek={handleRegisterSeek}
          onActiveChunkIdxChange={setActiveChunkIdx}
          onOpenThread={openThread}
          onOpenSource={async (id) => {
            const src = allSources.find((s) => s.id === id);
            if (src) await openSource(src);
          }}
          onQuestionsRefresh={refreshQuestions}
        />
      );
    }
    if (activeSource.type === "note") {
      return (
        <MobileNoteSource
          source={activeSource}
          onBack={() => { setScreen("library"); setActiveSource(null); }}
          onTitleChange={(title) => {
            handleSourceTitleChange(activeSource.id, title);
            setActiveSource((prev) => prev ? { ...prev, title } : prev);
          }}
          onOpenThread={openThread}
          onOpenSource={async (id) => {
            const src = allSources.find((s) => s.id === id);
            if (src) await openSource(src);
          }}
        />
      );
    }
    return (
      <div className="flex flex-col h-full items-center justify-center px-6 gap-4">
        <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
          PDF sources are available on desktop only.
        </p>
        <button onClick={() => setScreen("library")} className="type-mono text-xs" style={{ color: "var(--accent)" }}>
          ← Back to library
        </button>
      </div>
    );
  }

  return (
    <MobileLibrary
      spaces={spaces}
      sources={allSources}
      onSelectSource={openSource}
      onRefresh={refresh}
    />
  );
}
