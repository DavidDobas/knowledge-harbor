// Render the first page of a PDF File into a JPEG Blob suitable for use as a
// thumbnail on the source card in the graph. Returns null on any failure (corrupt
// PDF, canvas tainted, etc.) — the caller falls back to the generic file icon.
//
// react-pdf is imported lazily because its top-level module evaluation touches
// browser-only globals (DOMMatrix, etc.) that don't exist during Next.js's
// server-side prerender pass.
export async function renderFirstPageThumbnail(file: File, targetWidth = 400): Promise<Blob | null> {
  try {
    const { pdfjs } = await import("react-pdf");
    const { configurePdfWorker } = await import("@/lib/pdfWorker");
    configurePdfWorker();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    try {
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
      );
    } finally {
      await pdf.destroy().catch(() => {});
    }
  } catch {
    return null;
  }
}
