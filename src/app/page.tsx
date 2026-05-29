"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Sidebar from "@/components/layout/Sidebar";
import CenterPane from "@/components/layout/CenterPane";
import RightPanel from "@/components/layout/RightPanel";
import type { SelectedNode, Source, Space, Question, KnowledgeCard } from "@/lib/types";

const NAV_STATE_KEY = "kh.navState";

export default function Home() {
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [allSources, setAllSources] = useState<Source[]>([]);
  const [activeSource, setActiveSource] = useState<(Source & { pdfUrl?: string }) | null>(null);
  const [sourceQuestions, setSourceQuestions] = useState<Question[]>([]);
  const [sourceCards, setSourceCards] = useState<KnowledgeCard[]>([]);
  const [drillInTransition, setDrillInTransition] = useState(false);
  const graphDataCache = useRef(new Map<string, {
    questions: Question[];
    cards: KnowledgeCard[];
    source?: Source;
  }>());
  const graphDataLoadedForRef = useRef<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [activeChunkIdx, setActiveChunkIdx] = useState(-1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pdfSelection, setPdfSelection] = useState<{ text: string; page: number; rects: { x:number; y:number; w:number; h:number }[] } | null>(null);
  const [viewMode, setViewMode] = useState<"graph" | "viewer">("graph");
  // First message to auto-send when a freshly-created PDF question thread opens.
  // Passage + page are carried through so the thread panel can render the highlighted
  // context immediately on mount — without it, there's a visible flicker between
  // PDFSelectionPanel and QuestionPanel while the question row is fetched.
  const [pendingInitialMessage, setPendingInitialMessage] = useState<{
    questionId: string;
    message: string;
    passage?: string;
    page?: number;
  } | null>(null);
  // While true (until restore completes), we don't persist nav state — avoids clobbering
  // the saved state with initial defaults before it's read back.
  const [restoring, setRestoring] = useState(true);

  const seekRef = useRef<((ms: number) => void) | null>(null);
  const handleRegisterSeek = useCallback((fn: (ms: number) => void) => { seekRef.current = fn; }, []);
  const handleSeekTo = useCallback((ms: number) => { seekRef.current?.(ms); }, []);

  const fetchFullSourceDetails = useCallback((sourceId: string) => {
    fetch(`/api/sources/${sourceId}`)
      .then((r) => r.json())
      .then((full) => {
        if (full?.id) {
          setActiveSource((prev) => (prev?.id === full.id ? { ...prev, ...full } : full));
        }
      })
      .catch(() => {});
  }, []);

  const refresh = () => {
    graphDataCache.current.clear();
    graphDataLoadedForRef.current = null;
    setRefreshKey((k) => k + 1);
  };

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

  const prefetchSourceGraph = useCallback((source: Source) => {
    loadSourceGraphData(source.id);
  }, [loadSourceGraphData]);

  // Single slim round-trip: graph nodes + fresh graphLayout (no transcript/notes/summary).
  const ensureSourceGraphReady = useCallback(
    (sourceId: string) => loadSourceGraphData(sourceId),
    [loadSourceGraphData],
  );

  const handleDrillInComplete = useCallback(() => {
    setDrillInTransition(false);
  }, []);

  // Load questions/cards when the active source changes — skip if already loaded
  // (e.g. drill-in prefetched graph data before activeSource was set).
  useEffect(() => {
    if (!activeSource) {
      setSourceQuestions([]);
      setSourceCards([]);
      graphDataLoadedForRef.current = null;
      return;
    }
    if (graphDataLoadedForRef.current === activeSource.id) return;

    loadSourceGraphData(activeSource.id).then((data) => {
      graphDataLoadedForRef.current = activeSource.id;
      setSourceQuestions(data.questions);
      setSourceCards(data.cards);
      if (data.source) {
        setActiveSource((prev) =>
          prev?.id === data.source!.id ? { ...prev, ...data.source } : prev,
        );
      }
    });
  }, [activeSource?.id, refreshKey, loadSourceGraphData]);

  // Load spaces + all sources once; filter client-side when switching spaces.
  useEffect(() => {
    Promise.all([
      fetch("/api/spaces").then((r) => r.json()),
      fetch("/api/sources").then((r) => r.json()),
    ]).then(([sp, srcs]) => {
      if (Array.isArray(sp)) setSpaces(sp);
      if (Array.isArray(srcs)) setAllSources(srcs);
    }).catch(() => {});
  }, [refreshKey]);

  const visibleSources = useMemo(
    () => (selectedSpaceId ? allSources.filter((s) => s.spaceId === selectedSpaceId) : allSources),
    [allSources, selectedSpaceId],
  );

  // Merge a partial update into activeSource without triggering a server re-fetch (which
  // would generate a new pdfUrl and cause react-pdf to reload the binary). Used for
  // things like adding/deleting PDF highlights — they don't affect the graph or the PDF.
  const updateActiveSource = useCallback((updates: Partial<Source>) => {
    setActiveSource((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  // Restore navigation state from before the last refresh.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(NAV_STATE_KEY); } catch { /* ignore */ }
    if (!saved) { setRestoring(false); return; }
    try {
      const s = JSON.parse(saved) as {
        selectedSpaceId?: string | null;
        activeSourceId?: string | null;
        viewMode?: "graph" | "viewer";
        selectedNode?: SelectedNode | null;
      };
      if (s.selectedSpaceId !== undefined) setSelectedSpaceId(s.selectedSpaceId);
      if (s.viewMode) setViewMode(s.viewMode);
      if (s.selectedNode) setSelectedNode(s.selectedNode);
      if (s.activeSourceId) {
        fetch(`/api/sources/${s.activeSourceId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((src) => { if (src?.id) setActiveSource(src); })
          .catch(() => {})
          .finally(() => setRestoring(false));
      } else {
        setRestoring(false);
      }
    } catch {
      setRestoring(false);
    }
  }, []);

  // Persist navigation state on change (after restore has completed).
  useEffect(() => {
    if (restoring) return;
    try {
      window.localStorage.setItem(NAV_STATE_KEY, JSON.stringify({
        selectedSpaceId,
        activeSourceId: activeSource?.id ?? null,
        viewMode,
        selectedNode,
      }));
    } catch { /* ignore */ }
  }, [restoring, selectedSpaceId, activeSource?.id, viewMode, selectedNode]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectNode(node: SelectedNode | null) {
    setSelectedNode(node);
    if (node?.type === "question") setPdfSelection(null);
  }

  const handleSelectSourceFromGraph = useCallback((
    source: Source,
    opts?: {
      drillIn?: boolean;
      graphData?: { questions: Question[]; cards: KnowledgeCard[]; source?: Source };
    },
  ) => {
    setSelectedSpaceId(source.spaceId);
    setDrillInTransition(opts?.drillIn ?? false);
    setSelectedNode(null);
    setActiveChunkIdx(-1);
    setPdfSelection(null);
    setViewMode("graph");
    const graphData = opts?.graphData ?? graphDataCache.current.get(source.id);
    if (graphData) {
      graphDataLoadedForRef.current = source.id;
      setSourceQuestions(graphData.questions);
      setSourceCards(graphData.cards);
    }
    const graphSource = opts?.graphData?.source;
    setActiveSource(graphSource ? { ...source, ...graphSource } : source);
    // Heavy fields (transcript, notes, pdfUrl) load in the background — graph doesn't wait.
    fetchFullSourceDetails(source.id);
  }, [fetchFullSourceDetails]);

  function handleSelectSpace(spaceId: string | null) {
    setSelectedSpaceId(spaceId);
    setActiveSource(null);
    setDrillInTransition(false);
    setSelectedNode(null);
    setActiveChunkIdx(-1);
    setPdfSelection(null);
    setViewMode("graph");
  }

  // Navigate to a source referenced from notes.
  async function handleOpenSource(sourceId: string) {
    try {
      const src = await fetch(`/api/sources/${sourceId}`).then((r) => r.json());
      if (src?.id) handleSelectSourceFromGraph(src);
    } catch { /* ignore */ }
  }

  // Open a chat thread referenced from notes. The thread may belong to a different source,
  // so we resolve its source, navigate there, and select the question node.
  async function handleOpenThread(questionId: string) {
    try {
      const q = await fetch(`/api/questions/${questionId}`).then((r) => r.json());
      if (!q?.sourceId) return;
      if (q.sourceId !== activeSource?.id) {
        const src = await fetch(`/api/sources/${q.sourceId}`).then((r) => r.json());
        setActiveSource(src);
        setSelectedSpaceId(src.spaceId ?? null);
      }
      setPdfSelection(null);
      // Keep the current viewMode — if the user is watching the video, opening a
      // referenced thread shouldn't kick them out of the viewer.
      setSelectedNode({ type: "question", id: questionId });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <header className="h-11 shrink-0 flex items-center px-4 gap-3 border-b" style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <span className="type-serif font-semibold text-sm" style={{ color: "var(--foreground)", letterSpacing: "-0.01em" }}>KnowledgeHarbor</span>
          {activeSource && (
            <>
              <span className="type-mono" style={{ fontSize: "0.65rem", color: "var(--border)" }}>›</span>
              <span className="type-mono" style={{ fontSize: "0.7rem", color: "var(--text-secondary)", letterSpacing: "0.01em" }}>{activeSource.title}</span>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          spaces={spaces}
          sources={visibleSources}
          selectedSpaceId={selectedSpaceId}
          onSelectSpace={handleSelectSpace}
          onSelectSource={handleSelectSourceFromGraph}
          onSourceAdded={refresh}
          onSpaceAdded={refresh}
        />
        <CenterPane
          activeSource={activeSource}
          spaces={spaces}
          allSources={allSources}
          questions={sourceQuestions}
          cards={sourceCards}
          drillInTransition={drillInTransition}
          onDrillInComplete={handleDrillInComplete}
          onPrefetchSource={prefetchSourceGraph}
          onEnsureSourceGraphReady={ensureSourceGraphReady}
          selectedSpaceId={selectedSpaceId}
          selectedNode={selectedNode}
          viewMode={viewMode}
          onSetViewMode={setViewMode}
          onSelectNode={handleSelectNode}
          onSelectSpace={(id) => handleSelectSpace(id)}
          onSelectSource={handleSelectSourceFromGraph}
          onGraphRefresh={refresh}
          onActiveChunkIdxChange={setActiveChunkIdx}
          onRegisterSeek={handleRegisterSeek}
          onPdfTextSelect={(text, page, rects) => { setPdfSelection({ text, page, rects }); setSelectedNode(null); }}
          onClearPdfSelection={() => setPdfSelection(null)}
          onActiveSourceUpdate={updateActiveSource}
          pdfSelection={pdfSelection}
        />
        <RightPanel
          activeSource={activeSource}
          selectedNode={selectedNode}
          activeChunkIdx={activeChunkIdx}
          viewMode={viewMode}
          onSeekTo={handleSeekTo}
          onSelectNode={handleSelectNode}
          onGraphRefresh={refresh}
          onActiveSourceUpdate={updateActiveSource}
          pdfSelection={pdfSelection}
          onClearPdfSelection={() => setPdfSelection(null)}
          onOpenThread={handleOpenThread}
          onOpenSource={handleOpenSource}
          pendingInitialMessage={pendingInitialMessage}
          onPdfQuestionCreated={(questionId, message, passage, page) => {
            setPdfSelection(null);
            setPendingInitialMessage({ questionId, message, passage, page });
            setSelectedNode({ type: "question", id: questionId });
          }}
        />
      </div>
    </div>
  );
}
