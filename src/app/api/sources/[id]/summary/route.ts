import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateSummary } from "@/lib/openai";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const force = req.nextUrl.searchParams.get("force") === "true";

  const [source] = await db.select().from(sources).where(eq(sources.id, id));
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (source.summary && !force) return NextResponse.json({ summary: source.summary });
  if (!source.transcript) return NextResponse.json({ summary: null });

  const summary = await generateSummary(source.transcript);
  await db.update(sources).set({ summary }).where(eq(sources.id, id));

  return NextResponse.json({ summary });
}
