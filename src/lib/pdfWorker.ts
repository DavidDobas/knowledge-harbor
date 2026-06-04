import { pdfjs } from "react-pdf";

let configured = false;

/**
 * PDF.js worker for react-pdf. Must run in the same client bundle as <Document>.
 * @see https://github.com/wojtekmaj/react-pdf#configure-pdfjs-worker
 */
export function configurePdfWorker(): void {
  if (typeof window === "undefined" || configured) return;
  configured = true;
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
}
