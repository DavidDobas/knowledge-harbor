"use client";

import { useEffect, useState } from "react";
import type { DisplayChunk } from "@/lib/transcriptChunks";
import type { Question } from "@/lib/types";

/** Map chunk index → question id for passage threads on a source. */
export function useChunkQuestions(sourceId: string, chunks: DisplayChunk[]) {
  const [chunkQuestions, setChunkQuestions] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch(`/api/questions?sourceId=${sourceId}`)
      .then((r) => r.json())
      .then((qs: Array<{ id: string; chunkOffset: number | null }>) => {
        const map: Record<number, string> = {};
        qs.forEach((q) => {
          if (q.chunkOffset == null) return;
          const ci = chunks.findIndex((c) => c.offset === q.chunkOffset);
          if (ci >= 0) map[ci] = q.id;
        });
        setChunkQuestions(map);
      })
      .catch(() => {});
  }, [sourceId, chunks]);

  return { chunkQuestions, setChunkQuestions };
}

export function useSourceQuestionsList(sourceId: string) {
  const [state, setState] = useState<{ sourceId: string; questions: Question[]; ready: boolean }>({
    sourceId: "",
    questions: [],
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/questions?sourceId=${sourceId}`)
      .then((r) => r.json())
      .then((qs: Question[]) => {
        if (!cancelled) {
          setState({ sourceId, questions: Array.isArray(qs) ? qs : [], ready: true });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ sourceId, questions: [], ready: true });
      });
    return () => { cancelled = true; };
  }, [sourceId]);

  const loaded = state.sourceId === sourceId && state.ready;
  const questions = state.sourceId === sourceId ? state.questions : [];

  const refresh = () => {
    fetch(`/api/questions?sourceId=${sourceId}`)
      .then((r) => r.json())
      .then((qs: Question[]) => {
        setState((prev) =>
          prev.sourceId === sourceId ? { ...prev, questions: Array.isArray(qs) ? qs : [] } : prev,
        );
      })
      .catch(() => {});
  };

  const setQuestions = (next: Question[] | ((prev: Question[]) => Question[])) => {
    setState((prev) => {
      if (prev.sourceId !== sourceId) return prev;
      const questions = typeof next === "function" ? next(prev.questions) : next;
      return { ...prev, questions };
    });
  };

  return { questions, loaded, refresh, setQuestions };
}
