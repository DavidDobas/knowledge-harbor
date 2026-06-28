import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages, questions, sources } from "@/lib/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import { openai, buildResponsesInstructions, ensureOpenaiFileId, CHAT_MODEL } from "@/lib/openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db.select().from(messages).where(eq(messages.questionId, id)).orderBy(asc(messages.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  await db.insert(messages).values({ questionId: id, role: "user", content });

  const [question] = await db.select().from(questions).where(eq(questions.id, id));
  const [source] = await db.select().from(sources).where(eq(sources.id, question.sourceId));
  const history = await db.select().from(messages).where(eq(messages.questionId, id)).orderBy(asc(messages.createdAt));

  // For PDF threads where the user kept the file chip, ensure the source is uploaded to
  // the OpenAI Files API and we have a file_id. The first chat in a thread triggers the
  // upload lazily; subsequent turns reuse the cached id.
  let fileId: string | null = null;
  if (source?.type === "pdf" && question?.includeFile) {
    try { fileId = await ensureOpenaiFileId(source.id); } catch { fileId = null; }
  }

  // Resolve attached sources (other PDFs / YouTube videos from the user's library).
  // Order is preserved from the stored JSON so the prompt cache prefix is deterministic.
  let attachedIds: string[] = [];
  if (question?.attachedSourceIds) {
    try {
      const parsed = JSON.parse(question.attachedSourceIds);
      if (Array.isArray(parsed)) attachedIds = parsed.filter((x): x is string => typeof x === "string");
    } catch { /* malformed JSON → treat as no attachments */ }
  }
  const attachedRows = attachedIds.length > 0
    ? await db.select().from(sources).where(inArray(sources.id, attachedIds))
    : [];
  // Re-sort to match the ID order in attachedIds (DB returns arbitrary order).
  const byId = new Map(attachedRows.map((r) => [r.id, r]));
  const attached = attachedIds.map((aid) => byId.get(aid)).filter((r): r is NonNullable<typeof r> => !!r);

  // Materialise each attachment into parts that land on the first user message.
  // PDFs become input_file (lazy upload + cache); YouTube becomes input_text with the
  // transcript prefixed by a title header so the model can tell sources apart.
  const attachmentParts: Array<{ type: "input_text"; text: string } | { type: "input_file"; file_id: string }> = [];
  for (const ref of attached) {
    if (ref.type === "pdf") {
      try {
        const refFileId = await ensureOpenaiFileId(ref.id);
        if (refFileId) attachmentParts.push({ type: "input_file", file_id: refFileId });
      } catch { /* skip on upload failure */ }
    } else if (ref.type === "youtube" && ref.transcript) {
      attachmentParts.push({
        type: "input_text",
        text: `## Attached reference: ${ref.title}\n\n${ref.transcript}`,
      });
    }
  }

  const instructions = buildResponsesInstructions({
    transcript: source?.transcript ?? null,
    passageContext: question?.context ?? null,
    summary: source?.summary ?? null,
    hasFileContext: fileId != null,
    hasWebSearch: question?.includeWeb === true,
    sourceType: source?.type ?? null,
    notes: source?.notes ?? null,
    attachedRefs: attached.map((r) => ({ type: r.type as "pdf" | "youtube", title: r.title })),
  });

  // Build the input array as a conversation. The first user message carries the input_file
  // (when present) and any attachment parts so the same prefix lands on every turn →
  // prompt cache hit on follow-ups.
  const input: ResponseInputItem[] = history.map((m, idx) => {
    if (m.role === "user") {
      const parts: Array<{ type: "input_text"; text: string } | { type: "input_file"; file_id: string }> = [];
      if (idx === 0) {
        if (fileId) parts.push({ type: "input_file", file_id: fileId });
        if (attachmentParts.length > 0) parts.push(...attachmentParts);
      }
      parts.push({ type: "input_text", text: m.content });
      return { role: "user", content: parts };
    }
    // Assistant turns are plain text — EasyInputMessage accepts a string for these.
    return { role: "assistant", content: m.content };
  });

  // Hosted web_search tool — opt-in per thread. Off by default to avoid the latency hit
  // and to keep prompt-cache hit rate high when the user just wants to read the PDF.
  const tools = question?.includeWeb ? [{ type: "web_search" as const }] : undefined;

  const encoder = new TextEncoder();
  // INIT_MARKER: sent immediately when the stream opens, before the OpenAI call starts.
  // This wakes up the HTTP connection so the browser receives bytes right away, giving
  // React time to render the "Thinking…" state before the first real token arrives.
  const INIT_MARKER = "\x00INIT\x00";
  // SEARCHING_MARKER: sent when a web_search tool call begins so the client can show
  // a "Searching the web…" indicator during the silent tool-call phase.
  const SEARCHING_MARKER = "\x00SEARCHING\x00";

  const readable = new ReadableStream({
    async start(controller) {
      // Wake up the connection immediately — do NOT await anything before this.
      controller.enqueue(encoder.encode(INIT_MARKER));

      const stream = await openai.responses.create({
        model: CHAT_MODEL,
        stream: true,
        instructions,
        input,
        tools,
        prompt_cache_key: `q:${id}`,
        prompt_cache_retention: "24h",
      });

      let fullContent = "";
      let searchingEmitted = false;
      const urlCitations: { url: string; title: string }[] = [];

      for await (const event of stream) {
        // Detect the start of a web_search tool call. The exact event name can vary across
        // SDK versions so we check a few candidates.
        if (
          !searchingEmitted &&
          (event.type === "response.web_search_call.in_progress" ||
            event.type === "response.web_search_call.searching" ||
            (event.type === "response.output_item.added" &&
              (event.item as { type?: string } | undefined)?.type === "web_search_call") ||
            event.type.includes("web_search_call"))
        ) {
          searchingEmitted = true;
          controller.enqueue(encoder.encode(SEARCHING_MARKER));
        } else if (event.type === "response.output_text.delta" && event.delta) {
          fullContent += event.delta;
          controller.enqueue(encoder.encode(event.delta));
        } else if (event.type === "response.output_text.annotation.added") {
          // Citations from web_search arrive as separate annotation events. We collect
          // them, dedupe by URL, and stream a Markdown source list once the model
          // finishes — that keeps the source list out of the middle of the answer.
          const a = event.annotation as { type?: string; url?: string; title?: string } | undefined;
          if (a?.type === "url_citation" && a.url) {
            urlCitations.push({ url: a.url, title: a.title || a.url });
          }
        }
      }

      if (urlCitations.length > 0) {
        const seen = new Set<string>();
        const unique = urlCitations.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
        const block = "\n\n---\n**Sources:**\n" + unique.map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join("\n");
        fullContent += block;
        controller.enqueue(encoder.encode(block));
      }

      await db.insert(messages).values({ questionId: id, role: "assistant", content: fullContent });
      controller.close();
    },
  });

  return new Response(readable, {
    // Disable all intermediate buffering so each token reaches the browser immediately.
    // Transfer-Encoding: chunked is HTTP/1.1-only and stripped by HTTP/2, so we rely on
    // X-Accel-Buffering and Cache-Control to prevent nginx / Vercel edge from batching chunks.
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Accel-Buffering": "no",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
