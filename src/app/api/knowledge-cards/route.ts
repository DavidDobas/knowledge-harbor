import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeCards } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const sourceId = req.nextUrl.searchParams.get("sourceId");
  const rows = sourceId
    ? await db.select().from(knowledgeCards).where(eq(knowledgeCards.sourceId, sourceId)).orderBy(desc(knowledgeCards.createdAt))
    : await db.select().from(knowledgeCards).orderBy(desc(knowledgeCards.createdAt));
  return NextResponse.json(rows);
}
