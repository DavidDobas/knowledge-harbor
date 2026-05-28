"use client";

import { useEffect, useState } from "react";
import type { Source, SelectedNode } from "@/lib/types";

interface Props {
  sourceId: string;
  onSelectNode: (node: SelectedNode) => void;
  onGraphRefresh: () => void;
}

export default function SourcePanel({ sourceId, onSelectNode, onGraphRefresh }: Props) {
  const [source, setSource] = useState<Source | null>(null);
  const [questionTitle, setQuestionTitle] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    fetch(`/api/sources/${sourceId}`).then((r) => r.json()).then(setSource);
  }, [sourceId]);

  async function askQuestion() {
    if (!questionTitle.trim()) return;
    setAsking(true);
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, title: questionTitle }),
    });
    const question = await res.json();
    setQuestionTitle("");
    setAsking(false);
    onGraphRefresh();
    onSelectNode({ type: "question", id: question.id });
  }

  if (!source) return <div className="p-4 text-xs" style={{ color: "var(--muted)" }}>Loading…</div>;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <span className="text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Source</span>
        <h2 className="font-semibold text-sm mt-1 leading-snug" style={{ color: "var(--foreground)" }}>{source.title}</h2>
        <span
          className="inline-block text-xs mt-1 px-2 py-0.5 rounded-full"
          style={{ background: source.type === "pdf" ? "#1e3a5f" : "#3b1f5f", color: source.type === "pdf" ? "#60a5fa" : "#c084fc" }}
        >
          {source.type.toUpperCase()}
        </span>
        {source.youtubeUrl && (
          <p className="text-xs mt-2 truncate" style={{ color: "var(--muted)" }}>{source.youtubeUrl}</p>
        )}
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Added {new Date(source.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>Ask a question</p>
        <input
          value={questionTitle}
          onChange={(e) => setQuestionTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") askQuestion(); }}
          placeholder="What is this about?"
          className="w-full text-xs px-3 py-2 rounded border outline-none mb-2"
          style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
        />
        <button
          onClick={askQuestion}
          disabled={asking || !questionTitle.trim()}
          className="w-full text-xs py-2 rounded font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {asking ? "Creating…" : "Ask Question"}
        </button>
      </div>
    </div>
  );
}
