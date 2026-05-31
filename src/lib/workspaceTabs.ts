import type { SelectedNode, Source, SourceType, Question, KnowledgeCard } from "./types";

export const TABS_STORAGE_KEY = "kh.workspaceTabs";
export const LEGACY_NAV_KEY = "kh.navState";

export interface TabPendingMessage {
  questionId: string;
  message: string;
  passage?: string;
  page?: number;
}

export interface TabPdfSelection {
  text: string;
  page: number;
  rects: { x: number; y: number; w: number; h: number }[];
}

/** Serializable tab snapshot for localStorage (no heavy source blobs). */
export interface WorkspaceTabPersisted {
  id: string;
  label: string;
  sourceType: SourceType | null;
  selectedSpaceId: string | null;
  activeSourceId: string | null;
  selectedNode: SelectedNode | null;
  viewMode: "graph" | "viewer";
  activeChunkIdx: number;
  pdfSelection: TabPdfSelection | null;
  pendingInitialMessage: TabPendingMessage | null;
}

/** Full in-memory tab — includes cached source + graph data for instant switching. */
export interface WorkspaceTab extends WorkspaceTabPersisted {
  activeSource: (Source & { pdfUrl?: string }) | null;
  sourceQuestions: Question[];
  sourceCards: KnowledgeCard[];
  drillInTransition: boolean;
}

export function createWorkspaceTab(overrides?: Partial<WorkspaceTab>): WorkspaceTab {
  return {
    id: crypto.randomUUID(),
    label: "New tab",
    sourceType: null,
    selectedSpaceId: null,
    activeSourceId: null,
    activeSource: null,
    selectedNode: null,
    viewMode: "graph",
    activeChunkIdx: -1,
    pdfSelection: null,
    pendingInitialMessage: null,
    sourceQuestions: [],
    sourceCards: [],
    drillInTransition: false,
    ...overrides,
  };
}

export function tabToPersisted(tab: WorkspaceTab): WorkspaceTabPersisted {
  return {
    id: tab.id,
    label: tab.label,
    sourceType: tab.sourceType,
    selectedSpaceId: tab.selectedSpaceId,
    activeSourceId: tab.activeSourceId,
    selectedNode: tab.selectedNode,
    viewMode: tab.viewMode,
    activeChunkIdx: tab.activeChunkIdx,
    pdfSelection: tab.pdfSelection,
    pendingInitialMessage: tab.pendingInitialMessage,
  };
}

export function persistedToTab(p: WorkspaceTabPersisted): WorkspaceTab {
  return {
    ...p,
    activeSource: null,
    sourceQuestions: [],
    sourceCards: [],
    drillInTransition: false,
  };
}

let cachedInitialWorkspace: { tabs: WorkspaceTab[]; activeTabId: string } | null = null;

/** Read persisted tabs once on first client render (shared by tabs + activeTabId state inits). */
export function getInitialWorkspace(): { tabs: WorkspaceTab[]; activeTabId: string } {
  if (cachedInitialWorkspace) return cachedInitialWorkspace;

  const fallback = () => {
    const tab = createWorkspaceTab();
    cachedInitialWorkspace = { tabs: [tab], activeTabId: tab.id };
    return cachedInitialWorkspace;
  };

  if (typeof window === "undefined") return fallback();

  try {
    let savedTabs: { tabs: WorkspaceTabPersisted[]; activeTabId: string } | null = null;
    const raw = window.localStorage.getItem(TABS_STORAGE_KEY);
    if (raw) savedTabs = JSON.parse(raw);

    if (!savedTabs?.tabs?.length) {
      const legacy = window.localStorage.getItem(LEGACY_NAV_KEY);
      if (legacy) {
        const s = JSON.parse(legacy) as {
          selectedSpaceId?: string | null;
          activeSourceId?: string | null;
          viewMode?: "graph" | "viewer";
          selectedNode?: SelectedNode | null;
        };
        const tab = createWorkspaceTab({
          selectedSpaceId: s.selectedSpaceId ?? null,
          activeSourceId: s.activeSourceId ?? null,
          selectedNode: s.selectedNode ?? null,
          viewMode: s.viewMode ?? "graph",
          label: "Restored",
        });
        savedTabs = { tabs: [tabToPersisted(tab)], activeTabId: tab.id };
      }
    }

    if (savedTabs?.tabs?.length) {
      const restored = savedTabs.tabs.map(persistedToTab);
      cachedInitialWorkspace = {
        tabs: restored,
        activeTabId: savedTabs.activeTabId || restored[0].id,
      };
      return cachedInitialWorkspace;
    }
  } catch { /* ignore */ }

  return fallback();
}
