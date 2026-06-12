import { fetchJson } from "@/lib/fetchJson";
import type { Question } from "@/lib/types";

export interface CreateQuestionInput {
  sourceId: string;
  title: string;
  origin?: "general" | "passage";
  context?: string | null;
  chunkOffset?: number | null;
  pdfPage?: number | null;
  pdfHighlightText?: string | null;
  pdfHighlightRects?: string | null;
  includeFile?: boolean;
  includeWeb?: boolean;
}

/** Create a question thread. Returns the created row, or null on failure. */
export function createQuestion(input: CreateQuestionInput): Promise<Question | null> {
  return fetchJson<Question>("/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Patch a question's settings (title, includeWeb, includeFile). */
export function patchQuestion(
  id: string,
  patch: { title?: string; includeWeb?: boolean; includeFile?: boolean },
): Promise<Question | null> {
  return fetchJson<Question>(`/api/questions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
