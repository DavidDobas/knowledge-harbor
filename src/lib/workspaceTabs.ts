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

/** Stable default for SSR + first client paint — must not read localStorage. */
const DEFAULT_TAB = createWorkspaceTab({ id: "00000000-0000-4000-8000-000000000001", label: "New tab" });
export const DEFAULT_WORKSPACE = { tabs: [DEFAULT_TAB], activeTabId: DEFAULT_TAB.id };

/** Read persisted tabs from localStorage (client-only, call from useEffect). */
export function readPersistedWorkspace(): { tabs: WorkspaceTab[]; activeTabId: string } | null {
  if (typeof window === "undefined") return null;

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
      return {
        tabs: restored,
        activeTabId: savedTabs.activeTabId || restored[0].id,
      };
    }
  } catch { /* ignore */ }

  return null;
}
