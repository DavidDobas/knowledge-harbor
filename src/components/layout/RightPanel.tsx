"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QuestionPanel from "@/components/panels/QuestionPanel";
import KnowledgeCardPanel from "@/components/panels/KnowledgeCardPanel";
import PDFSelectionPanel from "@/components/panels/PDFSelectionPanel";
import NotePanel from "@/components/panels/NotePanel";
import TranscriptWithChat from "@/components/source/TranscriptWithChat";
import PdfRightPanel from "@/components/source/PdfRightPanel";
import GeneralAskPanel from "@/components/panels/GeneralAskPanel";
import type { Source, SelectedNode } from "@/lib/types";
import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_WIDTH_KEY,
  readRightPanelWidth,
} from "@/lib/layout";

interface Props {
  activeSource: Source | null;
  selectedNode: SelectedNode | null;
  activeChunkIdx: number;
  viewMode: "graph" | "viewer";
  onSeekTo: (ms: number) => void;
  onSelectNode: (node: SelectedNode | null) => void;
  onGraphRefresh: () => void;
  onActiveSourceUpdate: (updates: Partial<Source>) => void;
  pdfSelection: { text: string; page: number; rects: { x:number; y:number; w:number; h:number }[] } | null;
  onClearPdfSelection: () => void;
  onOpenThread: (questionId: string) => void;
  onOpenSource: (sourceId: string) => void;
  pendingInitialMessage: { questionId: string; message: string; passage?: string; page?: number } | null;
  onPdfQuestionCreated: (questionId: string, message: string, passage: string, page: number) => void;
  onGeneralQuestionCreated: (questionId: string, message: string) => void;
  onTranscriptQuestionCreated?: (questionId: string, message: string) => void;
  onClearPendingInitialMessage?: () => void;
  onSourceTitleChange?: (sourceId: string, title: string) => void;
}

export default function RightPanel({
  activeSource, selectedNode, activeChunkIdx, viewMode, onSeekTo,
  onSelectNode, onGraphRefresh, onActiveSourceUpdate,
  pdfSelection, onClearPdfSelection, onOpenThread, onOpenSource,
  pendingInitialMessage, onPdfQuestionCreated, onGeneralQuestionCreated, onTranscriptQuestionCreated,
  onClearPendingInitialMessage, onSourceTitleChange,
}: Props) {
  const isYoutube = activeSource?.type === "youtube";
  const isPdf = activeSource?.type === "pdf";
  const isNote = activeSource?.type === "note";

  // SSR and first client paint use the default; restore saved width after mount.
  const [width, setWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const saved = readRightPanelWidth();
    queueMicrotask(() => setWidth(saved));
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { startX: e.clientX, startWidth: width };
    setIsDragging(true);
  }, [width]);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      // Dragging the left edge: moving the mouse LEFT should INCREASE the panel width.
      const delta = dragStartRef.current.startX - e.clientX;
      const next = Math.max(
        RIGHT_PANEL_MIN_WIDTH,
        Math.min(RIGHT_PANEL_MAX_WIDTH, dragStartRef.current.startWidth + delta)
      );
      setWidth(next);
    };
    const onUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        window.localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(width));
      } catch { /* ignore */ }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging, width]);

  const asideClass = "relative shrink-0 flex flex-col border-l overflow-hidden";
  const asideStyle = { width: `${width}px`, background: "var(--panel-bg)", borderColor: "var(--border)" };

  const BackButton = ({ label }: { label: string }) => (
    <div className="px-4 py-2 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
      <button
        onClick={() => onSelectNode(null)}
        className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
        style={{ color: "var(--accent)" }}
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {label}
      </button>
    </div>
  );

  const pendingForThread =
    selectedNode?.type === "question" &&
    pendingInitialMessage?.questionId === selectedNode.id
      ? pendingInitialMessage
      : null;

  // All question threads — passage or general, YouTube/PDF/note — live in QuestionPanel.
  // (TranscriptWithChat only composes new questions, then navigates here.)
  const useQuestionPanel = selectedNode?.type === "question" && !!activeSource;

  function renderContent() {
    // Knowledge card — same panel regardless of source type.
    if (selectedNode?.type === "card") {
      return (
        <>
          <BackButton label={isYoutube ? "Transcript" : "Back"} />
          <KnowledgeCardPanel cardId={selectedNode.id} onSelectNode={onSelectNode} />
        </>
      );
    }

    // Ask hub — new general thread (one thread per submit).
    if (selectedNode?.type === "ask" && activeSource) {
      return (
        <GeneralAskPanel
          source={activeSource}
          onQuestionCreated={onGeneralQuestionCreated}
          onDismiss={() => onSelectNode(null)}
        />
      );
    }

    // General or PDF/note threads, and new Ask threads (pendingInitialMessage before graph refresh).
    if (useQuestionPanel && selectedNode?.type === "question") {
      return (
        <>
          <BackButton label={isYoutube ? "Back" : "Back"} />
          <QuestionPanel
            key={selectedNode.id}
            questionId={selectedNode.id}
            initialMessage={pendingForThread?.message}
            initialPassage={pendingForThread?.passage}
            initialPage={pendingForThread?.page}
            source={activeSource}
            onSummarized={() => { onGraphRefresh(); onSelectNode(null); }}
            onGraphRefresh={onGraphRefresh}
            onPendingMessageSent={() => onClearPendingInitialMessage?.()}
          />
        </>
      );
    }

    // YouTube — transcript tabs; passage threads use chunk chat inside TranscriptWithChat.
    if (isYoutube && activeSource) {
      return (
        <TranscriptWithChat
          key={activeSource.id}
          sourceId={activeSource.id}
          rawTranscript={activeSource.transcript ?? ""}
          initialSummary={activeSource.summary}
          activeChunkIdx={activeChunkIdx}
          viewMode={viewMode}
          onSeekTo={onSeekTo}
          onGraphRefresh={onGraphRefresh}
          onOpenThread={onOpenThread}
          onTranscriptUpdated={(transcript) => onActiveSourceUpdate({ transcript })}
          onOpenSource={onOpenSource}
          onTranscriptQuestionCreated={onTranscriptQuestionCreated}
        />
      );
    }

    // PDF text selection
    if (isPdf && pdfSelection && activeSource) {
      return (
        <PDFSelectionPanel
          selectedText={pdfSelection.text}
          page={pdfSelection.page}
          rects={pdfSelection.rects}
          sourceId={activeSource.id}
          sourceTitle={activeSource.title}
          onGraphRefresh={onGraphRefresh}
          onQuestionCreated={onPdfQuestionCreated}
          onDismiss={onClearPdfSelection}
        />
      );
    }

    // PDF source loaded, no selection / no node — show Notes + Summary tabs.
    if (isPdf && activeSource) {
      return (
        <PdfRightPanel
          key={activeSource.id}
          sourceId={activeSource.id}
          initialSummary={activeSource.summary}
          onOpenThread={onOpenThread}
          onOpenSource={onOpenSource}
        />
      );
    }

    // Note source — full-panel markdown editor.
    if (isNote && activeSource) {
      return (
        <NotePanel
          key={activeSource.id}
          sourceId={activeSource.id}
          title={activeSource.title}
          onTitleChange={(t) => onSourceTitleChange?.(activeSource.id, t)}
          onOpenThread={onOpenThread}
          onOpenSource={onOpenSource}
        />
      );
    }

    // L1 / L2 — no active source
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="text-xs text-center" style={{ color: "var(--muted)" }}>
          Pick a source from the graph to explore its questions and notes
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Full-viewport overlay while dragging — captures mouse events that would
          otherwise be swallowed by iframes (YouTube player) or PDF text layers. */}
      {isDragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            cursor: "col-resize",
            // transparent but still intercepts events
            background: "transparent",
          }}
        />
      )}

      <aside className={asideClass} style={asideStyle}>
        {/* Drag handle on the left edge */}
        <div
          onMouseDown={onDragStart}
          title="Drag to resize"
          style={{
            position: "absolute",
            top: 0,
            left: -3,
            width: 6,
            height: "100%",
            cursor: "col-resize",
            zIndex: 20,
            background: isDragging ? "var(--accent)" : "transparent",
            transition: isDragging ? undefined : "background 150ms ease",
          }}
          onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.background = "var(--accent-light)"; }}
          onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.background = "transparent"; }}
        />
        {renderContent()}
      </aside>
    </>
  );
}
