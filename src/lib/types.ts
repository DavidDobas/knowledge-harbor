export type SourceType = "pdf" | "youtube" | "note";

export interface Space {
  id: string;
  name: string;
  graphLayout: string | null;
  createdAt: string;
}

export interface Source {
  id: string;
  spaceId: string | null;
  type: SourceType;
  title: string;
  s3Key: string | null;
  youtubeUrl: string | null;
  transcript: string | null;
  summary: string | null;
  notes: string | null;
  graphLayout: string | null;
  pdfHighlights: string | null;
  openaiFileId: string | null;
  thumbnailKey: string | null;
  // Populated by API responses with a presigned URL for thumbnailKey (graph cards use this).
  thumbnailUrl?: string | null;
  createdAt: string;
}

export type QuestionOrigin = "general" | "passage";

export interface Question {
  id: string;
  sourceId: string;
  title: string;
  origin: QuestionOrigin;
  chunkOffset: number | null;
  pdfPage: number | null;
  pdfHighlightText: string | null;
  pdfHighlightRects: string | null;
  includeFile: boolean;
  includeWeb: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  questionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface KnowledgeCard {
  id: string;
  questionId: string;
  sourceId: string;
  title: string;
  summary: string;
  createdAt: string;
}

export type SelectedNode =
  | { type: "source"; id: string }
  | { type: "ask" }
  | { type: "question"; id: string }
  | { type: "card"; id: string };

export function isGeneralQuestion(q: { origin?: QuestionOrigin | string | null }): boolean {
  return q.origin === "general";
}
