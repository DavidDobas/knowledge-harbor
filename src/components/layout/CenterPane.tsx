"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { extractVideoId } from "@/lib/youtube";
import type { Space, Source, Question, KnowledgeCard, SelectedNode } from "@/lib/types";

const GraphCanvas = dynamic(() => import("@/components/graph/GraphCanvas"), { ssr: false });
const PDFViewer = dynamic(() => import("@/components/source/PDFViewer"), { ssr: false });
const YouTubePlayer = dynamic(() => import("@/components/source/YouTubePlayer"), { ssr: false });

interface Props {
  activeSource: (Source & { pdfUrl?: string }) | null;
  selectedSpaceId: string | null;
  selectedNode: SelectedNode | null;
  viewMode: "graph" | "viewer";
  onSetViewMode: (mode: "graph" | "viewer") => void;
  onSelectNode: (node: SelectedNode) => void;
  onSelectSpace: (spaceId: string) => void;
  onSelectSource: (source: Source) => void;
  onGraphRefresh: () => void;
  onActiveChunkIdxChange: (idx: number) => void;
  onRegisterSeek: (fn: (ms: number) => void) => void;
  onPdfTextSelect: (text: string, page: number, rects: { x:number; y:number; w:number; h:number }[]) => void;
  onActiveSourceUpdate: (updates: Partial<Source>) => void;
  onClearPdfSelection: () => void;
  pdfSelection: { text: string; page: number; rects: { x:number; y:number; w:number; h:number }[] } | null;
  refreshKey: number;
}

export default function CenterPane({
  activeSource, selectedSpaceId, selectedNode, viewMode, onSetViewMode,
  onSelectNode, onSelectSpace, onSelectSource, onGraphRefresh,
  onActiveChunkIdxChange, onRegisterSeek,
  onPdfTextSelect, onClearPdfSelection, onActiveSourceUpdate, pdfSelection,
  refreshKey,
}: Props) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [cards, setCards] = useState<KnowledgeCard[]>([]);

  const level: 1 | 2 | 3 = activeSource ? 3 : selectedSpaceId ? 2 : 1;

  // Always load spaces
  useEffect(() => {
    fetch("/api/spaces").then((r) => r.json()).then(setSpaces);
  }, [refreshKey]);

  // Load sources scoped to current level
  useEffect(() => {
    const url = selectedSpaceId
      ? `/api/sources?spaceId=${selectedSpaceId}`
      : "/api/sources";
    fetch(url).then((r) => r.json()).then(setSources);
  }, [selectedSpaceId, refreshKey]);

  // At level 3, load questions and cards for the active source
  useEffect(() => {
    if (!activeSource) { setQuestions([]); setCards([]); return; }
    Promise.all([
      fetch(`/api/questions?sourceId=${activeSource.id}`).then((r) => r.json()),
      fetch(`/api/knowledge-cards?sourceId=${activeSource.id}`).then((r) => r.json()),
    ]).then(([qs, cs]) => {
      setQuestions(qs);
      setCards(cs);
    });
  }, [activeSource, refreshKey]);

  const videoId = activeSource?.youtubeUrl ? extractVideoId(activeSource.youtubeUrl) : null;

  // PDF highlights — questions produce one kind (blue, clickable to open thread),
  // and free-standing highlights stored on source.pdfHighlights produce another (yellow).
  // Both store geometry as normalized rects relative to their page wrapper.
  const selectedQuestionId = selectedNode?.type === "question" ? selectedNode.id : null;
  const standaloneHighlights = useMemo<{ id: string; text: string; page: number; rects?: { x:number; y:number; w:number; h:number }[]; body?: string }[]>(() => {
    if (!activeSource?.pdfHighlights) return [];
    try { return JSON.parse(activeSource.pdfHighlights); } catch { return []; }
  }, [activeSource]);

  const highlights = useMemo(() => {
    const standalone = standaloneHighlights
      .filter((h) => Array.isArray(h.rects) && h.rects.length > 0)
      .map((h) => ({
        kind: "standalone" as const,
        id: h.id,
        text: h.text,
        page: h.page,
        rects: h.rects!,
        body: h.body,
      }));
    const fromQuestions = questions
      .filter((q) => q.pdfPage != null && q.pdfHighlightText && q.pdfHighlightRects)
      .map((q) => {
        let rects: { x:number; y:number; w:number; h:number }[] = [];
        try { rects = JSON.parse(q.pdfHighlightRects!); } catch { /* ignore */ }
        return {
          kind: "question" as const,
          id: q.id,
          text: q.pdfHighlightText!,
          page: q.pdfPage!,
          rects,
          isActive: q.id === selectedQuestionId,
        };
      })
      .filter((h) => h.rects.length > 0);
    // While the Ask panel is open, show the in-progress selection as a temporary accent
    // highlight so the user can see what they're asking about.
    const pending = pdfSelection && pdfSelection.rects.length > 0
      ? [{ kind: "question" as const, id: "__pending__", text: pdfSelection.text, page: pdfSelection.page, rects: pdfSelection.rects, isActive: true }]
      : [];
    return [...standalone, ...fromQuestions, ...pending];
  }, [questions, selectedQuestionId, standaloneHighlights, pdfSelection]);

  // Save new standalone highlight(s) — multi-page selections produce one entry per page.
  // Optimistic local update via onActiveSourceUpdate avoids a server re-fetch that would
  // regenerate the presigned pdfUrl and force react-pdf to re-download the entire PDF.
  const handlePdfHighlight = useCallback(async (
    entries: { text: string; page: number; rects: { x:number; y:number; w:number; h:number }[]; body?: string }[],
  ) => {
    if (!activeSource || entries.length === 0) return;
    const newOnes = entries.map((e) => ({ id: `h-${crypto.randomUUID()}`, text: e.text, page: e.page, rects: e.rects, body: e.body }));
    const next = [...standaloneHighlights, ...newOnes];
    const nextJSON = JSON.stringify(next);
    onActiveSourceUpdate({ pdfHighlights: nextJSON });
    await fetch(`/api/sources/${activeSource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfHighlights: nextJSON }),
    }).catch(() => {});
  }, [activeSource, standaloneHighlights, onActiveSourceUpdate]);

  const handleDeletePdfHighlight = useCallback(async (id: string) => {
    if (!activeSource) return;
    const next = standaloneHighlights.filter((h) => h.id !== id);
    const nextJSON = JSON.stringify(next);
    onActiveSourceUpdate({ pdfHighlights: nextJSON });
    await fetch(`/api/sources/${activeSource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfHighlights: nextJSON }),
    }).catch(() => {});
  }, [activeSource, standaloneHighlights, onActiveSourceUpdate]);

  const handleEditPdfComment = useCallback(async (id: string, body: string) => {
    if (!activeSource) return;
    const next = standaloneHighlights.map((h) => (h.id === id ? { ...h, body } : h));
    const nextJSON = JSON.stringify(next);
    onActiveSourceUpdate({ pdfHighlights: nextJSON });
    await fetch(`/api/sources/${activeSource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfHighlights: nextJSON }),
    }).catch(() => {});
  }, [activeSource, standaloneHighlights, onActiveSourceUpdate]);

  const targetPage = useMemo(() => {
    if (selectedNode?.type !== "question") return null;
    const q = questions.find((q) => q.id === selectedNode.id);
    return q?.pdfPage ?? null;
  }, [selectedNode, questions]);

  const isViewer = viewMode === "viewer" && activeSource != null;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      {/* Viewer (PDF / YouTube) — mounted always at level 3 so toggling display doesn't unmount */}
      {activeSource && (
        <div
          className="absolute inset-0 flex flex-col"
          style={{ display: isViewer ? "flex" : "none", background: "var(--background)", zIndex: 5 }}
        >
          <div className="shrink-0 flex items-center px-4 h-11 border-b" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => onSetViewMode("graph")}
              className="flex items-center gap-1.5 type-mono transition-opacity hover:opacity-70"
              style={{ fontSize: "0.7rem", letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--accent)" }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Graph
            </button>
          </div>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeSource.type === "youtube" && videoId && (
              <YouTubePlayer
                key={activeSource.id}
                videoId={videoId}
                rawTranscript={activeSource.transcript ?? ""}
                onActiveChunkIdxChange={onActiveChunkIdxChange}
                onRegisterSeek={onRegisterSeek}
              />
            )}
            {activeSource.type === "pdf" && (
              <div className="flex-1 overflow-y-auto p-4">
                {activeSource.pdfUrl ? (
                  <PDFViewer
                    pdfUrl={activeSource.pdfUrl}
                    highlights={highlights}
                    targetPage={targetPage}
                    onTextSelect={onPdfTextSelect}
                    onClearSelection={onClearPdfSelection}
                    onHighlightClick={(questionId) => onSelectNode({ type: "question", id: questionId })}
                    onHighlight={handlePdfHighlight}
                    onDeleteHighlight={handleDeletePdfHighlight}
                    onEditComment={handleEditPdfComment}
                  />
                ) : (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>PDF URL unavailable</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Graph */}
      <div className="flex-1 flex flex-col min-h-0" style={{ display: isViewer ? "none" : "flex" }}>
        <GraphCanvas
          level={level}
          spaces={spaces}
          sources={sources}
          source={activeSource}
          questions={questions}
          cards={cards}
          selectedNode={selectedNode}
          onSelectNode={onSelectNode}
          onSelectSpace={onSelectSpace}
          onSelectSource={onSelectSource}
          onOpenViewer={() => onSetViewMode("viewer")}
          onGraphRefresh={onGraphRefresh}
        />
      </div>
    </div>
  );
}
