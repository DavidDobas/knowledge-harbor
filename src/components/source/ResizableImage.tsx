"use client";

import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useRef, useState } from "react";

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, width } = node.attrs as { src: string; alt?: string; width?: number | null };
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function startResize(e: React.MouseEvent, corner: "left" | "right") {
    e.preventDefault();
    e.stopPropagation();
    const img = wrapperRef.current?.querySelector("img");
    if (!img) return;
    const startX = e.clientX;
    const startWidth = img.getBoundingClientRect().width;
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      const delta = corner === "right" ? ev.clientX - startX : startX - ev.clientX;
      const next = Math.max(60, Math.round(startWidth + delta));
      updateAttributes({ width: next });
    };
    const onUp = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  }

  const showHandles = selected || dragging;

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className="relative inline-block"
      style={{ lineHeight: 0, maxWidth: "100%" }}
      data-drag-handle
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ""}
        style={{
          width: width ? `${width}px` : "auto",
          maxWidth: "100%",
          borderRadius: 8,
          display: "block",
          outline: showHandles ? "2px solid var(--accent)" : "none",
        }}
        draggable={false}
      />
      {showHandles && (
        <>
          <span
            onMouseDown={(e) => startResize(e, "left")}
            style={handleStyle("left")}
          />
          <span
            onMouseDown={(e) => startResize(e, "right")}
            style={handleStyle("right")}
          />
        </>
      )}
    </NodeViewWrapper>
  );
}

function handleStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    [side]: -6,
    transform: "translateY(-50%)",
    width: 12,
    height: 28,
    borderRadius: 6,
    background: "var(--accent)",
    border: "2px solid #fff",
    cursor: "ew-resize",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  };
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute("width") ?? (el as HTMLElement).style.width;
          if (!w) return null;
          const n = parseInt(String(w), 10);
          return isNaN(n) ? null : n;
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {};
          return { width: attrs.width, style: `width: ${attrs.width}px` };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
