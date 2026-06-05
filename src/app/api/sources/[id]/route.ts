import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPresignedUrl } from "@/lib/s3";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(sources).where(eq(sources.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let pdfUrl: string | null = null;
  if (row.s3Key) pdfUrl = await getPresignedUrl(row.s3Key);
  const thumbnailUrl = row.thumbnailKey ? await getPresignedUrl(row.thumbnailKey) : null;

  return NextResponse.json({ ...row, pdfUrl, thumbnailUrl });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const patch: Partial<{ title: string; graphLayout: string; pdfHighlights: string }> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.graphLayout === "string") patch.graphLayout = body.graphLayout;
  if (typeof body.pdfHighlights === "string") patch.pdfHighlights = body.pdfHighlights;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  const [row] = await db.update(sources).set(patch).where(eq(sources.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(sources).where(eq(sources.id, id));
  return new NextResponse(null, { status: 204 });
}
