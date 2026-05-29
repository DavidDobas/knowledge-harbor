"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { ResizableImage } from "@/components/source/ResizableImage";
import { ThreadRef } from "@/components/source/ThreadRef";
import { SourceRef } from "@/components/source/SourceRef";
import { formatTime } from "@/lib/utils";

/**
 * Extract TeX source from a KaTeX-rendered HTML element.
 *
 * We rely on the `data-latex` attribute that ChatMarkdown stamps onto every
 * `.katex` span after render (see ChatMarkdown.tsx).  Chrome strips the MathML
 * subtree (including the original <annotation> element) from clipboard HTML,
 * but plain HTML data-* attributes are preserved.
 */
function extractLatexFromKatex(el: Element): string | null {
  return (el as HTMLElement).dataset.latex?.trim() ?? null;
}

/**
 * Convert KaTeX-rendered HTML in a clipboard fragment to Tiptap math node HTML
 * so that pasted math is recognised by the Mathematics extension.
 *
 * - `.katex-display` wrappers → <div data-type="block-math" data-latex="…">
 * - plain `.katex` spans (inline) → <span data-type="inline-math" data-latex="…">
 */
function convertKatexNodes(root: Element): void {
  // Block math first (contains inline .katex — process outer first to avoid double-processing)
  root.querySelectorAll(".katex-display").forEach((display) => {
    const latex = extractLatexFromKatex(display);
    if (latex == null) return;
    const replacement = document.createElement("div");
    replacement.setAttribute("data-type", "block-math");
    replacement.setAttribute("data-latex", latex);
    display.replaceWith(replacement);
  });
  // Remaining inline .katex spans
  root.querySelectorAll(".katex").forEach((span) => {
    const latex = extractLatexFromKatex(span);
    if (latex == null) return;
    const replacement = document.createElement("span");
    replacement.setAttribute("data-type", "inline-math");
    replacement.setAttribute("data-latex", latex);
    span.replaceWith(replacement);
  });
}

export interface NotesViewHandle {
  insertCitation: (offset: number) => void;
}

interface MentionItem {
  kind: "thread" | "source";
  id: string;
  title: string;
  subtitle: string; // source title (for threads) or type label (for sources)
  sourceType: string; // icon hint: "youtube" | "pdf" | "note" | ""
}

interface MentionState {
  query: string;
  from: number;       // doc position of the "@"
  to: number;         // current cursor position
  caretTop: number;    // viewport y of the caret top
  caretBottom: number; // viewport y of the caret bottom
  left: number;
}

interface Props {
  content: string;
  onChange: (html: string) => void;
  saving: boolean;
  saveError?: string | null;
  onSeekTo: (ms: number) => void;
  onSwitchToTranscript: () => void;
  onOpenThread: (questionId: string) => void;
  onOpenSource?: (sourceId: string) => void;
}

function BubbleBtn({
  onClick, active, label, title, className: cls,
}: { onClick: () => void; active: boolean; label: string; title: string; className?: string }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`type-mono w-6 h-6 flex items-center justify-center rounded text-xs ${cls ?? ""}`}
      style={{
        color: active ? "#fff" : "rgba(255,255,255,0.65)",
        background: active ? "rgba(255,255,255,0.18)" : "transparent",
      }}
    >
      {label}
    </button>
  );
}

const NotesView = forwardRef<NotesViewHandle, Props>(function NotesView(
  { content, onChange, saving, saveError, onSeekTo, onSwitchToTranscript, onOpenThread, onOpenSource },
  ref
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bubbleStyle, setBubbleStyle] = useState<{ top: number; left: number } | null>(null);

  // @-mention state
  const [allChats, setAllChats] = useState<MentionItem[]>([]);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/questions").then((r) => r.json()),
      fetch("/api/sources").then((r) => r.json()),
    ])
      .then(([threads, srcs]) => {
        const threadItems: MentionItem[] = Array.isArray(threads)
          ? threads.map((t: { id: string; title: string; sourceTitle?: string; sourceType?: string }) => ({
              kind: "thread" as const,
              id: t.id,
              title: t.title,
              subtitle: t.sourceTitle ?? "",
              sourceType: t.sourceType ?? "",
            }))
          : [];
        const sourceItems: MentionItem[] = Array.isArray(srcs)
          ? srcs.map((s: { id: string; title: string; type: string }) => ({
              kind: "source" as const,
              id: s.id,
              title: s.title,
              subtitle: s.type === "youtube" ? "YouTube" : s.type === "note" ? "Note" : "PDF",
              sourceType: s.type,
            }))
          : [];
        setAllChats([...threadItems, ...sourceItems]);
      })
      .catch(() => {});
  }, []);

  const filteredChats = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const list = q
      ? allChats.filter((c) => c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q))
      : allChats;
    return list.slice(0, 8);
  }, [mention, allChats]);

  // Detect an active "@query" immediately before the cursor.
  function detectMention(ed: Editor) {
    try {
      const { selection } = ed.state;
      const { $from, empty } = selection;
      if (!empty) { setMention(null); return; }
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
      const match = /(?:^|\s)@([^\s@]*)$/.exec(textBefore);
      if (!match) { setMention(null); return; }
      const query = match[1];
      const atPos = $from.pos - query.length - 1; // position of "@"
      const coords = ed.view.coordsAtPos(atPos);
      setMention({ query, from: atPos, to: $from.pos, caretTop: coords.top, caretBottom: coords.bottom, left: coords.left });
      setMentionIndex(0);
    } catch {
      setMention(null);
    }
  }

  function selectMention(item: MentionItem) {
    if (!editor || !mention) return;
    const label = item.title.length > 40 ? item.title.slice(0, 40) + "…" : item.title;
    const nodeContent =
      item.kind === "source"
        ? { type: "sourceRef", attrs: { sourceId: item.id, label } }
        : { type: "threadRef", attrs: { questionId: item.id, label } };
    editor
      .chain()
      .focus()
      .deleteRange({ from: mention.from, to: mention.to })
      .insertContent([nodeContent, { type: "text", text: " " }])
      .run();
    setMention(null);
  }

  const editor = useEditor({
    extensions: [
      // Tiptap v3 StarterKit bundles Link — disable it here so our explicit Link
      // (with openOnClick: false) is the only one and there's no duplicate-extension conflict.
      StarterKit.configure({ link: false }),
      // allowBase64 is essential: without it, Tiptap's parse rule is
      // `img[src]:not([src^="data:"])`, which silently drops inline base64 images
      // when loading saved notes — they'd insert fine but vanish on refresh.
      ResizableImage.configure({ inline: false, allowBase64: true }),
      ThreadRef,
      SourceRef,
      Link.configure({ openOnClick: false }),
      Mathematics,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder:
          "Start writing… Type # for heading, @ to reference a chat, ref → on transcript chunks for timestamps.",
      }),
    ],
    content,
    onUpdate: ({ editor }) => { onChange(editor.getHTML()); detectMention(editor); },
    editorProps: {
      attributes: { class: "notes-prosemirror" },
      handlePaste: (view, event) => {
        const data = event.clipboardData;
        if (!data) return false;

        // 1. Image file paste (takes priority)
        const items = data.items;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === "file" && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              handleImageFile(file);
              event.preventDefault();
              return true;
            }
          }
        }

        // 2. HTML paste — convert KaTeX spans to Tiptap math nodes before Tiptap processes it
        const html = data.getData("text/html");
        if (html) {
          const hasKatex = html.includes("katex");
          if (hasKatex) {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = html;
            convertKatexNodes(wrapper);
            const cleaned = wrapper.innerHTML;
            // Re-inject as HTML paste so Tiptap can parse the converted nodes
            view.pasteHTML(cleaned);
            event.preventDefault();
            return true;
          }
        }

        return false;
      },
    },
    onSelectionUpdate: ({ editor }) => {
      detectMention(editor);
      const { empty, from, to } = editor.state.selection;
      if (empty || from === to) { setBubbleStyle(null); return; }
      const domSel = window.getSelection();
      if (!domSel || domSel.rangeCount === 0) { setBubbleStyle(null); return; }
      const range = domSel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const editorDom = editor.view.dom as HTMLElement;
      const editorRect = editorDom.getBoundingClientRect();
      setBubbleStyle({
        top: rect.top - editorRect.top - 44,
        left: Math.max(0, rect.left + rect.width / 2 - editorRect.left - 100),
      });
    },
    onBlur: () => setBubbleStyle(null),
  });

  // Expose insertCitation
  useImperativeHandle(ref, () => ({
    insertCitation(offset: number) {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent(`<a href="chunk://${offset}">⏱ ${formatTime(offset)}</a>&nbsp;`)
        .run();
    },
  }));

  // Handle chunk:// and thread:// link clicks inside the editor
  useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      // Thread reference chip
      const threadRef = target.closest?.("[data-thread-ref]");
      if (threadRef) {
        const qid = threadRef.getAttribute("data-question-id");
        if (qid) { e.preventDefault(); onOpenThread(qid); }
        return;
      }
      // Source reference chip
      const sourceRef = target.closest?.("[data-source-ref]");
      if (sourceRef) {
        const sid = sourceRef.getAttribute("data-source-id");
        if (sid) { e.preventDefault(); onOpenSource?.(sid); }
        return;
      }
      const a = target.closest("a");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("chunk://")) {
        e.preventDefault();
        onSeekTo(parseInt(href.replace("chunk://", ""), 10));
        onSwitchToTranscript();
      } else if (href.startsWith("thread://")) {
        // Legacy links from before the threadRef node existed.
        e.preventDefault();
        onOpenThread(href.replace("thread://", ""));
      }
    };
    dom.addEventListener("click", handler);
    return () => dom.removeEventListener("click", handler);
  }, [editor, onSeekTo, onSwitchToTranscript, onOpenThread]);

  // Keyboard navigation for the @-mention dropdown. Capture-phase so it runs before
  // ProseMirror's own key handling.
  useEffect(() => {
    if (!mention) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault(); e.stopPropagation();
        setMentionIndex((i) => Math.min(i + 1, Math.max(0, filteredChats.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        if (filteredChats[mentionIndex]) {
          e.preventDefault(); e.stopPropagation();
          selectMention(filteredChats[mentionIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        setMention(null);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [mention, filteredChats, mentionIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compress an image down to a max edge length + JPEG quality so the resulting base64
  // data URL stays small enough to fit comfortably in the notes autosave body
  // (Vercel API routes cap request bodies at ~4.5 MB).
  function compressImage(file: File, maxEdge = 1400, quality = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas unavailable")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        // Prefer JPEG for size; keep PNG only for clearly transparent screenshots.
        const mime = file.type === "image/png" && file.size < 200_000 ? "image/png" : "image/jpeg";
        const dataUrl = canvas.toDataURL(mime, quality);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image decode failed")); };
      img.src = url;
    });
  }

  async function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    try {
      const dataUrl = await compressImage(file);
      editor?.chain().focus().setImage({ src: dataUrl }).run();
    } catch (err) {
      console.error("[notes] image processing failed", err);
      alert("Could not add image — please try a different file.");
    }
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
      {/* Bubble menu (appears on text selection) */}
      {editor && bubbleStyle && (
        <div
          className="absolute z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-lg shadow-xl pointer-events-auto"
          style={{
            background: "#1A1917",
            border: "1px solid rgba(255,255,255,0.1)",
            top: bubbleStyle.top,
            left: bubbleStyle.left,
          }}
        >
          <BubbleBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} label="B" title="Bold" className="font-bold" />
          <BubbleBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} label="I" title="Italic" className="italic" />
          <BubbleBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} label="S" title="Strikethrough" className="line-through" />
          <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.15)", margin: "0 3px" }} />
          <BubbleBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} label="H1" title="Heading 1" />
          <BubbleBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} label="H2" title="Heading 2" />
          <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.15)", margin: "0 3px" }} />
          <BubbleBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} label="•" title="Bullet list" />
          <BubbleBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} label="1." title="Numbered list" />
          <BubbleBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} label="❝" title="Quote" />
        </div>
      )}

      {/* @-mention dropdown — portaled to body so a transformed ancestor (the sliding
          transcript/notes panel uses translateX) doesn't break its position:fixed placement.
          Flips above the caret when there isn't enough room below. */}
      {mention && filteredChats.length > 0 && createPortal(
        (() => {
          const ITEM_H = 46, HEADER_H = 28, GAP = 6;
          const estHeight = HEADER_H + Math.min(filteredChats.length, 8) * ITEM_H;
          const spaceBelow = window.innerHeight - mention.caretBottom;
          const placeAbove = spaceBelow < estHeight + GAP + 8;
          const top = placeAbove
            ? Math.max(8, mention.caretTop - estHeight - GAP)
            : mention.caretBottom + GAP;
          return (
        <div
          className="fixed z-[100] rounded-lg shadow-xl overflow-hidden"
          style={{
            top,
            left: mention.left,
            minWidth: 240,
            maxWidth: 340,
            maxHeight: "60vh",
            overflowY: "auto",
            background: "var(--panel-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="type-mono" style={{ fontSize: "0.58rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
              Reference a thread or source
            </span>
          </div>
          {filteredChats.map((c, i) => {
            const icon = c.kind === "source"
              ? (c.sourceType === "youtube" ? "▶" : c.sourceType === "note" ? "✏" : "📄")
              : (c.sourceType === "youtube" ? "▶" : c.sourceType === "note" ? "✏" : "📄");
            return (
              <button
                key={`${c.kind}-${c.id}`}
                onMouseDown={(e) => { e.preventDefault(); selectMention(c); }}
                onMouseEnter={() => setMentionIndex(i)}
                className="w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-colors"
                style={{ background: i === mentionIndex ? "var(--active-row)" : "transparent" }}
              >
                <span className="text-xs leading-snug" style={{ color: "var(--foreground)", wordBreak: "break-word" }}>
                  {c.title}
                </span>
                <span className="type-mono flex items-center gap-1" style={{ fontSize: "0.58rem", color: "var(--muted)", letterSpacing: "0.02em" }}>
                  <span>{icon}</span>
                  <span>{c.subtitle}</span>
                  {c.kind === "source" && (
                    <span style={{ color: "#5A7A56", marginLeft: 2 }}>source</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
          );
        })(),
        document.body
      )}

      {/* Slim toolbar for image + saving indicator */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-1.5 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Insert image (or drag & drop)"
          className="flex items-center gap-1 type-mono text-xs transition-opacity hover:opacity-60"
          style={{ color: "var(--muted)" }}
        >
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          img
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImageFile(f);
            e.target.value = "";
          }}
        />
        {saveError ? (
          <span className="type-mono" style={{ fontSize: "0.58rem", color: "#C0392B" }} title={saveError}>
            ⚠ {saveError}
          </span>
        ) : saving ? (
          <span className="type-mono" style={{ fontSize: "0.58rem", color: "var(--muted)" }}>
            saving…
          </span>
        ) : null}
      </div>

      {/* Editor canvas */}
      <div
        className="flex-1 overflow-y-auto min-h-0"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f?.type.startsWith("image/")) handleImageFile(f);
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

export default NotesView;
