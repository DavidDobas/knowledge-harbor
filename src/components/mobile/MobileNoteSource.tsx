"use client";

import NotePanel from "@/components/panels/NotePanel";
import MobileSourceHeader from "./MobileSourceHeader";
import MobileNoteSheet from "./MobileNoteSheet";
import type { Question, Source } from "@/lib/types";

interface Props {
  source: Source;
  questions: Question[];
  onBack: () => void;
  onTitleChange: (title: string) => void;
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
  onQuestionsRefresh: () => void;
}

export default function MobileNoteSource({ source, questions, onBack, onTitleChange, onOpenThread, onOpenSource, onQuestionsRefresh }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <MobileSourceHeader onBack={onBack} />
      {/* Leave room for the collapsed sheet bar (56px) */}
      <div className="flex-1 min-h-0 overflow-hidden" style={{ paddingBottom: 56 }}>
        <NotePanel
          sourceId={source.id}
          title={source.title}
          onTitleChange={onTitleChange}
          onOpenThread={onOpenThread}
          onOpenSource={onOpenSource}
        />
      </div>
      <MobileNoteSheet
        sourceId={source.id}
        questions={questions}
        onOpenThread={onOpenThread}
        onQuestionsRefresh={onQuestionsRefresh}
      />
    </div>
  );
}
