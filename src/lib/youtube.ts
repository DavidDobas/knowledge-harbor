import { YoutubeTranscript } from "youtube-transcript";

export interface TranscriptSegment {
  text: string;
  offset: number; // milliseconds
  duration: number; // milliseconds
}

export function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export async function fetchTranscript(videoId: string): Promise<string> {
  const items = await YoutubeTranscript.fetchTranscript(videoId);
  const segments: TranscriptSegment[] = items.map((i) => ({
    text: i.text,
    offset: i.offset,
    duration: i.duration,
  }));
  return JSON.stringify(segments);
}

export function parseTranscript(raw: string): TranscriptSegment[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as TranscriptSegment[];
  } catch {}
  // legacy plain text — wrap as single segment
  return [{ text: raw, offset: 0, duration: 0 }];
}

export function transcriptToText(raw: string): string {
  return parseTranscript(raw).map((s) => s.text).join(" ");
}
