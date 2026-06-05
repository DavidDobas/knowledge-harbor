import { pgTable, text, timestamp, uuid, integer, boolean } from "drizzle-orm/pg-core";

export const spaces = pgTable("spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  graphLayout: text("graph_layout"), // JSON { positions, areas } for the space-level source graph
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'pdf' | 'youtube'
  title: text("title").notNull(),
  s3Key: text("s3_key"),
  youtubeUrl: text("youtube_url"),
  transcript: text("transcript"),
  summary: text("summary"),
  notes: text("notes"),
  graphLayout: text("graph_layout"), // JSON map of graph nodeId -> { x, y }
  pdfHighlights: text("pdf_highlights"), // JSON array of standalone highlights { id, page, text }
  openaiFileId: text("openai_file_id"), // file id from OpenAI Files API (purpose=user_data) for PDFs
  thumbnailKey: text("thumbnail_key"), // S3 key for the rendered first-page JPEG (PDFs only)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  // "general" = started from the Ask hub (whole-source context); "passage" = transcript/PDF selection.
  origin: text("origin").notNull().default("passage"),
  context: text("context"),
  chunkOffset: integer("chunk_offset"),
  pdfPage: integer("pdf_page"),
  pdfHighlightText: text("pdf_highlight_text"),
  pdfHighlightRects: text("pdf_highlight_rects"), // JSON array of { x, y, w, h } normalized to page
  // Per-thread chip: when false, the source PDF is NOT sent as input_file context for this thread.
  includeFile: boolean("include_file").default(true).notNull(),
  // Per-thread opt-in: when true, the Responses call is given the hosted `web_search` tool
  // and URL citations are appended to the assistant reply.
  includeWeb: boolean("include_web").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").references(() => questions.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const knowledgeCards = pgTable("knowledge_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").references(() => questions.id, { onDelete: "cascade" }).notNull(),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
