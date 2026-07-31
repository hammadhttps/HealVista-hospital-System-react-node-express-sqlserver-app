/**
 * Minimal types for the pdfjs-dist legacy build's Node entry point.
 *
 * pdfjs-dist publishes no declaration for the `legacy/build/pdf.mjs` path (it ships a
 * single `types/src/pdf.d.ts` for the modern build, which does not cover every export
 * we use and is not wired to the legacy path under NodeNext resolution). We use only a
 * small, stable slice of its API for text extraction, declared here.
 */
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export interface PdfDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPage>;
  }
  export interface PdfPage {
    getTextContent(): Promise<{ items: { str: string }[] }>;
  }
  export interface PdfDocumentParams {
    data: Uint8Array;
    disableWorker?: boolean;
    disableFontFace?: boolean;
  }
  export function getDocument(params: PdfDocumentParams): {
    promise: Promise<PdfDocument>;
  };
}
