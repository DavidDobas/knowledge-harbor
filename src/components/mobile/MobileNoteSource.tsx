"use client";

import NotePanel from "@/components/panels/NotePanel";
import type { Source } from "@/lib/types";

interface Props {
  source: Source;
  onBack: () => void;
  onTitleChange: (title: string) => void;
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
}

export default function MobileNoteSource({ source, onBack, onTitleChange, onOpenThread, onOpenSource }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <header className="mobile-safe-top shrink-0 flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={onBack} className="mobile-touch-target type-mono text-xs shrink-0" style={{ color: "var(--accent)" }}>
          ←
        </button>
      </header>
      <NotePanel
        sourceId={source.id}
        title={source.title}
        onTitleChange={onTitleChange}
        onOpenThread={onOpenThread}
        onOpenSource={onOpenSource}
      />
    </div>
  );
}
