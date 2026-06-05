"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";
import SourceNode from "./nodes/SourceNode";
import QuestionNode from "./nodes/QuestionNode";
import KnowledgeCardNode from "./nodes/KnowledgeCardNode";
import AskNode from "./nodes/AskNode";
import ClusterNode from "./nodes/ClusterNode";
import AreaNode from "./nodes/AreaNode";
import FloatingEdge from "./FloatingEdge";
import type { Space, Source, Question, KnowledgeCard, SelectedNode } from "@/lib/types";
import { isGeneralQuestion } from "@/lib/types";
import { extractVideoId } from "@/lib/youtube";
import { colorForSpaceIndex } from "@/lib/colors";

const nodeTypes = {
  source: SourceNode,
  ask: AskNode,
  question: QuestionNode,
  card: KnowledgeCardNode,
  cluster: ClusterNode,
  area: AreaNode,
};

interface AreaData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

const edgeTypes = {
  floating: FloatingEdge,
};

interface PendingDelete {
  nodeType: "source" | "question" | "card";
  id: string;
  label: string;
}

interface Props {
  level: 1 | 2 | 3;
  spaces: Space[];
  sources: Source[];
  // Level 2 only:
  space?: Space | null;
  // Level 3 only:
  source?: Source | null;
  questions?: Question[];
  cards?: KnowledgeCard[];
  drillInTransition?: boolean;
  onDrillInComplete?: () => void;
  onPrefetchSource?: (source: Source) => void;
  onEnsureSourceGraphReady?: (sourceId: string) => Promise<{ questions: Question[]; cards: KnowledgeCard[]; source?: Source }>;
  selectedNode: SelectedNode | null;
  onSelectNode: (node: SelectedNode) => void;
  onSelectSpace: (spaceId: string) => void;
  onSelectSource: (
    source: Source,
    opts?: {
      drillIn?: boolean;
      graphData?: { questions: Question[]; cards: KnowledgeCard[]; source?: Source };
      sourceSize?: { w: number; h: number };
    },
  ) => void;
  onOpenViewer: () => void;
  onGraphRefresh: () => void;
  onLayoutPersisted?: (graphLayout: string) => void;
  onSpaceLayoutPersisted?: (graphLayout: string) => void;
}

// Layout sizes — keep source the same size at L3 as it is in clusters (L1) so the
// L1→L3 transition is pure camera motion, no visible card resize.
const SRC_W = 180, SRC_H = 180;
const SRC_COMPACT_W = 180, SRC_COMPACT_H = 180;
const Q_W = 165, Q_H = 80;
const ASK_W = 52, ASK_H = 52;
const CLUSTER_PADDING_X = 36;
const CLUSTER_PADDING_TOP = 78;
const CLUSTER_PADDING_BOTTOM = 36;

// Zoom level at which the L1 zoom-in animation ends and the L3 view starts.
// Lower = source appears smaller; reduces perceived "pop" during the level switch.
const DRILL_IN_ZOOM = 1.3;
// Max zoom that fitView will settle to in L3, so the user can see context (questions/cards)
// rather than being parked too close to the source.
const L3_MAX_ZOOM = 0.75;

function layoutLevel3(source: Source, questions: Question[], cards: KnowledgeCard[]): { nodes: Node[]; edges: Edge[] } {
  const questionIds = new Set(questions.map((q) => q.id));
  const validCards = cards.filter((c) => questionIds.has(c.questionId));
  const generalQuestions = questions.filter((q) => isGeneralQuestion(q));
  const passageQuestions = questions.filter((q) => !isGeneralQuestion(q));
  const askId = `ask-${source.id}`;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 100, nodesep: 60 });

  g.setNode(`source-${source.id}`, { width: SRC_W, height: SRC_H });
  g.setNode(askId, { width: ASK_W, height: ASK_H });
  passageQuestions.forEach((q) => g.setNode(`question-${q.id}`, { width: Q_W, height: Q_H }));
  generalQuestions.forEach((q) => g.setNode(`question-${q.id}`, { width: Q_W, height: Q_H }));
  validCards.forEach((c) => g.setNode(`card-${c.id}`, { width: Q_W, height: Q_H }));

  g.setEdge(`source-${source.id}`, askId);
  passageQuestions.forEach((q) => g.setEdge(`source-${source.id}`, `question-${q.id}`));
  generalQuestions.forEach((q) => g.setEdge(askId, `question-${q.id}`));
  validCards.forEach((c) => g.setEdge(`question-${c.questionId}`, `card-${c.id}`));
  dagre.layout(g);

  // Translate the whole layout so that the source node's CENTER is at world (0, 0).
  // This makes camera positioning deterministic for the L1/L2 → L3 transition.
  const srcDagre = g.node(`source-${source.id}`);
  const offsetX = srcDagre.x;
  const offsetY = srcDagre.y;

  const pos = (id: string, w: number, h: number) => {
    const n = g.node(id);
    return { x: n.x - offsetX - w / 2, y: n.y - offsetY - h / 2 };
  };

  return {
    nodes: [
      {
        id: `source-${source.id}`,
        type: "source",
        position: pos(`source-${source.id}`, SRC_W, SRC_H),
        // `compact: true` keeps the same card dimensions as the L1 cluster card,
        // so the transition between levels is pure camera motion (no card resize).
        data: { showHandle: true, compact: true },
      },
      {
        id: askId,
        type: "ask",
        position: pos(askId, ASK_W, ASK_H),
        data: {},
        selectable: true,
        draggable: true,
      },
      ...questions.map((q) => ({
        id: `question-${q.id}`,
        type: "question" as const,
        position: pos(`question-${q.id}`, Q_W, Q_H),
        data: {},
      })),
      ...validCards.map((c) => ({
        id: `card-${c.id}`,
        type: "card" as const,
        position: pos(`card-${c.id}`, Q_W, Q_H),
        data: {},
      })),
    ],
    edges: [
      {
        id: `e-src-ask-${source.id}`,
        source: `source-${source.id}`,
        target: askId,
        type: "floating",
        style: { stroke: "#C4B8A0", strokeWidth: 1.5 },
      },
      ...passageQuestions.map((q) => ({
        id: `e-src-${q.id}`,
        source: `source-${source.id}`,
        target: `question-${q.id}`,
        type: "floating",
        style: { stroke: "#C4B8A0", strokeWidth: 1.5 },
      })),
      ...generalQuestions.map((q) => ({
        id: `e-ask-${q.id}`,
        source: askId,
        target: `question-${q.id}`,
        type: "floating",
        style: { stroke: "#C4B8A0", strokeWidth: 1.5 },
      })),
      ...validCards.map((c) => ({
        id: `e-q-${c.id}`,
        source: `question-${c.questionId}`,
        target: `card-${c.id}`,
        type: "floating",
        style: { stroke: "#A8C4A5", strokeWidth: 1.5 },
      })),
    ],
  };
}

function layoutLevel2(sources: Source[]): { nodes: Node[]; edges: Edge[] } {
  // Simple grid layout, 3 columns
  const cols = 3;
  const colGap = 60;
  const rowGap = 50;
  const nodes: Node[] = sources.map((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: `source-${s.id}`,
      type: "source",
      position: { x: col * (SRC_W + colGap), y: row * (SRC_H + rowGap) },
      data: { compact: true },
    };
  });
  return { nodes, edges: [] };
}

function layoutLevel1(spaces: Space[], sources: Source[]): { nodes: Node[]; edges: Edge[] } {
  // Group sources by spaceId; ungrouped sources have spaceId === null
  const bySpace: Record<string, Source[]> = {};
  const ungrouped: Source[] = [];
  for (const s of sources) {
    if (s.spaceId) {
      bySpace[s.spaceId] = bySpace[s.spaceId] || [];
      bySpace[s.spaceId].push(s);
    } else {
      ungrouped.push(s);
    }
  }

  // For each space, lay out its sources internally in a grid
  const innerCols = 2;
  const innerColGap = 24;
  const innerRowGap = 22;

  type Cluster = {
    space: Space;
    spaceIndex: number;
    sources: Source[];
    width: number;
    height: number;
    innerPositions: { x: number; y: number }[]; // relative to cluster origin (inside padding)
  };

  const clusters: Cluster[] = spaces
    .map((space, i) => ({ space, i }))
    .filter(({ space }) => (bySpace[space.id]?.length ?? 0) > 0)
    .map(({ space, i }) => {
      const ss = bySpace[space.id];
      const colsUsed = Math.min(innerCols, ss.length);
      const positions: { x: number; y: number }[] = ss.map((_, idx) => {
        const col = idx % innerCols;
        const row = Math.floor(idx / innerCols);
        return {
          x: CLUSTER_PADDING_X + col * (SRC_COMPACT_W + innerColGap),
          y: CLUSTER_PADDING_TOP + row * (SRC_COMPACT_H + innerRowGap),
        };
      });
      const rowsUsed = Math.ceil(ss.length / innerCols);
      const width = CLUSTER_PADDING_X * 2 + colsUsed * SRC_COMPACT_W + (colsUsed - 1) * innerColGap;
      const height =
        CLUSTER_PADDING_TOP + CLUSTER_PADDING_BOTTOM +
        rowsUsed * SRC_COMPACT_H + (rowsUsed - 1) * innerRowGap;
      return { space, spaceIndex: i, sources: ss, width, height, innerPositions: positions };
    });

  // Lay clusters out in rows that fit a target width
  const targetRowWidth = 1400;
  const clusterRowGap = 60;
  const clusterColGap = 60;

  const placedClusters: { cluster: Cluster; x: number; y: number }[] = [];
  let curX = 0;
  let curY = 0;
  let curRowH = 0;
  for (const c of clusters) {
    if (curX + c.width > targetRowWidth && curX > 0) {
      curX = 0;
      curY += curRowH + clusterRowGap;
      curRowH = 0;
    }
    placedClusters.push({ cluster: c, x: curX, y: curY });
    curX += c.width + clusterColGap;
    curRowH = Math.max(curRowH, c.height);
  }
  const ungroupedRowY = curY + curRowH + (placedClusters.length > 0 ? clusterRowGap : 0);

  const nodes: Node[] = [];

  // Cluster parents first (xyflow requirement)
  for (const { cluster, x, y } of placedClusters) {
    nodes.push({
      id: `cluster-${cluster.space.id}`,
      type: "cluster",
      position: { x, y },
      data: {
        label: cluster.space.name,
        count: cluster.sources.length,
        color: colorForSpaceIndex(cluster.spaceIndex),
        spaceId: cluster.space.id,
      },
      style: { width: cluster.width, height: cluster.height },
      selectable: false,
      draggable: false,
    });
  }

  // Children
  for (const { cluster } of placedClusters) {
    cluster.sources.forEach((s, idx) => {
      const p = cluster.innerPositions[idx];
      nodes.push({
        id: `source-${s.id}`,
        type: "source",
        parentId: `cluster-${cluster.space.id}`,
        extent: "parent",
        position: p,
        data: { compact: true },
        draggable: false,
      });
    });
  }

  // Ungrouped sources (no space)
  ungrouped.forEach((s, i) => {
    const col = i % innerCols;
    const row = Math.floor(i / innerCols);
    nodes.push({
      id: `source-${s.id}`,
      type: "source",
      position: {
        x: col * (SRC_COMPACT_W + innerColGap),
        y: ungroupedRowY + row * (SRC_COMPACT_H + innerRowGap),
      },
      data: { compact: true },
      draggable: false,
    });
  });

  return { nodes, edges: [] };
}

export default function GraphCanvas(props: Props) {
  // Keep one React Flow instance so the drill-in camera animation continues seamlessly
  // from L2 → L3 without a remount/jump.
  return (
    <ReactFlowProvider key="graph">
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <GraphCanvasInner {...props} />
      </div>
    </ReactFlowProvider>
  );
}

function GraphCanvasInner({
  level, spaces, sources, space, source, questions = [], cards = [],
  drillInTransition = false, onDrillInComplete, onPrefetchSource, onEnsureSourceGraphReady,
  selectedNode, onSelectNode, onSelectSpace, onSelectSource, onOpenViewer, onGraphRefresh,
  onLayoutPersisted, onSpaceLayoutPersisted,
}: Props) {
  const reactFlow = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [zoomingIntoId, setZoomingIntoId] = useState<string | null>(null);
  const [playL3Appear, setPlayL3Appear] = useState(false);
  const didInitCameraRef = useRef(false);
  const drillCameraAppliedRef = useRef(false);
  const suppressFitViewRef = useRef(false);
  const drillSourceSizeRef = useRef<{ w: number; h: number } | null>(null);
  const l3LayoutReadyRef = useRef(false);
  const layoutCacheRef = useRef<{ sourceId: string; graphLayout: string | null }>({
    sourceId: "",
    graphLayout: null,
  });
  const spaceLayoutCacheRef = useRef<{ spaceId: string; graphLayout: string | null }>({
    spaceId: "",
    graphLayout: null,
  });
  const prevLevelRef = useRef(level);

  // Reset camera init when navigating between levels — but not mid drill-in.
  useEffect(() => {
    if (prevLevelRef.current !== level) {
      if (!drillInTransition && !suppressFitViewRef.current) {
        didInitCameraRef.current = false;
        drillCameraAppliedRef.current = false;
      }
      prevLevelRef.current = level;
    }
  }, [level, drillInTransition]);

  // Persist user-dragged node positions + custom areas.
  // L3 (a source's graph) and L2 (sources within a space) are saved to the DB so they sync across devices.
  // L2 also reads legacy per-device position-only localStorage when no DB layout exists yet.
  const posKey =
    level === 2 ? `kh.pos.space.${space?.id ?? sources[0]?.spaceId ?? "root"}` : null;

  // Returns { positions, areas }. Handles the legacy format where graphLayout was a bare
  // positions map (no `positions`/`areas` keys).
  const loadLayout = useCallback((): { positions: Record<string, { x: number; y: number }>; areas: AreaData[] } => {
    if (level === 3 && source) {
      const raw =
        layoutCacheRef.current.sourceId === source.id
          ? layoutCacheRef.current.graphLayout ?? source.graphLayout
          : source.graphLayout;
      if (!raw) return { positions: {}, areas: [] };
      try {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.positions || parsed.areas)) {
          return { positions: parsed.positions ?? {}, areas: parsed.areas ?? [] };
        }
        return { positions: parsed ?? {}, areas: [] }; // legacy: whole object is the positions map
      } catch { return { positions: {}, areas: [] }; }
    }
    if (level === 2 && space) {
      const raw =
        spaceLayoutCacheRef.current.spaceId === space.id
          ? spaceLayoutCacheRef.current.graphLayout ?? space.graphLayout
          : space.graphLayout;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.positions || parsed.areas)) {
            return { positions: parsed.positions ?? {}, areas: parsed.areas ?? [] };
          }
          return { positions: parsed ?? {}, areas: [] };
        } catch { /* fall through to localStorage */ }
      }
      if (posKey) {
        try {
          const legacy = window.localStorage.getItem(posKey);
          return { positions: legacy ? JSON.parse(legacy) : {}, areas: [] };
        } catch { return { positions: {}, areas: [] }; }
      }
      return { positions: {}, areas: [] };
    }
    return { positions: {}, areas: [] };
  }, [level, source, space, posKey]);

  const persistLayout = useCallback((ns: Node[]) => {
    const positions: Record<string, { x: number; y: number }> = {};
    const areas: AreaData[] = [];
    ns.forEach((n) => {
      if (n.type === "area") {
        areas.push({
          id: n.id,
          x: n.position.x,
          y: n.position.y,
          width: n.measured?.width ?? (n.width as number) ?? 260,
          height: n.measured?.height ?? (n.height as number) ?? 180,
          label: (n.data as { label?: string }).label ?? "Area",
        });
      } else if (n.type !== "cluster") {
        positions[n.id] = n.position;
      }
    });

    if (level === 3 && source) {
      const graphLayout = JSON.stringify({ positions, areas });
      layoutCacheRef.current = { sourceId: source.id, graphLayout };
      // Defer parent state sync — persistLayout is often called from inside a setNodes
      // updater (e.g. onNodeDragStop), and updating Home during that render is illegal.
      queueMicrotask(() => onLayoutPersisted?.(graphLayout));
      fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graphLayout }),
      }).catch(() => {});
      return;
    }
    if (level === 2 && space) {
      const graphLayout = JSON.stringify({ positions, areas });
      spaceLayoutCacheRef.current = { spaceId: space.id, graphLayout };
      queueMicrotask(() => onSpaceLayoutPersisted?.(graphLayout));
      fetch(`/api/spaces/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graphLayout }),
      }).catch(() => {});
      return;
    }
  }, [level, source, space, onLayoutPersisted, onSpaceLayoutPersisted]);

  const requestDelete = useCallback((nodeType: PendingDelete["nodeType"], id: string, label: string) => {
    setPendingDelete({ nodeType, id, label });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { nodeType, id } = pendingDelete;
    const url =
      nodeType === "source" ? `/api/sources/${id}` :
      nodeType === "question" ? `/api/questions/${id}` :
      `/api/knowledge-cards/${id}`;
    await fetch(url, { method: "DELETE" });
    setDeleting(false);
    setPendingDelete(null);
    onGraphRefresh();
  }, [pendingDelete, onGraphRefresh]);

  // ── Custom areas (user-drawn frames to organize questions) ──
  const renameArea = useCallback((id: string, label: string) => {
    setNodes((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n));
      queueMicrotask(() => persistLayout(next));
      return next;
    });
  }, [setNodes, persistLayout]);

  const deleteArea = useCallback((id: string) => {
    setNodes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      queueMicrotask(() => persistLayout(next));
      return next;
    });
  }, [setNodes, persistLayout]);

  const buildAreaNode = useCallback((area: AreaData): Node => ({
    id: area.id,
    type: "area",
    position: { x: area.x, y: area.y },
    width: area.width,
    height: area.height,
    zIndex: 0,
    // Drag only via the header grip — areas sit behind questions (z-order) so the questions
    // on top stay clickable without needing pointer-events tricks (which broke dragging).
    dragHandle: ".area-drag",
    data: {
      label: area.label,
      onRename: (label: string) => renameArea(area.id, label),
      onDelete: () => deleteArea(area.id),
    },
  }), [renameArea, deleteArea]);

  const addArea = useCallback(() => {
    const center = reactFlow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const area: AreaData = {
      id: `area-${crypto.randomUUID()}`,
      x: Math.round(center.x - 140),
      y: Math.round(center.y - 100),
      width: 280,
      height: 200,
      label: "New area",
    };
    setNodes((prev) => {
      const next = [buildAreaNode(area), ...prev];
      queueMicrotask(() => persistLayout(next));
      return next;
    });
  }, [reactFlow, setNodes, buildAreaNode, persistLayout]);

  // Persist after dragging or resizing finishes.
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(changes);
    const resizeEnded = changes.some((c) => c.type === "dimensions" && c.resizing === false);
    if (resizeEnded) {
      queueMicrotask(() => persistLayout(reactFlow.getNodes()));
    }
  }, [onNodesChange, reactFlow, persistLayout]);

  // Build raw nodes/edges based on level, then enrich data with handlers.
  // Depend on source id only — not graphLayout — so drag-persist doesn't rebuild the graph.
  const sourceId = source?.id;
  useEffect(() => {
    if (level !== 3) l3LayoutReadyRef.current = false;

    if (level === 3 && sourceId && source) {
      if (layoutCacheRef.current.sourceId !== sourceId || drillInTransition) {
        layoutCacheRef.current = { sourceId, graphLayout: source.graphLayout ?? null };
      }
    }

    let built: { nodes: Node[]; edges: Edge[] };
    if (level === 3) {
      if (!source) {
        setNodes([]);
        setEdges([]);
        l3LayoutReadyRef.current = false;
        return;
      }
      built = layoutLevel3(source, questions, cards);
    } else if (level === 2) {
      built = layoutLevel2(sources);
    } else {
      built = layoutLevel1(spaces, sources);
    }

    // Enrich node data with click/delete handlers
    const enriched = built.nodes.map((n) => {
      if (n.type === "source") {
        const src = sources.find((s) => `source-${s.id}` === n.id) ?? (source && `source-${source.id}` === n.id ? source : null);
        if (!src) return n;
        const videoId = src.youtubeUrl ? extractVideoId(src.youtubeUrl) : null;
        return {
          ...n,
          data: {
            ...n.data,
            label: src.title,
            sourceType: src.type,
            videoId,
            thumbnailUrl: src.thumbnailUrl ?? null,
            onDelete: () => requestDelete("source", src.id, src.title),
          },
        };
      }
      if (n.type === "question") {
        const q = questions.find((q) => `question-${q.id}` === n.id);
        if (!q) return n;
        return {
          ...n,
          data: {
            ...n.data,
            label: q.title,
            onDelete: () => requestDelete("question", q.id, q.title),
          },
        };
      }
      if (n.type === "card") {
        const c = cards.find((c) => `card-${c.id}` === n.id);
        if (!c) return n;
        return {
          ...n,
          data: {
            ...n.data,
            label: c.title,
            onDelete: () => requestDelete("card", c.id, c.title),
          },
        };
      }
      if (n.type === "cluster") {
        return {
          ...n,
          data: {
            ...n.data,
            onHeaderClick: (spaceId: string) => onSelectSpace(spaceId),
          },
        };
      }
      return n;
    });

    // Restore any user-dragged positions + custom areas saved for this graph.
    const { positions: saved, areas } = loadLayout();
    const positioned = enriched.map((n) =>
      saved[n.id] ? { ...n, position: saved[n.id] } : n
    );

    // Area nodes go first so they render behind the questions/cards/source.
    const areaNodes = (level === 3 || level === 2 ? areas : []).map(buildAreaNode);
    setNodes([...areaNodes, ...positioned]);
    setEdges(built.edges);
    l3LayoutReadyRef.current = level === 3;
  }, [level, spaces, sources, sourceId, questions, cards, drillInTransition]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play the L3 appear animation once per entry — not on layout persist / area drag.
  useEffect(() => {
    if (level !== 3 || drillInTransition) {
      const raf = requestAnimationFrame(() => setPlayL3Appear(false));
      return () => cancelAnimationFrame(raf);
    }
    const raf = requestAnimationFrame(() => {
      setPlayL3Appear(true);
      window.setTimeout(() => setPlayL3Appear(false), 900);
    });
    return () => cancelAnimationFrame(raf);
  }, [level, drillInTransition, sourceId]);

  // Drive camera on level entry.
  useLayoutEffect(() => {
    if (nodes.length === 0) return;
    // Node-building useEffect runs after paint; wait until L3 layout is actually mounted.
    if (level === 3 && !l3LayoutReadyRef.current) return;

    if (level === 3 && drillInTransition) {
      if (!drillCameraAppliedRef.current) {
        const srcNode = nodes.find((n) => n.id === `source-${source?.id}`);
        if (!srcNode) return;

        // 1. Snap the viewport so the source stays exactly where the zoom-in left it —
        //    invisible, because the source's screen position doesn't change.
        const el = containerRef.current;
        if (el) {
          const { width, height } = el.getBoundingClientRect();
          const { zoom } = reactFlow.getViewport();
          const internal = reactFlow.getInternalNode?.(srcNode.id);
          const size = drillSourceSizeRef.current;
          const w = internal?.measured?.width ?? size?.w ?? SRC_W;
          const h = internal?.measured?.height ?? size?.h ?? SRC_H;
          const centerX = srcNode.position.x + w / 2;
          const centerY = srcNode.position.y + h / 2;
          reactFlow.setViewport(
            { x: width / 2 - centerX * zoom, y: height / 2 - centerY * zoom, zoom },
            { duration: 0 },
          );
        }
        drillCameraAppliedRef.current = true;
        didInitCameraRef.current = true;
        suppressFitViewRef.current = false;
        drillSourceSizeRef.current = null;
        // Defer to the next frame: drop the fade (so the L2 grid doesn't flash back) and
        // smoothly zoom out to reveal the questions/cards around the source.
        requestAnimationFrame(() => {
          setZoomingIntoId(null);
          reactFlow.fitView({ duration: 600, padding: 0.3, maxZoom: L3_MAX_ZOOM });
        });
        onDrillInComplete?.();
      }
      return;
    }

    if (didInitCameraRef.current || suppressFitViewRef.current) return;
    didInitCameraRef.current = true;

    if (level === 3) {
      // Sync fit before paint to avoid a top-left flash, then animate zoom-out.
      reactFlow.fitView({ duration: 0, padding: 0.3, maxZoom: L3_MAX_ZOOM });
      const raf = requestAnimationFrame(() => {
        reactFlow.fitView({ duration: 700, padding: 0.3, maxZoom: L3_MAX_ZOOM });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      reactFlow.fitView({ duration: 300, padding: 0.2 });
    }
  }, [nodes, level, reactFlow, drillInTransition, onDrillInComplete, source]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback(
    (_e, node) => {
      if (node.type !== "source" || level === 3 || zoomingIntoId) return;
      const src = sources.find((s) => s.id === node.id.replace("source-", ""));
      if (src) onPrefetchSource?.(src);
    },
    [level, sources, zoomingIntoId, onPrefetchSource],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      if (zoomingIntoId) return; // ignore clicks during transition

      if (node.type === "cluster") {
        const spaceId = (node.data as { spaceId: string }).spaceId;
        if (spaceId) onSelectSpace(spaceId);
        return;
      }
      if (node.type === "source") {
        const sourceId = node.id.replace("source-", "");
        if (level === 3) {
          // Notes have no viewer — their editor lives in the right panel.
          const isNote = (source?.type === "note") || (sources.find((s) => s.id === sourceId)?.type === "note");
          if (!isNote) onOpenViewer();
          return;
        }
        const src = sources.find((s) => s.id === sourceId);
        if (!src) return;

        onPrefetchSource?.(src);

        const internal = reactFlow.getInternalNode?.(node.id);
        const abs = internal?.internals?.positionAbsolute ?? node.position;
        const w = internal?.measured?.width ?? node.width ?? SRC_W;
        const h = internal?.measured?.height ?? node.height ?? SRC_H;
        const cx = abs.x + w / 2;
        const cy = abs.y + h / 2;
        const duration = 380;
        const currentZoom = reactFlow.getViewport().zoom;
        // Never zoom out during the approach — only pan, or zoom in toward DRILL_IN_ZOOM.
        const targetZoom = currentZoom >= DRILL_IN_ZOOM ? currentZoom : DRILL_IN_ZOOM;
        suppressFitViewRef.current = true;
        drillCameraAppliedRef.current = false;
        drillSourceSizeRef.current = { w, h };
        reactFlow.setCenter(cx, cy, { zoom: targetZoom, duration });
        setZoomingIntoId(node.id);

        // Keep the fade on until the L3 layout is mounted (cleared in the camera effect).
        Promise.all([
          new Promise<void>((r) => setTimeout(r, duration)),
          onEnsureSourceGraphReady?.(src.id) ?? Promise.resolve({ questions: [], cards: [], source: undefined }),
        ]).then(([, graphData]) => {
          onSelectSource(src, { drillIn: true, graphData, sourceSize: { w, h } });
        });
        return;
      }
      if (node.type === "ask") onSelectNode({ type: "ask" });
      else if (node.type === "question") onSelectNode({ type: "question", id: node.id.replace("question-", "") });
      else if (node.type === "card") onSelectNode({ type: "card", id: node.id.replace("card-", "") });
    },
    [level, sources, source?.type, onSelectSpace, onSelectSource, onOpenViewer, onSelectNode, reactFlow, zoomingIntoId, onPrefetchSource, onEnsureSourceGraphReady]
  );

  const styledNodes = useMemo(
    () =>
      nodes.map((n) => {
        // During zoom-into-source: keep clicked node visible, fade everything else.
        if (zoomingIntoId) {
          const isClicked = n.id === zoomingIntoId;
          return {
            ...n,
            style: {
              ...(n.style ?? {}),
              opacity: isClicked ? 1 : 0,
              transition: "opacity 320ms ease",
            },
          };
        }
        if (n.type === "cluster" || n.type === "area") return n;
        const isSelected =
          (selectedNode?.type === "ask" && n.type === "ask") ||
          (selectedNode?.type === "question" && n.id === `question-${selectedNode.id}`) ||
          (selectedNode?.type === "card" && n.id === `card-${selectedNode.id}`);

        // During drill-in, children arrive with the layout — skip stagger so nothing animates twice.
        const isL3Child = playL3Appear && (n.type === "ask" || n.type === "question" || n.type === "card");
        const appearAnim = isL3Child ? "node-appear 500ms ease 250ms both" : undefined;

        return {
          ...n,
          style: {
            ...(n.style ?? {}),
            opacity: isSelected ? 1 : 0.95,
            outline: isSelected ? "2px solid var(--accent)" : "none",
            borderRadius: 16,
            animation: appearAnim,
          },
        };
      }),
    [nodes, selectedNode, zoomingIntoId, playL3Appear]
  );

  // Fade edges during zoom-into-source; stagger-fade edges on L3 entry only.
  const styledEdges = useMemo(() => {
    if (zoomingIntoId) {
      return edges.map((e) => ({
        ...e,
        style: { ...(e.style ?? {}), opacity: 0, transition: "opacity 320ms ease" },
      }));
    }
    if (playL3Appear) {
      return edges.map((e) => ({
        ...e,
        style: { ...(e.style ?? {}), animation: "node-appear 500ms ease 350ms both" },
      }));
    }
    return edges;
  }, [edges, zoomingIntoId, playL3Appear]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeDragStop={() => persistLayout(reactFlow.getNodes())}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        elevateNodesOnSelect={false}
        style={{ background: "var(--background)" }}
      >
        <Background variant={BackgroundVariant.Dots} color="#C8BCA8" gap={22} size={1.2} />
        <Controls
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          }}
        />
      </ReactFlow>

      {/* Add-area button (space graph + single-source graph) */}
      {(level === 3 || level === 2) && (
        <button
          onClick={addArea}
          className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full type-mono shadow-sm transition-opacity hover:opacity-80"
          style={{
            fontSize: "0.68rem",
            letterSpacing: "0.03em",
            background: "var(--panel-bg)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
          title={level === 2 ? "Add an area to organize sources" : "Add an area to organize questions"}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          Area
        </button>
      )}

      {pendingDelete && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(26,25,23,0.45)" }}
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="rounded-2xl px-6 py-5 shadow-2xl"
            style={{
              background: "var(--panel-bg)",
              border: "1px solid var(--border)",
              minWidth: 300,
              maxWidth: 360,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="type-serif font-semibold mb-1" style={{ fontSize: "0.95rem", color: "var(--foreground)" }}>
              Delete {pendingDelete.nodeType === "source" ? "source" : pendingDelete.nodeType === "question" ? "question" : "card"}?
            </p>
            <p className="mb-5" style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              <span style={{ fontStyle: "italic" }}>&ldquo;{pendingDelete.label}&rdquo;</span>
              {pendingDelete.nodeType === "source" && " and all its questions and cards"} will be permanently deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-4 py-1.5 rounded-lg type-mono text-xs transition-opacity hover:opacity-70"
                style={{ background: "var(--active-row)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-1.5 rounded-lg type-mono text-xs transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: "#C0392B", color: "#fff", border: "none" }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
