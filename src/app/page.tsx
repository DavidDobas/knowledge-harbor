"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Sidebar from "@/components/layout/Sidebar";
import CenterPane from "@/components/layout/CenterPane";
import RightPanel from "@/components/layout/RightPanel";
import TabBar from "@/components/layout/TabBar";
import type { SelectedNode, Source, Space, Question, KnowledgeCard } from "@/lib/types";
import {
  TABS_STORAGE_KEY,
  createWorkspaceTab,
  tabToPersisted,
  DEFAULT_WORKSPACE,
  readPersistedWorkspace,
  type WorkspaceTab,
} from "@/lib/workspaceTabs";

export default function Home() {
  const [tabs, setTabs] = useState<WorkspaceTab[]>(DEFAULT_WORKSPACE.tabs);
  const [activeTabId, setActiveTabId] = useState(DEFAULT_WORKSPACE.activeTabId);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const activeTabIdRef = useRef(activeTabId);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [allSources, setAllSources] = useState<Source[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hydrating, setHydrating] = useState(false);

  const graphDataCache = useRef(new Map<string, {
    questions: Question[];
    cards: KnowledgeCard[];
    source?: Source;
  }>());
  const graphDataLoadedForRef = useRef<string | null>(null);

  const seekRef = useRef<((ms: number) => void) | null>(null);
  const handleRegisterSeek = useCallback((fn: (ms: number) => void) => { seekRef.current = fn; }, []);
  const handleSeekTo = useCallback((ms: number) => { seekRef.current?.(ms); }, []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId],
  );

  const patchActiveTab = useCallback((patch: Partial<WorkspaceTab>) => {
    const id = activeTabIdRef.current;
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const patchTab = useCallback((tabId: string, patch: Partial<WorkspaceTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  }, []);

  const fetchFullSourceDetails = useCallback((sourceId: string, tabId?: string) => {
    fetch(`/api/sources/${sourceId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((full) => {
        if (!full?.id) return;
        const id = tabId ?? activeTabIdRef.current;
        setTabs((prev) => prev.map((t) => {
          if (t.id !== id) return t;
          if (t.activeSourceId !== full.id) return t;
          return { ...t, activeSource: { ...(t.activeSource ?? full), ...full } };
        }));
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
      .then((r) => {
        if (!r.ok) throw new Error(`graph fetch failed: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const result = {
          questions: Array.isArray(data.questions) ? data.questions as Question[] : [],
          cards: Array.isArray(data.cards) ? data.cards as KnowledgeCard[] : [],
          source: data.source?.id ? data.source as Source : undefined,
        };
        graphDataCache.current.set(sourceId, result);
        return result;
      })
      .catch(() => ({ questions: [], cards: [], source: undefined }));
  }, []);

  const prefetchSourceGraph = useCallback((source: Source) => {
    loadSourceGraphData(source.id);
  }, [loadSourceGraphData]);

  const ensureSourceGraphReady = useCallback(
    (sourceId: string) => loadSourceGraphData(sourceId),
    [loadSourceGraphData],
  );

  const handleDrillInComplete = useCallback(() => {
    patchActiveTab({ drillInTransition: false });
  }, [patchActiveTab]);

  // Load graph data when the active tab's source changes.
  useEffect(() => {
    const tab = tabs.find((t) => t.id === activeTabId);
    const sourceId = tab?.activeSource?.id;
    if (!sourceId || !tab) {
      graphDataLoadedForRef.current = null;
      return;
    }
    if (graphDataLoadedForRef.current === sourceId) return;
    // Guard 2: skip re-fetch if data is already in tab state AND we've previously loaded it
    // in this session (ref !== null). The null check is important — after refresh() clears
    // the ref, this guard must NOT fire, otherwise stale data prevents the re-fetch.
    if (graphDataLoadedForRef.current !== null && tab.sourceQuestions.length > 0 && tab.activeSourceId === sourceId) {
      graphDataLoadedForRef.current = sourceId;
      return;
    }

    const tabId = tab.id;
    loadSourceGraphData(sourceId).then((data) => {
      graphDataLoadedForRef.current = sourceId;
      setTabs((prev) => prev.map((t) => {
        if (t.id !== tabId || t.activeSourceId !== sourceId) return t;
        return {
          ...t,
          sourceQuestions: data.questions,
          sourceCards: data.cards,
          ...(data.source && t.activeSource
            ? { activeSource: { ...t.activeSource, ...data.source } }
            : {}),
        };
      }));
    });
  }, [activeTabId, tabs, activeTab?.activeSourceId, activeTab?.id, activeTab?.sourceQuestions.length, refreshKey, loadSourceGraphData]);

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
    () => (activeTab?.selectedSpaceId
      ? allSources.filter((s) => s.spaceId === activeTab.selectedSpaceId)
      : allSources),
    [allSources, activeTab],
  );

  const updateActiveSource = useCallback((updates: Partial<Source>) => {
    const id = activeTabIdRef.current;
    setTabs((prev) => prev.map((t) => {
      if (t.id !== id || !t.activeSource) return t;
      return { ...t, activeSource: { ...t.activeSource, ...updates } };
    }));
  }, []);

  const handleSpaceLayoutPersisted = useCallback((spaceId: string, graphLayout: string) => {
    setSpaces((prev) => prev.map((s) => (s.id === spaceId ? { ...s, graphLayout } : s)));
  }, []);

  const handleSourceTitleChange = useCallback((sourceId: string, title: string) => {
    const tabId = activeTabIdRef.current;
    setTabs((prev) => prev.map((t) => {
      if (t.id !== tabId) return t;
      return {
        ...t,
        label: t.activeSourceId === sourceId ? title : t.label,
        activeSource: t.activeSource?.id === sourceId ? { ...t.activeSource, title } : t.activeSource,
      };
    }));
    setAllSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, title } : s)));
  }, []);

  // Restore tabs from localStorage after mount (keeps SSR and first client paint identical).
  useEffect(() => {
    const saved = readPersistedWorkspace();
    queueMicrotask(() => {
      if (saved) {
        setTabs(saved.tabs);
        setActiveTabId(saved.activeTabId);
        const pending = saved.tabs.filter((t) => t.activeSourceId);
        if (pending.length) {
          setHydrating(true);
          Promise.all(
            pending.map((t) =>
              fetch(`/api/sources/${t.activeSourceId}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((src) => {
                  if (!src?.id) return;
                  setTabs((prev) => prev.map((tab) => {
                    if (tab.id !== t.id) return tab;
                    return {
                      ...tab,
                      activeSource: src,
                      label: src.title ?? tab.label,
                      sourceType: src.type ?? tab.sourceType,
                    };
                  }));
                }),
            ),
          ).finally(() => setHydrating(false));
        }
      }
      setWorkspaceReady(true);
    });
  }, []);

  useEffect(() => {
    if (!workspaceReady || hydrating) return;
    try {
      window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify({
        tabs: tabs.map(tabToPersisted),
        activeTabId,
      }));
    } catch { /* ignore */ }
  }, [workspaceReady, hydrating, tabs, activeTabId]);

  const handleSelectNode = useCallback((node: SelectedNode | null) => {
    patchActiveTab({
      selectedNode: node,
      ...(node?.type === "question" || node?.type === "ask" ? { pdfSelection: null } : {}),
    });
  }, [patchActiveTab]);

  const handleSelectSourceFromGraph = useCallback((
    source: Source,
    opts?: {
      drillIn?: boolean;
      graphData?: { questions: Question[]; cards: KnowledgeCard[]; source?: Source };
    },
  ) => {
    const tabId = activeTabIdRef.current;
    const graphData = opts?.graphData ?? graphDataCache.current.get(source.id);
    if (graphData) graphDataLoadedForRef.current = source.id;
    const graphSource = opts?.graphData?.source;
    const merged = graphSource ? { ...source, ...graphSource } : source;

    patchTab(tabId, {
      label: source.title,
      sourceType: source.type,
      selectedSpaceId: source.spaceId,
      activeSourceId: source.id,
      activeSource: merged,
      drillInTransition: opts?.drillIn ?? false,
      selectedNode: null,
      activeChunkIdx: -1,
      pdfSelection: null,
      viewMode: "graph",
      sourceQuestions: graphData?.questions ?? [],
      sourceCards: graphData?.cards ?? [],
    });
    fetchFullSourceDetails(source.id, tabId);
  }, [patchTab, fetchFullSourceDetails]);

  const handleSelectSpace = useCallback((spaceId: string | null) => {
    patchActiveTab({
      selectedSpaceId: spaceId,
      activeSource: null,
      activeSourceId: null,
      sourceType: null,
      label: spaceId ? (spaces.find((s) => s.id === spaceId)?.name ?? "Space") : "New tab",
      drillInTransition: false,
      selectedNode: null,
      activeChunkIdx: -1,
      pdfSelection: null,
      viewMode: "graph",
      sourceQuestions: [],
      sourceCards: [],
    });
    graphDataLoadedForRef.current = null;
  }, [patchActiveTab, spaces]);

  const handleOpenSource = useCallback(async (sourceId: string) => {
    try {
      const src = await fetch(`/api/sources/${sourceId}`).then((r) => r.json());
      if (src?.id) handleSelectSourceFromGraph(src);
    } catch { /* ignore */ }
  }, [handleSelectSourceFromGraph]);

  const handleOpenThread = useCallback(async (questionId: string) => {
    try {
      const q = await fetch(`/api/questions/${questionId}`).then((r) => r.json());
      if (!q?.sourceId) return;
      const tabId = activeTabIdRef.current;
      const tab = tabs.find((t) => t.id === tabId);
      if (q.sourceId !== tab?.activeSourceId) {
        const src = await fetch(`/api/sources/${q.sourceId}`).then((r) => r.json());
        patchTab(tabId, {
          activeSource: src,
          activeSourceId: src.id,
          label: src.title,
          sourceType: src.type,
          selectedSpaceId: src.spaceId ?? null,
        });
        fetchFullSourceDetails(src.id, tabId);
      }
      patchTab(tabId, {
        pdfSelection: null,
        selectedNode: { type: "question", id: questionId },
      });
    } catch { /* ignore */ }
  }, [tabs, patchTab, fetchFullSourceDetails]);

  const handleNewTab = useCallback(() => {
    const tab = createWorkspaceTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    graphDataLoadedForRef.current = null;
  }, []);

  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
    graphDataLoadedForRef.current = null;
  }, []);

  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) {
        const fresh = createWorkspaceTab();
        setActiveTabId(fresh.id);
        graphDataLoadedForRef.current = null;
        return [fresh];
      }
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabIdRef.current) {
        const neighbor = next[Math.min(idx, next.length - 1)];
        setActiveTabId(neighbor.id);
        graphDataLoadedForRef.current = null;
      }
      return next;
    });
  }, []);

  const tabBarItems = useMemo(
    () => tabs.map((t) => ({ id: t.id, label: t.label, sourceType: t.sourceType })),
    [tabs],
  );

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <TabBar
        tabs={tabBarItems}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          spaces={spaces}
          sources={visibleSources}
          selectedSpaceId={activeTab?.selectedSpaceId ?? null}
          activeSourceId={activeTab?.activeSourceId ?? null}
          onSelectSpace={handleSelectSpace}
          onSelectSource={handleSelectSourceFromGraph}
          onSourceAdded={refresh}
          onSpaceAdded={refresh}
        />

        <div className="flex-1 flex min-w-0 overflow-hidden relative">
          {tabs.map((tab) => {
            const visible = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className="absolute inset-0 flex min-w-0 overflow-hidden"
                style={{ display: visible ? "flex" : "none" }}
                aria-hidden={!visible}
              >
                <CenterPane
                  activeSource={tab.activeSource}
                  spaces={spaces}
                  allSources={allSources}
                  questions={tab.sourceQuestions}
                  cards={tab.sourceCards}
                  drillInTransition={tab.drillInTransition}
                  onDrillInComplete={handleDrillInComplete}
                  onPrefetchSource={prefetchSourceGraph}
                  onEnsureSourceGraphReady={ensureSourceGraphReady}
                  selectedSpaceId={tab.selectedSpaceId}
                  selectedNode={tab.selectedNode}
                  viewMode={tab.viewMode}
                  onSetViewMode={(mode) => patchTab(tab.id, { viewMode: mode })}
                  onSelectNode={visible ? handleSelectNode : () => {}}
                  onSelectSpace={handleSelectSpace}
                  onSelectSource={handleSelectSourceFromGraph}
                  onGraphRefresh={refresh}
                  onActiveChunkIdxChange={(idx) => patchTab(tab.id, { activeChunkIdx: idx })}
                  onRegisterSeek={visible ? handleRegisterSeek : () => {}}
                  onPdfTextSelect={(text, page, rects) => {
                    if (!visible) return;
                    patchTab(tab.id, { pdfSelection: { text, page, rects }, selectedNode: null });
                  }}
                  onClearPdfSelection={() => patchTab(tab.id, { pdfSelection: null })}
                  onActiveSourceUpdate={visible ? updateActiveSource : () => {}}
                  onSpaceLayoutPersisted={visible ? handleSpaceLayoutPersisted : undefined}
                  pdfSelection={tab.pdfSelection}
                />
                <RightPanel
                  activeSource={tab.activeSource}
                  selectedNode={tab.selectedNode}
                  activeChunkIdx={tab.activeChunkIdx}
                  viewMode={tab.viewMode}
                  onSeekTo={handleSeekTo}
                  onSelectNode={visible ? handleSelectNode : () => {}}
                  onGraphRefresh={refresh}
                  onActiveSourceUpdate={visible ? updateActiveSource : () => {}}
                  pdfSelection={tab.pdfSelection}
                  onClearPdfSelection={() => patchTab(tab.id, { pdfSelection: null })}
                  onOpenThread={handleOpenThread}
                  onOpenSource={handleOpenSource}
                  pendingInitialMessage={tab.pendingInitialMessage}
                  onPdfQuestionCreated={(questionId, message, passage, page) => {
                    if (!visible) return;
                    refresh();
                    patchTab(tab.id, {
                      pdfSelection: null,
                      pendingInitialMessage: { questionId, message, passage, page },
                      selectedNode: { type: "question", id: questionId },
                    });
                  }}
                  onGeneralQuestionCreated={(questionId, message) => {
                    if (!visible) return;
                    const src = tab.activeSource;
                    const optimistic: Question = {
                      id: questionId,
                      sourceId: src?.id ?? "",
                      title: message,
                      origin: "general",
                      chunkOffset: null,
                      pdfPage: null,
                      pdfHighlightText: null,
                      pdfHighlightRects: null,
                      includeFile: src?.type === "pdf",
                      includeWeb: false,
                      createdAt: new Date().toISOString(),
                    };
                    patchTab(tab.id, {
                      pdfSelection: null,
                      pendingInitialMessage: { questionId, message },
                      selectedNode: { type: "question", id: questionId },
                      sourceQuestions: [...tab.sourceQuestions, optimistic],
                    });
                    if (src?.id) {
                      loadSourceGraphData(src.id).then((data) => {
                        patchTab(tab.id, {
                          sourceQuestions: data.questions,
                          sourceCards: data.cards,
                        });
                      });
                    } else {
                      refresh();
                    }
                  }}
                  onTranscriptQuestionCreated={(questionId, message) => {
                    if (!visible) return;
                    refresh();
                    patchTab(tab.id, {
                      pendingInitialMessage: { questionId, message },
                      selectedNode: { type: "question", id: questionId },
                    });
                  }}
                  onClearPendingInitialMessage={() => patchTab(tab.id, { pendingInitialMessage: null })}
                  onSourceTitleChange={visible ? handleSourceTitleChange : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
