import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { questions, sources } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateQuestionTitle } from "@/lib/openai";

export async function GET(req: NextRequest) {
  const sourceId = req.nextUrl.searchParams.get("sourceId");
  if (sourceId) {
    const rows = await db.select().from(questions).where(eq(questions.sourceId, sourceId)).orderBy(desc(questions.createdAt));
    return NextResponse.json(rows);
  }
  // No sourceId → return all questions joined with their source title/type.
  // Used by the notes "@" mention picker to reference any chat across sources.
  const rows = await db
    .select({
      id: questions.id,
      sourceId: questions.sourceId,
      title: questions.title,
      createdAt: questions.createdAt,
      sourceTitle: sources.title,
      sourceType: sources.type,
    })
    .from(questions)
    .innerJoin(sources, eq(questions.sourceId, sources.id))
    .orderBy(desc(questions.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { sourceId, title, context, chunkOffset, pdfPage, pdfHighlightText, pdfHighlightRects, includeFile, includeWeb } = await req.json();
  if (!sourceId || !title) return NextResponse.json({ error: "sourceId and title required" }, { status: 400 });

  // Insert immediately with the raw question as the title so the chat can start without
  // waiting on the LLM. A representative title is generated in the background (see below).
  const [row] = await db.insert(questions).values({
    sourceId, title,
    context: context ?? null,
    chunkOffset: chunkOffset ?? null,
    pdfPage: pdfPage ?? null,
    pdfHighlightText: pdfHighlightText ?? null,
    pdfHighlightRects: pdfHighlightRects ?? null,
    includeFile: includeFile !== false,
    includeWeb: includeWeb === true,
  }).returning();

  // Generate a concise, representative node title (from the question + its context) after the
  // response is sent, then update the row. The client refreshes shortly after to pick it up.
  after(async () => {
    try {
      const nodeTitle = await generateQuestionTitle(title, context ?? null);
      if (nodeTitle && nodeTitle !== title) {
        await db.update(questions).set({ title: nodeTitle }).where(eq(questions.id, row.id));
      }
    } catch {
      /* keep the raw question as the title */
    }
  });

  return NextResponse.json(row, { status: 201 });
}
