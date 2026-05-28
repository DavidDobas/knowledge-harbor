import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(spaces).orderBy(desc(spaces.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const [row] = await db.insert(spaces).values({ name }).returning();
  return NextResponse.json(row, { status: 201 });
}
