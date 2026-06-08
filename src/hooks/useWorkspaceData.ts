"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import type { KnowledgeCard, Question, Source, Space } from "@/lib/types";

export function useWorkspaceData() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [allSources, setAllSources] = useState<Source[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const graphDataCache = useRef(new Map<string, {
    questions: Question[];
    cards: KnowledgeCard[];
    source?: Source;
  }>());

  const seekRef = useRef<((ms: number) => void) | null>(null);
  const handleRegisterSeek = useCallback((fn: (ms: number) => void) => { seekRef.current = fn; }, []);
  const handleSeekTo = useCallback((ms: number) => { seekRef.current?.(ms); }, []);

  const refresh = useCallback(() => {
    graphDataCache.current.clear();
    setRefreshKey((k) => k + 1);
  }, []);

  const loadSourceGraphData = useCallback((sourceId: string) => {
    const cached = graphDataCache.current.get(sourceId);
    if (cached) return Promise.resolve(cached);
    return fetch(`/api/sources/${sourceId}/graph`)
      .then((r) => r.json())
      .then((data) => {
        const result = {
          questions: Array.isArray(data.questions) ? data.questions as Question[] : [],
          cards: Array.isArray(data.cards) ? data.cards as KnowledgeCard[] : [],
          source: data.source?.id ? data.source as Source : undefined,
        };
        graphDataCache.current.set(sourceId, result);
        return result;
      });
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/spaces").then((r) => r.json()),
      fetch("/api/sources").then((r) => r.json()),
    ]).then(([sp, srcs]) => {
      if (Array.isArray(sp)) setSpaces(sp);
      if (Array.isArray(srcs)) setAllSources(srcs);
    }).catch(() => {});
  }, [refreshKey]);

  const handleSourceTitleChange = useCallback((sourceId: string, title: string) => {
    setAllSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, title } : s)));
  }, []);

  const fetchFullSource = useCallback((sourceId: string) => {
    return fetch(`/api/sources/${sourceId}`).then((r) => r.json()) as Promise<Source>;
  }, []);

  return {
    spaces,
    setSpaces,
    allSources,
    setAllSources,
    refresh,
    refreshKey,
    loadSourceGraphData,
    graphDataCache,
    handleRegisterSeek,
    handleSeekTo,
    handleSourceTitleChange,
    fetchFullSource,
  };
}
