"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type { PdfHighlight, PdfRect } from "@/components/source/PDFViewer";
import MobileSourceHeader from "./MobileSourceHeader";
import MobilePdfSheet from "./MobilePdfSheet";
import MobileAskPassageSheet from "./MobileAskPassageSheet";
import type { Question, Source } from "@/lib/types";

const PDFViewer = dynamic(() => import("@/components/source/PDFViewer"), { ssr: false });

interface Props {
  source: Source & { pdfUrl?: string | null };
  questions: Question[];
  onBack: () => void;
  onOpenThread: (questionId: string) => void;
  onQuestionsRefresh: () => void;
}

interface TextSelection {
  text: string;
  page: number;
  rects: PdfRect[];
}

export default function MobilePdfSource({ source, questions, onBack, onOpenThread, onQuestionsRefresh }: Props) {
  const presignedUrl = source.pdfUrl ?? null;
  const [selection, setSelection] = useState<TextSelection | null>(null);

  const highlights: PdfHighlight[] = questions
    .filter((q) => q.pdfPage !== null && q.pdfHighlightRects)
    .map((q) => ({
      kind: "question" as const,
      id: q.id,
      text: q.pdfHighlightText ?? "",
      page: q.pdfPage!,
      rects: JSON.parse(q.pdfHighlightRects!),
    }));

  const handleTextSelect = useCallback((text: string, page: number, rects: PdfRect[]) => {
    setSelection({ text, page, rects });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  if (!presignedUrl) {
    return (
      <div className="flex flex-col h-full min-h-0" style={{ background: "var(--background)" }}>
        <MobileSourceHeader onBack={onBack} />
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-sm text-center" style={{ color: "var(--muted)" }}>PDF could not be loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: "var(--background)" }}>
      <MobileSourceHeader onBack={onBack} />

      {/* PDF fills all space above the bottom sheet */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        // Leave room for the collapsed sheet handle (56px)
        style={{ paddingBottom: 56 }}
      >
        <PDFViewer
          pdfUrl={presignedUrl}
          highlights={highlights}
          initialPageWidth={typeof window !== "undefined" ? window.innerWidth : undefined}
          onTextSelect={handleTextSelect}
          onClearSelection={handleClearSelection}
          onHighlightClick={onOpenThread}
          onHighlight={() => {}}
          onDeleteHighlight={() => {}}
          onEditComment={() => {}}
        />
      </div>

      {/* Bottom sheet — Notes / Threads */}
      <MobilePdfSheet
        sourceId={source.id}
        questions={questions}
        onOpenThread={onOpenThread}
        onQuestionsRefresh={onQuestionsRefresh}
      />

      {/* Passage selection ask sheet */}
      {selection && (
        <MobileAskPassageSheet
          selection={selection}
          source={source}
          onClose={() => setSelection(null)}
          onThreadCreated={(qid) => {
            setSelection(null);
            onQuestionsRefresh();
            onOpenThread(qid);
          }}
        />
      )}
    </div>
  );
}
