import type { TranscriptSegment } from "@/lib/youtube";
import { formatTime } from "@/lib/utils";

export interface DisplayChunk {
  text: string;
  offset: number;
  segStart: number;
  segEnd: number;
}

export function groupIntoChunks(segments: TranscriptSegment[]): DisplayChunk[] {
  const chunks: DisplayChunk[] = [];
  let i = 0;
  while (i < segments.length) {
    const start = i;
    let text = "";
    while (i < segments.length) {
      text += (text ? " " : "") + segments[i].text;
      i++;
      if (/[.?!]\s*$/.test(text.trim()) && text.length >= 200) break;
      if (text.length >= 800) break;
    }
    chunks.push({ text, offset: segments[start].offset, segStart: start, segEnd: i - 1 });
  }
  return chunks;
}

export function fmtSegs(segments: TranscriptSegment[], from: number, to: number): string {
  return segments.slice(from, to + 1).map((s) => `[${formatTime(s.offset)}] ${s.text}`).join("\n");
}

export function buildContext(segments: TranscriptSegment[], chunks: DisplayChunk[], chunkIdx: number): string {
  const chunk = chunks[chunkIdx];
  const current = fmtSegs(segments, chunk.segStart, chunk.segEnd);

  const precFrom = Math.max(0, chunkIdx - 2);
  let preceding = "";
  if (precFrom < chunkIdx) {
    preceding = fmtSegs(segments, chunks[precFrom].segStart, chunks[chunkIdx - 1].segEnd);
  }

  const parts: string[] = [];
  if (preceding) parts.push(`### PRECEDING CONTEXT (for reference only)\n${preceding}`);
  parts.push(`### CURRENT PASSAGE (the question is about THIS)\n${current}`);
  return parts.join("\n\n");
}

/** Lightweight chunk indices for YouTubePlayer sync (no text payload). */
export function groupIntoChunkIndices(segments: TranscriptSegment[]): { segStart: number; segEnd: number }[] {
  return groupIntoChunks(segments).map(({ segStart, segEnd }) => ({ segStart, segEnd }));
}
