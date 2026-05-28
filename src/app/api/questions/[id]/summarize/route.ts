import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages, questions, knowledgeCards } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { openai, BACKGROUND_MODEL } from "@/lib/openai";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [question] = await db.select().from(questions).where(eq(questions.id, id));
  if (!question) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const history = await db.select().from(messages).where(eq(messages.questionId, id)).orderBy(asc(messages.createdAt));

  const threadText = history.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");

  const completion = await openai.chat.completions.create({
    model: BACKGROUND_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a research assistant. Given a Q&A thread, produce a concise knowledge card with a short title and a 2-4 sentence summary capturing the key insight.",
      },
      {
        role: "user",
        content: `Thread:\n${threadText}\n\nRespond in JSON: {"title": "...", "summary": "..."}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const { title, summary } = JSON.parse(completion.choices[0].message.content!);
  const [card] = await db.insert(knowledgeCards).values({ questionId: id, sourceId: question.sourceId, title, summary }).returning();
  return NextResponse.json(card, { status: 201 });
}
