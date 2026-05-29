"use client";

import { useEffect, useRef, useState } from "react";
import type { Space } from "@/lib/types";
import { renderFirstPageThumbnail } from "@/lib/pdfThumbnail";

interface Props {
  spaceId: string | null;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddSourceModal({ spaceId, onClose, onAdded }: Props) {
  const [tab, setTab] = useState<"pdf" | "youtube" | "note">("youtube");
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Space selection
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [chosenSpaceId, setChosenSpaceId] = useState<string | "">(spaceId ?? "");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");

  useEffect(() => {
    fetch("/api/spaces").then((r) => r.json()).then(setSpaces);
  }, []);

  async function createSpace(): Promise<string | null> {
    if (!newSpaceName.trim()) { setError("Space name required"); return null; }
    const res = await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSpaceName.trim() }),
    });
    if (!res.ok) { setError("Failed to create space"); return null; }
    const created: Space = await res.json();
    setSpaces((prev) => [...prev, created]);
    setChosenSpaceId(created.id);
    setCreatingSpace(false);
    setNewSpaceName("");
    return created.id;
  }

  async function handleSubmit() {
    if (!title.trim()) { setError("Title is required"); return; }

    let resolvedSpaceId: string | null = chosenSpaceId || null;
    if (creatingSpace) {
      resolvedSpaceId = await createSpace();
      if (!resolvedSpaceId) return;
    }

    setError("");
    setLoading(true);
    try {
      if (tab === "note") {
        const res = await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "note", title, spaceId: resolvedSpaceId }),
        });
        if (!res.ok) throw new Error(await res.text());
      } else if (tab === "youtube") {
        if (!youtubeUrl.trim()) { setError("YouTube URL required"); setLoading(false); return; }
        const res = await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "youtube", title, youtubeUrl, spaceId: resolvedSpaceId }),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        if (!file) { setError("Please select a PDF"); setLoading(false); return; }
        // Render the first page client-side so the source card shows a real cover image
        // in the graph. Failure (corrupt PDF, blocked worker, etc.) is non-fatal — the
        // server just stores the row without a thumbnail and the card uses the icon fallback.
        const thumbnailBlob = await renderFirstPageThumbnail(file).catch(() => null);
        const form = new FormData();
        form.append("file", file);
        form.append("title", title);
        if (resolvedSpaceId) form.append("spaceId", resolvedSpaceId);
        if (thumbnailBlob) form.append("thumbnail", thumbnailBlob, "thumbnail.jpg");
        const res = await fetch("/api/sources", { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());
      }
      onAdded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add source");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-md rounded-xl p-6 shadow-2xl" style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>Add Source</h2>
          <button onClick={onClose} className="text-lg leading-none hover:opacity-70" style={{ color: "var(--muted)" }}>×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(["youtube", "pdf", "note"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ background: tab === t ? "var(--accent)" : "var(--background)", color: tab === t ? "#fff" : "var(--muted)", border: "1px solid var(--border)" }}
            >
              {t === "youtube" ? "YouTube" : t === "pdf" ? "PDF" : "Note"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--muted)" }}>Title</label>
            <input
              value={title ?? ""}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Attention Is All You Need"
              className="w-full text-sm px-3 py-2 rounded border outline-none"
              style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
          </div>

          {/* Space selector */}
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--muted)" }}>Space</label>
            {creatingSpace ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newSpaceName ?? ""}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setCreatingSpace(false); setNewSpaceName(""); } }}
                  placeholder="New space name"
                  className="flex-1 text-sm px-3 py-2 rounded border outline-none"
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
                <button
                  type="button"
                  onClick={() => { setCreatingSpace(false); setNewSpaceName(""); }}
                  className="text-xs px-2.5 rounded type-mono hover:opacity-70"
                  style={{ color: "var(--muted)", background: "var(--background)", border: "1px solid var(--border)" }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={chosenSpaceId ?? ""}
                  onChange={(e) => setChosenSpaceId(e.target.value)}
                  className="flex-1 text-sm px-3 py-2 rounded border outline-none"
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                  <option value="">No space</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingSpace(true)}
                  className="text-xs px-2.5 rounded type-mono transition-opacity hover:opacity-70"
                  style={{ color: "var(--accent)", background: "var(--accent-light)", border: "1px solid var(--border)" }}
                  title="Create new space"
                >
                  + New
                </button>
              </div>
            )}
          </div>

          {tab === "note" ? (
            <div key="note-hint" className="rounded-lg px-4 py-3" style={{ background: "var(--active-row)", border: "1px solid var(--border)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                A note is a freeform markdown document — write anything, reference chat threads with <span className="type-mono" style={{ color: "var(--accent)" }}>@</span>, embed images, and link across your spaces.
              </p>
            </div>
          ) : tab === "youtube" ? (
            <div key="yt-input-block">
              <label className="text-xs mb-1 block" style={{ color: "var(--muted)" }}>YouTube URL</label>
              <input
                key="yt-input"
                value={youtubeUrl ?? ""}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full text-sm px-3 py-2 rounded border outline-none"
                style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
              />
            </div>
          ) : (
            <div key="pdf-input-block">
              <label className="text-xs mb-1 block" style={{ color: "var(--muted)" }}>PDF File</label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && f.type === "application/pdf") {
                    setFile(f);
                    if (!title.trim()) setTitle(f.name.replace(/\.pdf$/i, ""));
                  } else if (f) {
                    setError("Please drop a PDF file");
                  }
                }}
                className="w-full rounded-lg flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
                style={{
                  padding: "1.75rem 1rem",
                  border: `1.5px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                  background: dragOver ? "var(--accent-light)" : "var(--background)",
                  color: "var(--text-secondary)",
                }}
              >
                {file ? (
                  <>
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: "var(--accent)" }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <p className="text-sm" style={{ color: "var(--foreground)" }}>{file.name}</p>
                    <p className="type-mono" style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB · click to replace
                    </p>
                  </>
                ) : (
                  <>
                    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ color: "var(--muted)" }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                    <p className="text-sm">Drop a PDF here</p>
                    <p className="type-mono" style={{ fontSize: "0.65rem", color: "var(--muted)" }}>or click to browse</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                key="pdf-input"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title.trim()) setTitle(f.name.replace(/\.pdf$/i, ""));
                  e.target.value = "";
                }}
              />
            </div>
          )}


          {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-2 rounded text-sm font-medium mt-1 transition-opacity disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "Adding…" : "Add Source"}
          </button>
        </div>
      </div>
    </div>
  );
}
