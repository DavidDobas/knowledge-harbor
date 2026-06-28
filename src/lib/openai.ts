import OpenAI, { toFile } from "openai";

let _client: OpenAI | null = null;
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_client as any)[prop];
  },
});

import { transcriptToText, parseTranscript } from "@/lib/youtube";
import { formatTime } from "@/lib/utils";
import { db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { downloadFromS3 } from "@/lib/s3";

// Model used for the user-facing chat.
export const CHAT_MODEL = "gpt-5.5";
// Cheaper model for background tasks: node titles, thread summaries, video summaries.
export const BACKGROUND_MODEL = "gpt-5.4-mini";

// Upload a PDF source's S3 object to OpenAI Files API (purpose=user_data) and persist
// the returned file_id on the source row. Returns the file_id. Reuses the existing one
// if already present. Used by the chat route to lazy-init full-paper context.
export async function ensureOpenaiFileId(sourceId: string): Promise<string | null> {
  const [src] = await db.select().from(sources).where(eq(sources.id, sourceId));
  if (!src || src.type !== "pdf" || !src.s3Key) return null;
  if (src.openaiFileId) return src.openaiFileId;

  const buf = await downloadFromS3(src.s3Key);
  const filename = src.title.toLowerCase().endsWith(".pdf") ? src.title : `${src.title}.pdf`;
  const uploaded = await openai.files.create({
    file: await toFile(buf, filename, { type: "application/pdf" }),
    purpose: "user_data",
  });
  await db.update(sources).set({ openaiFileId: uploaded.id }).where(eq(sources.id, sourceId));
  return uploaded.id;
}

// Builds the `instructions` string for the Responses API. Kept static for a given thread
// (passage context + transcript don't change after thread creation), which lets the prefix
// hit the 24h prompt cache.
//
// `hasFileContext` = true when the chat will include the PDF via input_file. In that case
// we don't dump transcript/summary text — the model gets the full paper from the file.
export function buildResponsesInstructions(opts: {
  transcript: string | null;
  passageContext?: string | null;
  summary?: string | null;
  hasFileContext: boolean;
  hasWebSearch?: boolean;
  sourceType?: string | null;
  notes?: string | null;
  attachedRefs?: Array<{ type: "pdf" | "youtube"; title: string }>;
}): string {
  const { transcript, passageContext, summary, hasFileContext, hasWebSearch, sourceType, notes, attachedRefs } = opts;
  const webLine = hasWebSearch
    ? " The web_search tool is available — USE IT PROACTIVELY. " +
      "When the user asks about cited sources, references, or works mentioned in the paper " +
      "(e.g. '[24]', 'Smith et al. 2023', 'the ThinkAct paper'), search the web for each one " +
      "and answer with concrete details from the actual papers — not guesses from the " +
      "reference name. Also search for: recent events, specific URLs the user requests, " +
      "definitions of external concepts, and follow-up reading. When in doubt, search. " +
      "Skip it only when the question is answerable purely from the attached source."
    : "";
  // Attachments line — tells the model that extra reference PDFs / transcripts are
  // present on the first user message so it knows to treat them as background, not as
  // the primary subject of the question.
  const attachedLine = attachedRefs && attachedRefs.length > 0
    ? " Additional reference materials are attached on the first user turn: " +
      attachedRefs.map((r) => `${r.type === "pdf" ? "[PDF]" : "[Video transcript]"} ${r.title}`).join("; ") +
      ". Use them as supporting context — cite them by title when you draw on them."
    : "";
  const base =
    "You are a helpful research assistant. " +
    "Format any mathematics with KaTeX: inline math as $...$ and display equations as $$...$$. " +
    "Never use \\( \\) or bare square brackets for math." +
    webLine +
    attachedLine;

  if (passageContext) {
    const broader = hasFileContext
      ? null
      : summary ?? (transcript ? transcriptToText(transcript).slice(0, 3000) : null);
    return [
      base,
      hasFileContext
        ? "The full source PDF is attached as a file. The user selected a specific passage from it and is asking about it."
        : "The user selected a specific passage and is asking about it.",
      "Answer about the CURRENT PASSAGE. Use the surrounding source only to resolve references " +
        "(pronouns, 'this', 'that', 'here') — do NOT shift your answer to the surrounding source. " +
        "If the question is vague (e.g. 'what is meant here?'), interpret it as being about the current passage.",
      "",
      "Current passage:",
      passageContext,
      broader ? `\nBroader source background (only if needed):\n${broader}` : "",
    ].join("\n");
  }

  if (hasFileContext) {
    return `${base} The full source PDF is attached as a file. Answer questions about it.`;
  }
  if (sourceType === "note" && notes?.trim()) {
    return `${base} Answer questions about this note.\n\nNote:\n${notes.slice(0, 8000)}`;
  }
  if (!transcript) {
    const material = summary ?? (notes?.trim() ? notes.slice(0, 6000) : null);
    if (material) {
      return `${base} Answer questions about the provided source material.\n\nSource material:\n${material}`;
    }
    return `${base} Answer questions about the provided source material.`;
  }
  const material = summary ?? transcriptToText(transcript).slice(0, 6000);
  return `${base} Answer questions about the provided source material.\n\nSource material:\n${material}`;
}

// Generate a short, representative node title from a question + the passage it's about.
// Uses context so vague questions ("what is meant here?") still get a meaningful title.
export async function generateQuestionTitle(question: string, context?: string | null): Promise<string> {
  const response = await openai.chat.completions.create({
    model: BACKGROUND_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You create a very short title (3-7 words, max ~45 characters) for a Q&A node in a knowledge graph. " +
          "The user asks a question about a specific passage. Use the passage to make the title concrete and " +
          "representative even when the question is vague (e.g. 'what is meant here?' → 'Meaning of die area'). " +
          "Name the TOPIC, not the literal question. No quotes, no trailing punctuation.",
      },
      {
        role: "user",
        content: context
          ? `Passage being asked about:\n${context.slice(0, 1500)}\n\nQuestion: ${question}`
          : `Question: ${question}`,
      },
    ],
    max_completion_tokens: 24,
    temperature: 0.3,
  });
  const out = response.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, "") ?? "";
  return out || question;
}

export async function generateSummary(rawTranscript: string): Promise<string> {
  const segments = parseTranscript(rawTranscript);
  const formatted = segments.map((s) => `[${formatTime(s.offset)}] ${s.text}`).join("\n");

  const response = await openai.responses.create({
    model: CHAT_MODEL,
    instructions:
      "You create structured video summaries. Use ONLY the exact timestamps visible in the transcript — never invent or estimate them. Cover the entire video from start to finish.",
    input: [
      {
        role: "user",
        content: `Summarize this timestamped transcript into sections using this format:\n## Section Title [MM:SS–MM:SS]\n- key point\n- key point\n\nDerive the timestamp ranges from the actual [MM:SS] markers in the transcript. Cover the FULL video — include sections all the way to the end. Keep each section concise.\n\nTranscript:\n${formatted}`,
      },
    ],
  });
  return response.output_text ?? "";
}

export async function generatePdfSummary(sourceId: string): Promise<string | null> {
  const fileId = await ensureOpenaiFileId(sourceId);
  if (!fileId) return null;

  const response = await openai.responses.create({
    model: CHAT_MODEL,
    instructions:
      "You are a research assistant. Produce a clear, structured summary of the attached document. " +
      "Format: ## Section headings for major topics, bullet points for key points under each section. " +
      "Cover the full document — main thesis, key arguments, methodology (if any), findings, and conclusions.",
    input: [
      {
        role: "user",
        content: [
          { type: "input_file", file_id: fileId },
          { type: "input_text", text: "Please provide a structured summary of this document." },
        ],
      },
    ],
  });
  return response.output_text ?? null;
}
