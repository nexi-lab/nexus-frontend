import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from 'lucide-react'
import { Button } from './ui/button'

// Configure PDF.js worker - use unpkg CDN which is more reliable
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
  fileData: Uint8Array
  onDownload: () => void
}

export function PDFViewer({ fileData, onDownload }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load PDF document
  useEffect(() => {
    setLoading(true)
    setError(null)

    const loadPDF = async () => {
      try {
        console.log('PDFViewer loading with fileData:', {
          type: typeof fileData,
          isUint8Array: fileData instanceof Uint8Array,
          length: fileData?.length,
          firstBytes: fileData?.slice(0, 10),
        })

        // Validate that fileData is a Uint8Array
        if (!(fileData instanceof Uint8Array)) {
          throw new Error(`Invalid data type: expected Uint8Array, got ${typeof fileData}`)
        }

        // Check if it looks like a PDF (starts with %PDF)
        const header = String.fromCharCode(...fileData.slice(0, 4))
        console.log('PDF header:', header)
        if (!header.startsWith('%PDF')) {
          throw new Error(`Invalid PDF format: file does not start with %PDF (got: ${header})`)
        }

        // Create a copy of the data to avoid detached ArrayBuffer issues
        const dataCopy = new Uint8Array(fileData)
        const loadingTask = pdfjsLib.getDocument({ data: dataCopy })
        const pdfDoc = await loadingTask.promise
        setPdf(pdfDoc)
        setTotalPages(pdfDoc.numPages)
        setLoading(false)
      } catch (err) {
        console.error('Error loading PDF:', err)
        setError(`Failed to load PDF document: ${err instanceof Error ? err.message : 'Unknown error'}`)
        setLoading(false)
      }
    }

    loadPDF()

    return () => {
      pdf?.destroy()
    }
  }, [fileData])

  // Render current page
  useEffect(() => {
    if (!pdf || !canvasRef.current) {
      console.log('Skipping render:', { hasPdf: !!pdf, hasCanvas: !!canvasRef.current })
      return
    }

    const renderPage = async () => {
      try {
        console.log(`Rendering page ${currentPage} of ${totalPages} at scale ${scale}`)
        const page = await pdf.getPage(currentPage)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current

        if (!canvas) {
          console.error('Canvas ref lost during render')
          setError('Canvas element not found')
          return
        }

        const context = canvas.getContext('2d')
        if (!context) {
          console.error('Could not get 2D context')
          setError('Could not create canvas context')
          return
        }

        console.log('Viewport:', { width: viewport.width, height: viewport.height })
        canvas.height = viewport.height
        canvas.width = viewport.width

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        }

        console.log('Starting render...')
        await page.render(renderContext as any).promise
        console.log('Render complete')
      } catch (err) {
        console.error('Error rendering page:', err)
        setError(`Failed to render PDF page: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    renderPage()
  }, [pdf, currentPage, scale, totalPages])

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading PDF...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={onDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* PDF Controls */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Canvas */}
      <div className="flex-1 overflow-auto p-4 bg-muted/10 flex items-start justify-center">
        <canvas ref={canvasRef} className="shadow-lg" />
      </div>
    </div>
  )
}
