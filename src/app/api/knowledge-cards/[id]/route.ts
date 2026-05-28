import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { knowledgeCards } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(knowledgeCards).where(eq(knowledgeCards.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(knowledgeCards).where(eq(knowledgeCards.id, id));
  return new NextResponse(null, { status: 204 });
}
