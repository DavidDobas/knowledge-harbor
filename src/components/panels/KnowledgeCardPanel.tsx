"use client";

import { useEffect, useState } from "react";
import type { KnowledgeCard, SelectedNode } from "@/lib/types";
import { fetchJson } from "@/lib/fetchJson";
import Loading from "@/components/ui/Loading";

interface Props {
  cardId: string;
  onSelectNode: (node: SelectedNode | null) => void;
}

export default function KnowledgeCardPanel({ cardId, onSelectNode }: Props) {
  const [card, setCard] = useState<KnowledgeCard | null>(null);

  useEffect(() => {
    fetchJson<KnowledgeCard>(`/api/knowledge-cards/${cardId}`).then(setCard);
  }, [cardId]);

  if (!card) return <Loading />;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <span className="type-mono" style={{ fontSize: "0.65rem", letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>Knowledge Card</span>
        <h2 className="type-serif font-semibold text-base mt-1.5 leading-snug" style={{ color: "var(--foreground)" }}>{card.title}</h2>
        <p className="type-mono mt-1" style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
          {new Date(card.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      <div
        className="text-xs leading-relaxed p-3 rounded-lg"
        style={{ background: "var(--sidebar-bg)", color: "var(--foreground)", border: "1px solid var(--border)" }}
      >
        {card.summary}
      </div>

      <button
        onClick={() => onSelectNode({ type: "question", id: card.questionId })}
        className="text-xs py-1.5 rounded font-medium hover:opacity-90 transition-opacity"
        style={{ background: "var(--background)", color: "var(--muted)", border: "1px solid var(--border)" }}
      >
        View source question →
      </button>
    </div>
  );
}
