import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(questions).where(eq(questions.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { title, includeWeb, includeFile } = body as {
    title?: string;
    includeWeb?: boolean;
    includeFile?: boolean;
  };

  const updates: { title?: string; includeWeb?: boolean; includeFile?: boolean } = {};
  if (typeof title === "string" && title.trim()) updates.title = title.trim();
  if (typeof includeWeb === "boolean") updates.includeWeb = includeWeb;
  if (typeof includeFile === "boolean") updates.includeFile = includeFile;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "title, includeWeb, or includeFile required" }, { status: 400 });
  }

  const [row] = await db.update(questions).set(updates).where(eq(questions.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(questions).where(eq(questions.id, id));
  return new NextResponse(null, { status: 204 });
}
