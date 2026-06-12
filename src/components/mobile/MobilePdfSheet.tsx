"use client";

import { useRef, useState } from "react";
import MobileNotesTab from "./MobileNotesTab";
import MobileThreadsTab from "./MobileThreadsTab";
import MobileGeneralAskSheet from "./MobileGeneralAskSheet";
import MobileTabBar from "./MobileTabBar";
import type { NotesViewHandle } from "@/components/source/NotesView";
import type { Question } from "@/lib/types";

type SheetTab = "notes" | "threads";

interface Props {
  sourceId: string;
  questions: Question[];
  onOpenThread: (questionId: string) => void;
  onQuestionsRefresh: () => void;
}

const COLLAPSED_H = 56; // px — height of the collapsed handle bar

/**
 * Slide-up bottom sheet for PDF sources.
 * Collapsed: shows a handle bar with Notes, ↑, Threads buttons.
 * Expanded: slides up to ~70vh and shows Notes or Threads tab content.
 */
export default function MobilePdfSheet({ sourceId, questions, onOpenThread, onQuestionsRefresh }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<SheetTab>("notes");
  const [showGeneralAsk, setShowGeneralAsk] = useState(false);
  const notesEditorRef = useRef<NotesViewHandle | null>(null);

  function openTab(t: SheetTab) {
    setTab(t);
    setExpanded(true);
  }

  return (
    <>
      {/* Backdrop — tap to collapse */}
      {expanded && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: "rgba(26,25,23,0.25)" }}
          onClick={() => setExpanded(false)}
        />
      )}

      <div
        className="mobile-safe-bottom fixed inset-x-0 bottom-0 z-40 flex flex-col"
        style={{
          background: "var(--panel-bg)",
          borderTop: "1px solid var(--border)",
          height: expanded ? "70vh" : `${COLLAPSED_H}px`,
          transition: "height 300ms cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}
      >
        {/* Handle / collapsed bar */}
        <div
          className="shrink-0 flex items-center justify-between px-5"
          style={{ height: COLLAPSED_H }}
        >
          {/* Notes button */}
          <button
            type="button"
            onClick={() => openTab("notes")}
            className="mobile-touch-target flex items-center gap-1.5 type-serif text-sm"
            style={{ color: tab === "notes" && expanded ? "var(--foreground)" : "var(--muted)", fontWeight: tab === "notes" && expanded ? 600 : 400 }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            Notes
          </button>

          {/* Centre toggle — pill only */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mobile-touch-target flex items-center justify-center"
            aria-label={expanded ? "Collapse sheet" : "Expand sheet"}
          >
            <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
          </button>

          {/* Threads button */}
          <button
            type="button"
            onClick={() => openTab("threads")}
            className="mobile-touch-target flex items-center gap-1.5 type-serif text-sm"
            style={{ color: tab === "threads" && expanded ? "var(--foreground)" : "var(--muted)", fontWeight: tab === "threads" && expanded ? 600 : 400 }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Threads
          </button>
        </div>

        {/* Expanded content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <MobileTabBar
            tabs={[
              { id: "notes", label: "Notes" },
              { id: "threads", label: "Threads" },
            ]}
            active={tab}
            onChange={(id) => setTab(id as SheetTab)}
          />

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {tab === "notes" && (
              <MobileNotesTab
                sourceId={sourceId}
                onSeekTo={() => {}}
                onOpenThread={onOpenThread}
                editorRef={notesEditorRef}
              />
            )}
            {tab === "threads" && (
              <MobileThreadsTab
                questions={questions}
                onOpenThread={onOpenThread}
                onNewThread={() => setShowGeneralAsk(true)}
              />
            )}
          </div>
        </div>
      </div>

      {showGeneralAsk && (
        <MobileGeneralAskSheet
          sourceId={sourceId}
          sourceType="pdf"
          onClose={() => setShowGeneralAsk(false)}
          onThreadCreated={(qid) => {
            setShowGeneralAsk(false);
            onQuestionsRefresh();
            onOpenThread(qid);
          }}
        />
      )}
    </>
  );
}
