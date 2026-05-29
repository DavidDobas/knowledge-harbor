"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";

// Models sometimes emit \( ... \) / \[ ... \] LaTeX delimiters instead of $ / $$.
// Normalize those so remark-math picks them up.
function normalizeMath(s: string): string {
  return s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n$$\n${m}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`);
}

/**
 * After KaTeX renders, Chrome strips the MathML subtree (including the TeX
 * <annotation> element) from clipboard HTML when the user copies.  To work
 * around this, we stamp the original TeX onto a plain `data-latex` attribute
 * on the outermost `.katex` span — plain HTML attributes ARE preserved in the
 * clipboard, so the paste handler in NotesView can read them.
 */
function stampLatexAttributes(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>(".katex").forEach((katexEl) => {
    if (katexEl.dataset.latex) return; // already stamped
    const ann = katexEl.querySelector('annotation[encoding="application/x-tex"]');
    if (ann?.textContent) {
      katexEl.dataset.latex = ann.textContent.trim();
    }
  });
}

export default function ChatMarkdown({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) stampLatexAttributes(ref.current);
  });

  return (
    <div ref={ref}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeMath(content)}
      </ReactMarkdown>
    </div>
  );
}
