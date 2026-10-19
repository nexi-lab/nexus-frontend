import * as pdfjs from 'pdfjs-dist';
import pdfWorkerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerURL;

export function PDFViewer({ fileData, onDownload }: { fileData: Uint8Array; onDownload: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let task: pdfjs.PDFDocumentLoadingTask | undefined;
    setDocument(null);
    setLoading(true);
    setError('');
    setPage(1);
    if (new TextDecoder().decode(fileData.subarray(0, 4)) !== '%PDF') {
      setError('Failed to load PDF document: Invalid PDF format: file does not start with %PDF');
      setLoading(false);
    } else {
      task = pdfjs.getDocument({ data: fileData.slice(), isEvalSupported: false });
      void task.promise.then(
        (document) => {
          if (active) {
            setDocument(document);
            setLoading(false);
          }
        },
        (error: unknown) => {
          if (active) {
            setError(`Failed to load PDF document: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setLoading(false);
          }
        },
      );
    }
    return () => {
      active = false;
      void task?.destroy().catch((error: unknown) => console.error('Unable to close PDF worker', error));
    };
  }, [fileData]);
  useEffect(() => {
    if (!document) return;
    let active = true;
    let task: pdfjs.RenderTask | undefined;
    void document
      .getPage(page)
      .then(async (page) => {
        if (!active || !canvas.current) return;
        const context = canvas.current.getContext('2d');
        if (!context) throw new Error('Unable to create PDF canvas.');
        const viewport = page.getViewport({ scale });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        task = page.render({ canvas: canvas.current, canvasContext: context, viewport });
        await task.promise;
      })
      .catch((error: unknown) => {
        if (active) setError(`Failed to render PDF page: ${error instanceof Error ? error.message : 'Unknown error'}`);
      });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [document, page, scale]);

  if (loading) return <output>Loading PDF...</output>;
  if (error)
    return (
      <div role="alert" className="space-y-4 p-4">
        <p>{error}</p>
        <Button onClick={onDownload}>Download PDF</Button>
      </div>
    );
  return (
    <section className="flex h-full flex-col" aria-label="PDF preview">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous page
          </Button>
          <span>
            Page {page} of {document?.numPages}
          </span>
          <Button disabled={page >= (document?.numPages ?? 0)} onClick={() => setPage(page + 1)}>
            Next page
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setScale(Math.max(0.5, scale - 0.25))}>Zoom out</Button>
          <span>{Math.round(scale * 100)}%</span>
          <Button onClick={() => setScale(Math.min(3, scale + 0.25))}>Zoom in</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <canvas ref={canvas} aria-label="PDF page" className="mx-auto" />
      </div>
    </section>
  );
}
