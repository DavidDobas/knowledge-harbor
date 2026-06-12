"use client";

import { useState } from "react";
import MobileThreadsTab from "./MobileThreadsTab";
import MobileGeneralAskSheet from "./MobileGeneralAskSheet";
import type { Question } from "@/lib/types";

interface Props {
  sourceId: string;
  questions: Question[];
  onOpenThread: (questionId: string) => void;
  onQuestionsRefresh: () => void;
}

const COLLAPSED_H = 56;

export default function MobileNoteSheet({ sourceId, questions, onOpenThread, onQuestionsRefresh }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showGeneralAsk, setShowGeneralAsk] = useState(false);

  return (
    <>
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
        {/* Collapsed bar: pill centered, Threads button on the right */}
        <div
          className="shrink-0 relative flex items-center justify-center px-5"
          style={{ height: COLLAPSED_H }}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mobile-touch-target flex items-center"
            aria-label={expanded ? "Collapse" : "Expand threads"}
          >
            <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
          </button>

          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mobile-touch-target absolute right-5 flex items-center gap-1.5 type-serif text-sm"
            style={{ color: expanded ? "var(--foreground)" : "var(--muted)", fontWeight: expanded ? 600 : 400 }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Threads
          </button>
        </div>

        {/* Expanded content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <MobileThreadsTab
            questions={questions}
            onOpenThread={onOpenThread}
            onNewThread={() => setShowGeneralAsk(true)}
          />
        </div>
      </div>

      {showGeneralAsk && (
        <MobileGeneralAskSheet
          sourceId={sourceId}
          sourceType="note"
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
