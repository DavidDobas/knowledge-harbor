import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sources } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { uploadToS3, getPresignedUrl } from "@/lib/s3";
import { extractVideoId, fetchTranscript } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get("spaceId");
  const rows = spaceId
    ? await db.select().from(sources).where(eq(sources.spaceId, spaceId)).orderBy(desc(sources.createdAt))
    : await db.select().from(sources).orderBy(desc(sources.createdAt));
  // Presign thumbnails for any row that has one — these go on the graph cards. Presigning
  // is a local crypto op (no network), so doing N of them in parallel is cheap.
  const withThumbs = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      thumbnailUrl: r.thumbnailKey ? await getPresignedUrl(r.thumbnailKey) : null,
    })),
  );
  return NextResponse.json(withThumbs);
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const title = form.get("title") as string;
    const spaceId = form.get("spaceId") as string | null;
    const file = form.get("file") as File;
    const thumbnail = form.get("thumbnail") as File | null;

    if (!file || !title) return NextResponse.json({ error: "title and file required" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `pdfs/${Date.now()}-${file.name}`;
    await uploadToS3(key, buffer, "application/pdf");

    // Optional first-page thumbnail rendered on the client. Best-effort — if it fails
    // the row is still created and the card falls back to the file icon.
    let thumbnailKey: string | null = null;
    if (thumbnail && thumbnail.size > 0) {
      try {
        const thumbBuf = Buffer.from(await thumbnail.arrayBuffer());
        thumbnailKey = `thumbnails/${Date.now()}-${file.name}.jpg`;
        await uploadToS3(thumbnailKey, thumbBuf, "image/jpeg");
      } catch {
        thumbnailKey = null;
      }
    }

    const [row] = await db.insert(sources).values({ type: "pdf", title, s3Key: key, thumbnailKey, spaceId: spaceId || null }).returning();
    return NextResponse.json(row, { status: 201 });
  }

  const { type, title, youtubeUrl, spaceId } = await req.json();
  if (!title || !type) return NextResponse.json({ error: "type and title required" }, { status: 400 });

  if (type === "note") {
    const [row] = await db.insert(sources).values({ type: "note", title, spaceId: spaceId || null }).returning();
    return NextResponse.json(row, { status: 201 });
  }

  if (type !== "youtube" || !youtubeUrl) return NextResponse.json({ error: "type, title, youtubeUrl required" }, { status: 400 });

  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });

  let transcript: string | null = null;
  try {
    transcript = await fetchTranscript(videoId);
  } catch {
    // transcript fetch is best-effort
  }

  const [row] = await db.insert(sources).values({ type: "youtube", title, youtubeUrl, transcript, spaceId: spaceId || null }).returning();
  return NextResponse.json(row, { status: 201 });
}
