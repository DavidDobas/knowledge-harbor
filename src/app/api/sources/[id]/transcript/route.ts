import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractVideoId, fetchTranscript } from "@/lib/youtube";
import { withRetry } from "@/lib/retry";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(sources).where(eq(sources.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.transcript) return NextResponse.json({ transcript: row.transcript });

  if (row.type === "youtube" && row.youtubeUrl) {
    const videoId = extractVideoId(row.youtubeUrl);
    if (videoId) {
      try {
        const transcript = await withRetry(() => fetchTranscript(videoId), { attempts: 3, baseMs: 1500 });
        await db.update(sources).set({ transcript }).where(eq(sources.id, id));
        return NextResponse.json({ transcript });
      } catch {
        return NextResponse.json({ transcript: null, error: "Transcript unavailable" });
      }
    }
  }

  return NextResponse.json({ transcript: null });
}
