import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sources, questions, knowledgeCards } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getPresignedUrl } from "@/lib/s3";

/** Slim payload for the L3 graph — no transcript, notes, summary, or thread context. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [source] = await db
    .select({
      id: sources.id,
      spaceId: sources.spaceId,
      type: sources.type,
      title: sources.title,
      youtubeUrl: sources.youtubeUrl,
      graphLayout: sources.graphLayout,
      thumbnailKey: sources.thumbnailKey,
      createdAt: sources.createdAt,
    })
    .from(sources)
    .where(eq(sources.id, id));

  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [qs, cs] = await Promise.all([
    db
      .select({
        id: questions.id,
        sourceId: questions.sourceId,
        title: questions.title,
        origin: questions.origin,
        chunkOffset: questions.chunkOffset,
        pdfPage: questions.pdfPage,
        createdAt: questions.createdAt,
      })
      .from(questions)
      .where(eq(questions.sourceId, id))
      .orderBy(desc(questions.createdAt)),
    db
      .select({
        id: knowledgeCards.id,
        questionId: knowledgeCards.questionId,
        sourceId: knowledgeCards.sourceId,
        title: knowledgeCards.title,
        createdAt: knowledgeCards.createdAt,
      })
      .from(knowledgeCards)
      .where(eq(knowledgeCards.sourceId, id))
      .orderBy(desc(knowledgeCards.createdAt)),
  ]);

  const thumbnailUrl = source.thumbnailKey ? await getPresignedUrl(source.thumbnailKey) : null;

  return NextResponse.json({
    source: {
      ...source,
      thumbnailUrl,
      s3Key: null,
      transcript: null,
      summary: null,
      notes: null,
      pdfHighlights: null,
      openaiFileId: null,
    },
    questions: qs.map((q) => ({
      ...q,
      origin: q.origin ?? "passage",
      pdfHighlightText: null,
      pdfHighlightRects: null,
      includeFile: true,
      includeWeb: false,
    })),
    cards: cs.map((c) => ({ ...c, summary: "" })),
  });
}
