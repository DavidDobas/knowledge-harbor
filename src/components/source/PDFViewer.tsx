"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { configurePdfWorker } from "@/lib/pdfWorker";

configurePdfWorker();

// ── Highlight geometry — normalized to its page wrapper (x, y, w, h ∈ [0, 1]).
export interface PdfRect { x: number; y: number; w: number; h: number; }

export interface PdfHighlight {
  kind: "question" | "standalone";
  id: string;            // questionId for question kind, highlight id for standalone
  text: string;
  page: number;
  rects: PdfRect[];
  isActive?: boolean;    // only meaningful for question kind
  body?: string;         // if set, render as a comment in the sidebar too
}

interface SelectionBox {
  text: string;
  page: number;
  rects: PdfRect[];
  // page-relative anchor for the floating toolbar (so it scrolls with the content)
  anchorXPct: number;  // center x of the selection's top line
  anchorTopPct: number; // top y of the selection's top line
}

interface Props {
  pdfUrl: string;
  highlights: PdfHighlight[];
  targetPage?: number | null;
  /** Override the persisted zoom on first render (e.g. pass window.innerWidth for mobile fit-to-width). */
  initialPageWidth?: number;
  // text + anchor page + rects on that anchor page (selection toolbar's "Ask")
  onTextSelect: (text: string, page: number, rects: PdfRect[]) => void;
  onClearSelection: () => void;
  onHighlightClick: (questionId: string) => void;
  // For multi-page selections we emit one entry per page (option b). `body` set = comment.
  onHighlight: (entries: { text: string; page: number; rects: PdfRect[]; body?: string }[]) => void;
  onDeleteHighlight: (id: string) => void;
  onEditComment: (id: string, body: string) => void;
}

const PDF_ZOOM_KEY = "kh.pdf.zoom";
const MIN_WIDTH = 240;
const MAX_WIDTH = 1400;
const DEFAULT_WIDTH = 540;

function readPersistedPageWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(PDF_ZOOM_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (!isNaN(n)) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
  } catch { /* ignore */ }
  return DEFAULT_WIDTH;
}

// Nearest scrollable ancestor (the viewer's scroll container in CenterPane).
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY + style.overflowX + style.overflow)) return node;
    node = node.parentElement;
  }
  return null;
}

// Merge overlapping/duplicate rects on the same line into a single rect. getClientRects()
// often returns multiple overlapping rects on full-line selections (one per text item or
// inline boundary), which would stack with translucent fills and visibly darken those rows.
function dedupeRects(rects: PdfRect[]): PdfRect[] {
  if (rects.length <= 1) return rects;
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: PdfRect[] = [];
  const yEps = 0.004;   // ~0.4% of page height — treat as same line
  const hEps = 0.006;   // small variations in line-rect heights
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.y - r.y) < yEps &&
      Math.abs(last.h - r.h) < hEps
    ) {
      // Same line — extend the horizontal extent.
      const left = Math.min(last.x, r.x);
      const right = Math.max(last.x + last.w, r.x + r.w);
      last.x = left;
      last.w = right - left;
      // Keep taller of the two heights, anchored to the topmost y.
      last.y = Math.min(last.y, r.y);
      last.h = Math.max(last.h, r.h);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

// Convert each DOMRect from a Range.getClientRects() into normalized page-relative rects,
// grouped by page. Each rect's center decides which page it belongs to.
function rectsByPage(
  clientRects: DOMRect[],
  pageEls: HTMLElement[],
): Map<number, PdfRect[]> {
  const out = new Map<number, PdfRect[]>();
  const pageRects = pageEls.map((el) => ({
    page: parseInt(el.dataset.pdfPage ?? "0", 10),
    rect: el.getBoundingClientRect(),
  }));
  for (const r of clientRects) {
    if (r.width < 1 || r.height < 1) continue; // skip empty rects
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = pageRects.find(
      (p) => cx >= p.rect.left && cx <= p.rect.right && cy >= p.rect.top && cy <= p.rect.bottom,
    );
    if (!hit) continue;
    const norm: PdfRect = {
      x: (r.left - hit.rect.left) / hit.rect.width,
      y: (r.top - hit.rect.top) / hit.rect.height,
      w: r.width / hit.rect.width,
      h: r.height / hit.rect.height,
    };
    const arr = out.get(hit.page) ?? [];
    arr.push(norm);
    out.set(hit.page, arr);
  }
  // Dedupe overlapping rects per page.
  const cleaned = new Map<number, PdfRect[]>();
  out.forEach((rects, page) => cleaned.set(page, dedupeRects(rects)));
  return cleaned;
}

// ── Per-page wrapper that keeps the previous rendered canvas visible as an overlay while
//    a re-render is in flight, killing the white flash.
//
//    Critical: the wrapper has EXPLICIT width and height (derived from the width prop and
//    the page's known aspect ratio). Otherwise during a width change react-pdf briefly
//    clears the canvas dimensions, the wrapper momentarily collapses to 0×0, and the
//    snapshot overlay (sized to 100% of the wrapper) becomes invisible — that's the flash.
function StablePage({
  pageNumber, width, onAspect,
}: {
  pageNumber: number;
  width: number;
  onAspect?: (aspect: number) => void; // height / width ratio for the rendered page
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [renderedWidth, setRenderedWidth] = useState(width);
  const isStale = renderedWidth !== width;

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        width: `${width}px`,
        // Hold the wrapper at the known aspect ratio so it never collapses during re-render.
        height: aspect != null ? `${Math.round(width * aspect)}px` : undefined,
        overflow: "hidden",
        boxShadow: "0 1px 8px rgba(0,0,0,0.1)",
        borderRadius: 2,
        background: "#fff",
      }}
    >
      <Page
        pageNumber={pageNumber}
        width={width}
        renderTextLayer
        renderAnnotationLayer
        onRenderSuccess={() => {
          const canvas = wrapperRef.current?.querySelector("canvas.react-pdf__Page__canvas") as HTMLCanvasElement | null;
          if (canvas && canvas.width > 0 && canvas.height > 0) {
            try { setSnapshot(canvas.toDataURL("image/jpeg", 0.75)); } catch { /* tainted */ }
            const a = canvas.height / canvas.width;
            setAspect(a);
            onAspect?.(a);
          }
          setRenderedWidth(width);
        }}
      />
      {isStale && snapshot && (
        <img
          src={snapshot}
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            background: "#fff",
            userSelect: "none",
          }}
        />
      )}
    </div>
  );
}

// ── Geometry-based highlight layer: percentage-positioned divs sitting above the canvas
//    but below the text layer (so text selection still works). pointer-events: none —
//    interaction is handled via container-level event delegation.
//
//    No mix-blend-mode: it makes the highlight color depend on what's under each row
//    (text density, partial-line lengths), producing visibly inconsistent shades across
//    lines and on overlapping rects.
function HighlightLayer({ highlights }: { highlights: PdfHighlight[] }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
      }}
    >
      {highlights.flatMap((h) =>
        h.rects.map((r, i) => {
          // Commented highlights use a distinct blue-violet tint so they read differently
          // from plain yellow highlights and blue question anchors.
          const bg =
            h.kind === "question"
              ? (h.isActive ? "rgba(91,108,143,0.36)" : "rgba(91,108,143,0.20)")
              : h.body
                ? "rgba(123,112,208,0.30)"
                : "rgba(245,194,66,0.38)";
          return (
            <div
              key={`${h.id}-${i}`}
              data-hl-id={h.id}
              data-hl-kind={h.kind}
              style={{
                position: "absolute",
                left: `${r.x * 100}%`,
                top: `${r.y * 100}%`,
                width: `${r.w * 100}%`,
                height: `${r.h * 100}%`,
                background: bg,
                borderRadius: 1,
              }}
            />
          );
        }),
      )}
    </div>
  );
}

// Returns the top Y (normalized) of a highlight's first line — used to vertically anchor
// its comment card / the × button.
function highlightTopY(h: { rects: PdfRect[] }): number {
  return h.rects.reduce((min, r) => Math.min(min, r.y), Infinity);
}

interface PendingComment {
  text: string;
  page: number;
  rects: PdfRect[];
  topY: number;
}

// ── Comments rail: cards to the right of the page, vertically aligned to their highlight.
function CommentsColumn({
  page, comments, pending, editingId,
  onStartEdit, onSubmitEdit, onCancelEdit, onSubmitPending, onCancelPending, onDelete,
}: {
  page: number;
  comments: PdfHighlight[];
  pending: PendingComment | null;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onSubmitEdit: (id: string, body: string) => void;
  onCancelEdit: () => void;
  onSubmitPending: (body: string) => void;
  onCancelPending: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: "100%",
        top: 0,
        marginLeft: 18,
        width: 230,
        height: "100%",
        pointerEvents: "none", // cards re-enable it themselves
      }}
    >
      {comments.map((c) => (
        <CommentCard
          key={c.id}
          topPct={highlightTopY(c) * 100}
          body={c.body ?? ""}
          editing={editingId === c.id}
          onStartEdit={() => onStartEdit(c.id)}
          onSubmitEdit={(body) => onSubmitEdit(c.id, body)}
          onCancelEdit={onCancelEdit}
          onDelete={() => onDelete(c.id)}
        />
      ))}
      {pending && pending.page === page && (
        <CommentCard
          topPct={pending.topY * 100}
          body=""
          editing
          autoFocus
          onSubmitEdit={onSubmitPending}
          onCancelEdit={onCancelPending}
        />
      )}
    </div>
  );
}

function CommentCard({
  topPct, body, editing, autoFocus, onStartEdit, onSubmitEdit, onCancelEdit, onDelete,
}: {
  topPct: number;
  body: string;
  editing: boolean;
  autoFocus?: boolean;
  onStartEdit?: () => void;
  onSubmitEdit: (body: string) => void;
  onCancelEdit: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(body);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing && autoFocus) taRef.current?.focus(); }, [editing, autoFocus]);

  function beginEdit() {
    setDraft(body);
    onStartEdit?.();
  }

  return (
    <div
      className="group/cmt"
      style={{
        position: "absolute",
        top: `${topPct}%`,
        left: 0,
        right: 0,
        pointerEvents: "auto",
        background: "var(--panel-bg)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid rgba(123,112,208,0.7)",
        borderRadius: 8,
        padding: "8px 10px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
        fontSize: "0.78rem",
        color: "var(--foreground)",
        lineHeight: 1.45,
      }}
    >
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (draft.trim()) onSubmitEdit(draft.trim()); }
              if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
            }}
            placeholder="Write a comment…"
            rows={3}
            className="w-full text-sm rounded outline-none resize-none"
            style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "6px 8px", fontSize: "0.78rem" }}
          />
          <div className="flex items-center justify-end gap-1.5">
            <button onClick={onCancelEdit} className="type-mono text-xs px-2 py-0.5 rounded hover:opacity-70" style={{ color: "var(--muted)" }}>Cancel</button>
            <button
              onClick={() => { if (draft.trim()) onSubmitEdit(draft.trim()); }}
              disabled={!draft.trim()}
              className="type-mono text-xs px-2.5 py-0.5 rounded disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{body}</p>
          <div className="flex items-center gap-2 opacity-0 group-hover/cmt:opacity-100 transition-opacity">
            <button onClick={beginEdit} className="type-mono" style={{ fontSize: "0.62rem", color: "var(--accent)" }}>edit</button>
            <button onClick={onDelete} className="type-mono" style={{ fontSize: "0.62rem", color: "#C0392B" }}>delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PDFViewer({
  pdfUrl, highlights, targetPage, initialPageWidth,
  onTextSelect, onClearSelection, onHighlightClick, onHighlight, onDeleteHighlight, onEditComment,
}: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [selBox, setSelBox] = useState<SelectionBox | null>(null);
  const [pageWidth, setPageWidth] = useState<number>(() =>
    initialPageWidth != null
      ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, initialPageWidth))
      : readPersistedPageWidth()
  );
  const [pendingComment, setPendingComment] = useState<PendingComment | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const wheelFactorRef = useRef(1);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  // Zoom anchor: the cursor's viewport position + the page-normalized point under it.
  // Captured at wheel time, used after re-layout to scroll that exact point back under the
  // cursor. Using the real (post-zoom) page rect handles the center-aligned page layout.
  const zoomAnchorRef = useRef<{ cx: number; cy: number; page: number; nx: number; ny: number } | null>(null);
  const prevPageWidthRef = useRef(pageWidth);

  // Hover state for the standalone-highlight delete button. We just track which highlight
  // is hovered; the × is rendered inside the page wrapper at %-based coordinates, so it
  // scrolls naturally with the content.
  const [hoveredHighlightId, setHoveredHighlightId] = useState<string | null>(null);

  // Stack of scroll positions captured right before the user clicked an internal PDF link
  // (e.g. a citation). Each "Jump back" pops the most recent entry — supports chains of
  // jumps (click [24], then click [12] inside the reference, etc.).
  const [jumpHistory, setJumpHistory] = useState<number[]>([]);

  // The scroll ancestor is owned by CenterPane (the `overflow-y-auto` wrapper around the
  // PDF viewer). We walk up to find it on demand so PDFViewer stays self-contained.
  function findScrollContainer(): HTMLElement | null {
    let el: HTMLElement | null = containerRef.current?.parentElement ?? null;
    while (el) {
      const oy = window.getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") return el;
      el = el.parentElement;
    }
    return null;
  }

  function handleJumpBack() {
    const scroller = findScrollContainer();
    if (!scroller || jumpHistory.length === 0) return;
    const top = jumpHistory[jumpHistory.length - 1];
    setJumpHistory((prev) => prev.slice(0, -1));
    scroller.scrollTo({ top, behavior: "smooth" });
  }

  // Track potential clicks vs drags on the highlight layer.
  const downPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem(PDF_ZOOM_KEY, String(pageWidth)); } catch { /* ignore */ }
  }, [pageWidth]);

  // Ctrl/Cmd + wheel zoom — throttled commits. Each commit triggers Page re-render covered
  // by StablePage's snapshot overlay; highlights stay visible across the transition because
  // they live in their own layer with percentage-based positioning.
  // Capture the page-normalized point under a viewport coordinate, for cursor-anchored zoom.
  function captureZoomAnchor(clientX: number, clientY: number) {
    const pageEls = containerRef.current
      ? Array.from(containerRef.current.querySelectorAll<HTMLElement>("[data-pdf-page]"))
      : [];
    if (pageEls.length === 0) { zoomAnchorRef.current = null; return; }
    // Prefer the page directly under the cursor; otherwise the vertically-nearest page.
    let chosen: { page: number; r: DOMRect } | null = null;
    let nearest: { page: number; r: DOMRect; dist: number } | null = null;
    for (const el of pageEls) {
      const r = el.getBoundingClientRect();
      const page = parseInt(el.dataset.pdfPage ?? "0", 10);
      if (clientY >= r.top && clientY <= r.bottom) {
        chosen = { page, r };
        if (clientX >= r.left && clientX <= r.right) break;
      }
      const dist = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
      if (!nearest || dist < nearest.dist) nearest = { page, r, dist };
    }
    const pick = chosen ?? (nearest ? { page: nearest.page, r: nearest.r } : null);
    if (!pick) { zoomAnchorRef.current = null; return; }
    zoomAnchorRef.current = {
      cx: clientX, cy: clientY,
      page: pick.page,
      nx: (clientX - pick.r.left) / pick.r.width,
      ny: (clientY - pick.r.top) / pick.r.height,
    };
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      // ~20% per tick at the top end (was 12%) → noticeably faster zoom per scroll motion.
      const magnitude = Math.min(0.20, Math.abs(e.deltaY) / 350);
      wheelFactorRef.current *= 1 + direction * magnitude;
      captureZoomAnchor(e.clientX, e.clientY);
      if (!wheelTimerRef.current) {
        // ~33 commits/sec (was ~18). The snapshot overlay stretches to the new wrapper size
        // on each commit, so more frequent commits = visibly more continuous zoom.
        wheelTimerRef.current = setTimeout(() => {
          const f = wheelFactorRef.current;
          wheelFactorRef.current = 1;
          wheelTimerRef.current = null;
          setPageWidth((w) => Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w * f))));
        }, 30);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the anchored content point under the cursor when zoom changes. Runs before paint.
  useLayoutEffect(() => {
    const prev = prevPageWidthRef.current;
    prevPageWidthRef.current = pageWidth;
    if (prev === pageWidth) return;
    const anchor = zoomAnchorRef.current;
    const scroller = getScrollParent(containerRef.current);
    if (!anchor || !scroller || !containerRef.current) return;
    const pageEl = containerRef.current.querySelector<HTMLElement>(`[data-pdf-page="${anchor.page}"]`);
    if (!pageEl) return;
    const r = pageEl.getBoundingClientRect(); // already reflects the new page size
    const targetX = r.left + anchor.nx * r.width;
    const targetY = r.top + anchor.ny * r.height;
    scroller.scrollLeft += targetX - anchor.cx;
    scroller.scrollTop += targetY - anchor.cy;
  }, [pageWidth]);

  useEffect(() => {
    if (targetPage != null && pageRefs.current[targetPage - 1]) {
      pageRefs.current[targetPage - 1]!.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [targetPage]);

  // Buttons anchor zoom to the center of the visible viewport.
  function anchorAtViewportCenter() {
    const scroller = getScrollParent(containerRef.current);
    if (!scroller) { zoomAnchorRef.current = null; return; }
    const rect = scroller.getBoundingClientRect();
    captureZoomAnchor(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  const zoomIn = () => { anchorAtViewportCenter(); setPageWidth((w) => Math.min(MAX_WIDTH, Math.round(w * 1.15))); };
  const zoomOut = () => { anchorAtViewportCenter(); setPageWidth((w) => Math.max(MIN_WIDTH, Math.round(w / 1.15))); };
  const zoomReset = () => { anchorAtViewportCenter(); setPageWidth(DEFAULT_WIDTH); };
  const zoomPct = Math.round((pageWidth / DEFAULT_WIDTH) * 100);

  // Index highlights by page for fast lookup.
  const highlightsByPage = useMemo(() => {
    const m = new Map<number, PdfHighlight[]>();
    for (const h of highlights) {
      if (!h.rects || h.rects.length === 0) continue; // skip legacy rect-less entries
      const arr = m.get(h.page) ?? [];
      arr.push(h);
      m.set(h.page, arr);
    }
    return m;
  }, [highlights]);

  // ── Selection capture ──
  function captureSelection(): { text: string; byPage: Map<number, PdfRect[]>; anchorPage: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    const range = sel.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects());
    if (clientRects.length === 0) return null;
    const pageEls = containerRef.current
      ? Array.from(containerRef.current.querySelectorAll<HTMLElement>("[data-pdf-page]"))
      : [];
    const byPage = rectsByPage(clientRects, pageEls);
    if (byPage.size === 0) return null;
    // Anchor page = the page the selection started on.
    let anchorPage = -1;
    const anchorNode = sel.anchorNode;
    if (anchorNode) {
      let el: Node | null = anchorNode;
      while (el) {
        if (el instanceof HTMLElement && el.dataset.pdfPage) {
          anchorPage = parseInt(el.dataset.pdfPage, 10);
          break;
        }
        el = el.parentNode;
      }
    }
    if (anchorPage < 0) anchorPage = byPage.keys().next().value as number;
    return { text, byPage, anchorPage };
  }

  function handleMouseUp() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!text || !sel?.rangeCount) {
      setSelBox(null);
      onClearSelection();
      return;
    }
    const cap = captureSelection();
    if (!cap) { setSelBox(null); onClearSelection(); return; }
    const rectsOnAnchor = cap.byPage.get(cap.anchorPage) ?? [];
    if (rectsOnAnchor.length === 0) { setSelBox(null); onClearSelection(); return; }
    // Anchor the toolbar above the selection's top line (page-relative so it scrolls).
    const topRect = rectsOnAnchor.reduce((top, r) => (r.y < top.y ? r : top), rectsOnAnchor[0]);
    setSelBox({
      text: cap.text,
      page: cap.anchorPage,
      rects: rectsOnAnchor,
      anchorXPct: (topRect.x + topRect.w / 2) * 100,
      anchorTopPct: topRect.y * 100,
    });
  }

  function handleAsk() {
    if (!selBox) return;
    onTextSelect(selBox.text, selBox.page, selBox.rects);
    setSelBox(null);
  }

  function handleHighlight() {
    const cap = captureSelection();
    if (!cap) { setSelBox(null); return; }
    // Option (b): emit one highlight entry per page the selection covers.
    const entries: { text: string; page: number; rects: PdfRect[] }[] = [];
    cap.byPage.forEach((rects, page) => entries.push({ text: cap.text, page, rects }));
    if (entries.length > 0) onHighlight(entries);
    setSelBox(null);
  }

  // Comment is anchored to a single page (the anchor page) — like Ask. Opens an inline
  // editor in the comments rail; the highlight + comment is saved on submit.
  function handleStartComment() {
    const cap = captureSelection();
    if (!cap) { setSelBox(null); return; }
    const rects = cap.byPage.get(cap.anchorPage) ?? [];
    if (rects.length === 0) { setSelBox(null); return; }
    const topY = rects.reduce((min, r) => Math.min(min, r.y), Infinity);
    setPendingComment({ text: cap.text, page: cap.anchorPage, rects, topY });
    setSelBox(null);
    window.getSelection()?.removeAllRanges();
  }

  function submitPendingComment(body: string) {
    if (!pendingComment) return;
    onHighlight([{ text: pendingComment.text, page: pendingComment.page, rects: pendingComment.rects, body }]);
    setPendingComment(null);
  }

  // ── Container-level interaction (replaces customTextRenderer event delegation) ──
  function isPointInRect(px: number, py: number, r: PdfRect): boolean {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  function hitTestHighlight(clientX: number, clientY: number): PdfHighlight | null {
    if (!containerRef.current) return null;
    const pageEls = Array.from(containerRef.current.querySelectorAll<HTMLElement>("[data-pdf-page]"));
    for (const pageEl of pageEls) {
      const page = parseInt(pageEl.dataset.pdfPage ?? "0", 10);
      const pr = pageEl.getBoundingClientRect();
      if (clientX < pr.left || clientX > pr.right || clientY < pr.top || clientY > pr.bottom) continue;
      const px = (clientX - pr.left) / pr.width;
      const py = (clientY - pr.top) / pr.height;
      const candidates = highlightsByPage.get(page) ?? [];
      // Prefer question highlights over standalone when overlapping (active question first).
      const sorted = [...candidates].sort((a, b) => {
        const score = (h: PdfHighlight) =>
          (h.kind === "question" ? 2 : 0) + (h.isActive ? 1 : 0);
        return score(b) - score(a);
      });
      for (const h of sorted) {
        if (h.rects.some((r) => isPointInRect(px, py, r))) return h;
      }
      return null;
    }
    return null;
  }

  function handleContainerMouseMove(e: React.MouseEvent) {
    const hit = hitTestHighlight(e.clientX, e.clientY);
    if (!hit || hit.kind !== "standalone") {
      if (hoveredHighlightId) setHoveredHighlightId(null);
      return;
    }
    if (hoveredHighlightId !== hit.id) setHoveredHighlightId(hit.id);
  }

  function handleContainerMouseLeave() {
    setHoveredHighlightId(null);
  }

  // Compute the % position of the "delete" button anchor (top-right of the highlight's
  // topmost-line rectangle). Returns null if the highlight isn't on this page.
  function deleteAnchorFor(highlight: PdfHighlight): { leftPct: number; topPct: number } | null {
    if (highlight.rects.length === 0) return null;
    let topY = Infinity;
    let rightX = -Infinity;
    for (const r of highlight.rects) {
      if (r.y < topY - 0.001) { topY = r.y; rightX = r.x + r.w; }
      else if (Math.abs(r.y - topY) < 0.003) {
        rightX = Math.max(rightX, r.x + r.w);
      }
    }
    return { leftPct: rightX * 100, topPct: topY * 100 };
  }

  function handleContainerMouseDown(e: React.MouseEvent) {
    downPosRef.current = { x: e.clientX, y: e.clientY };
  }

  function handleContainerMouseUp(e: React.MouseEvent) {
    const down = downPosRef.current;
    downPosRef.current = null;
    // Selection toolbar takes priority (selection just finished).
    handleMouseUp();
    // Detect a "click" (small movement). Skip if a text selection was made.
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (dx * dx + dy * dy > 9) return; // > 3px movement → drag, not click
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return; // text was selected
    const hit = hitTestHighlight(e.clientX, e.clientY);
    if (hit && hit.kind === "question") {
      onHighlightClick(hit.id);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseDown={handleContainerMouseDown}
      onMouseUp={handleContainerMouseUp}
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={handleContainerMouseLeave}
    >
      {/* Floating "Jump back" pill — visible after the user follows an internal PDF link.
          Position: fixed so it stays anchored to the viewport bottom regardless of which
          page the user has scrolled to. Style matches the transcript jump-back button. */}
      {jumpHistory.length > 0 && (
        <button
          onClick={handleJumpBack}
          className="type-mono flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-md"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            fontSize: "0.68rem",
            letterSpacing: "0.04em",
            background: "var(--foreground)",
            color: "var(--background)",
            border: "none",
            cursor: "pointer",
          }}
          title="Return to where you were before the last citation jump"
        >
          ← Jump back{jumpHistory.length > 1 ? ` (${jumpHistory.length})` : ""}
        </button>
      )}
      <Document
        file={pdfUrl}
        onLoadSuccess={({ numPages: n }) => {
          setNumPages(n);
          pageRefs.current = new Array(n).fill(null);
        }}
        // Internal PDF links (e.g. clicking "[24]" jumps to the reference list) — react-pdf
        // resolves the destination and gives us the target page index. Push the current
        // scroll position onto the jump-history stack so the user can hop back.
        onItemClick={({ pageNumber: target }) => {
          const scroller = findScrollContainer();
          if (scroller) setJumpHistory((prev) => [...prev, scroller.scrollTop]);
          const el = pageRefs.current[target - 1];
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        loading={<p className="text-xs py-10 text-center" style={{ color: "var(--muted)" }}>Loading PDF…</p>}
        error={<p className="text-xs py-10 text-center" style={{ color: "#f87171" }}>Failed to load PDF</p>}
      >
        {Array.from({ length: numPages }, (_, i) => {
          const pageNumber = i + 1;
          const pageHighlights = highlightsByPage.get(pageNumber) ?? [];
          // While a comment is being authored, render its selection as a temporary
          // overlay with the same blue-violet tint a saved comment-highlight uses. Without
          // this the native browser selection is gone (we cleared it in handleStartComment)
          // and the user loses sight of what they're commenting on — same bug pattern as
          // the old "ask" flow.
          const overlayHighlights: PdfHighlight[] =
            pendingComment && pendingComment.page === pageNumber
              ? [...pageHighlights, {
                  kind: "standalone",
                  id: "__pending_comment__",
                  text: pendingComment.text,
                  page: pendingComment.page,
                  rects: pendingComment.rects,
                  body: "pending",
                }]
              : pageHighlights;
          return (
            <div key={i} className="mb-4 flex justify-center">
              {/* IMPORTANT: data-pdf-page MUST be on the inner container that exactly wraps
                  the page area — that's what we use as the reference rect for normalizing
                  selection rectangles and rendering the percentage-positioned highlights.
                  Putting it on the outer flex-centered row would include the empty space on
                  either side and shift highlights horizontally. */}
              <div
                ref={(el) => { pageRefs.current[i] = el; }}
                data-pdf-page={pageNumber}
                style={{ position: "relative" }}
              >
                <StablePage pageNumber={pageNumber} width={pageWidth} />
                <HighlightLayer highlights={overlayHighlights} />
                {/* Per-page interactive overlay: × buttons for the currently hovered
                    standalone highlight. Lives INSIDE the page wrapper so it scrolls
                    with content (vs. the old position:fixed approach). */}
                {hoveredHighlightId && (() => {
                  const h = pageHighlights.find((x) => x.id === hoveredHighlightId && x.kind === "standalone");
                  if (!h) return null;
                  const anchor = deleteAnchorFor(h);
                  if (!anchor) return null;
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteHighlight(h.id);
                        setHoveredHighlightId(null);
                      }}
                      title="Remove highlight"
                      style={{
                        position: "absolute",
                        left: `${anchor.leftPct}%`,
                        top: `${anchor.topPct}%`,
                        transform: "translate(-50%, -50%)",
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        background: "#1A1917",
                        color: "#fff",
                        border: "1.5px solid #fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        zIndex: 5,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                      }}
                    >
                      <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  );
                })()}
                <CommentsColumn
                  page={pageNumber}
                  comments={pageHighlights.filter((h) => h.kind === "standalone" && h.body)}
                  pending={pendingComment}
                  editingId={editingCommentId}
                  onStartEdit={(id) => setEditingCommentId(id)}
                  onSubmitEdit={(id, body) => { onEditComment(id, body); setEditingCommentId(null); }}
                  onCancelEdit={() => setEditingCommentId(null)}
                  onSubmitPending={submitPendingComment}
                  onCancelPending={() => setPendingComment(null)}
                  onDelete={(id) => onDeleteHighlight(id)}
                />
                {/* Selection toolbar — anchored to the page (scrolls with content). */}
                {selBox && selBox.page === pageNumber && (
                  <div
                    onMouseDown={(e) => e.preventDefault()}
                    className="flex items-center gap-1 rounded-full shadow-lg"
                    style={{
                      position: "absolute",
                      left: `${selBox.anchorXPct}%`,
                      top: `${selBox.anchorTopPct}%`,
                      transform: "translate(-50%, calc(-100% - 8px))",
                      background: "#1A1917",
                      color: "#fff",
                      zIndex: 20,
                      padding: "4px 5px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <button onClick={handleHighlight} title="Save as highlight" className="type-mono text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 hover:opacity-80" style={{ letterSpacing: "0.03em" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(245,194,66,0.85)", display: "inline-block" }} />
                      Highlight
                    </button>
                    <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.18)" }} />
                    <button onClick={handleStartComment} title="Add a comment" className="type-mono text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 hover:opacity-80" style={{ letterSpacing: "0.03em" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(123,112,208,0.95)", display: "inline-block" }} />
                      Comment
                    </button>
                    <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.18)" }} />
                    <button onClick={handleAsk} title="Ask about this passage" className="type-mono text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 hover:opacity-80" style={{ letterSpacing: "0.03em" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(123,140,180,0.95)", display: "inline-block" }} />
                      Ask
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Document>

      {/* Zoom controls — sticky in the corner of the scrollable viewer */}
      <div
        className="flex items-center gap-0.5 rounded-full shadow-md"
        style={{
          position: "sticky",
          bottom: 12,
          marginLeft: "auto",
          width: "fit-content",
          padding: "4px 6px",
          background: "var(--panel-bg)",
          border: "1px solid var(--border)",
          zIndex: 10,
        }}
      >
        <button onClick={zoomOut} title="Zoom out" className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/5" style={{ color: "var(--text-secondary)" }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
        </button>
        <button onClick={zoomReset} title="Reset zoom" className="px-2 type-mono rounded hover:bg-black/5" style={{ fontSize: "0.65rem", color: "var(--muted)", minWidth: 40, textAlign: "center" }}>
          {zoomPct}%
        </button>
        <button onClick={zoomIn} title="Zoom in" className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/5" style={{ color: "var(--text-secondary)" }}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

    </div>
  );
}
