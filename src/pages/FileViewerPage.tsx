import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, Download, Edit, Trash2, FileText, Image as ImageIcon, Code, FileJson, Film } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useFileContent, useDeleteFile } from '../hooks/useFiles'
import { filesAPI } from '../api/files'

export function FileViewerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const filePath = searchParams.get('path') || '/'
  const fileName = filePath.split('/').pop() || 'Unknown'

  const { data: content, isLoading, error } = useFileContent(filePath, true)
  const deleteMutation = useDeleteFile()

  const [fileType, setFileType] = useState<'text' | 'markdown' | 'image' | 'pdf' | 'json' | 'code' | 'video' | 'unknown'>('unknown')

  useEffect(() => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!ext) {
      setFileType('text')
      return
    }

    // Determine file type based on extension
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
      setFileType('image')
    } else if (ext === 'pdf') {
      setFileType('pdf')
    } else if (['md', 'markdown'].includes(ext)) {
      setFileType('markdown')
    } else if (['json', 'jsonl'].includes(ext)) {
      setFileType('json')
    } else if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss', 'sql', 'sh', 'yaml', 'yml', 'xml'].includes(ext)) {
      setFileType('code')
    } else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
      setFileType('video')
    } else if (['txt', 'log', 'csv'].includes(ext)) {
      setFileType('text')
    } else {
      setFileType('text') // Default to text
    }
  }, [fileName])

  const handleDownload = async () => {
    try {
      const fileContent = await filesAPI.read(filePath)
      const blob = new Blob([fileContent], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download file:', error)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return

    try {
      await deleteMutation.mutateAsync({
        path: filePath,
        isDirectory: false,
      })
      navigate('/')
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const getFileIcon = () => {
    switch (fileType) {
      case 'image':
        return <ImageIcon className="h-6 w-6" />
      case 'code':
        return <Code className="h-6 w-6" />
      case 'json':
        return <FileJson className="h-6 w-6" />
      case 'video':
        return <Film className="h-6 w-6" />
      default:
        return <FileText className="h-6 w-6" />
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Loading file...</p>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-destructive mb-2">Failed to load file</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      )
    }

    switch (fileType) {
      case 'image':
        return (
          <div className="flex items-center justify-center p-8 bg-muted/20 rounded-lg">
            <img
              src={`data:image/*;base64,${btoa(content || '')}`}
              alt={fileName}
              className="max-w-full max-h-[70vh] object-contain"
              onError={(e) => {
                // If base64 doesn't work, try direct blob URL
                const blob = new Blob([content || ''], { type: 'image/*' })
                const url = URL.createObjectURL(blob)
                e.currentTarget.src = url
              }}
            />
          </div>
        )

      case 'json':
        try {
          const jsonData = JSON.parse(content || '{}')
          return (
            <pre className="p-6 bg-muted rounded-lg overflow-auto max-h-[70vh] text-sm font-mono">
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          )
        } catch {
          return (
            <pre className="p-6 bg-muted rounded-lg overflow-auto max-h-[70vh] text-sm font-mono whitespace-pre-wrap">
              {content}
            </pre>
          )
        }

      case 'markdown':
        return (
          <div className="prose prose-sm md:prose-base lg:prose-lg dark:prose-invert max-w-none p-6 bg-white dark:bg-muted rounded-lg">
            <ReactMarkdown>{content || ''}</ReactMarkdown>
          </div>
        )

      case 'code':
        return (
          <pre className="p-6 bg-muted rounded-lg overflow-auto max-h-[70vh] text-sm font-mono">
            <code>{content}</code>
          </pre>
        )

      case 'pdf':
        return (
          <div className="p-8 text-center bg-muted/20 rounded-lg">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              PDF preview is not supported in browser
            </p>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        )

      case 'video':
        return (
          <div className="flex items-center justify-center p-8 bg-muted/20 rounded-lg">
            <video controls className="max-w-full max-h-[70vh]">
              <source src={`data:video/*;base64,${btoa(content || '')}`} />
              Your browser does not support video playback.
            </video>
          </div>
        )

      case 'text':
      default:
        return (
          <pre className="p-6 bg-muted rounded-lg overflow-auto max-h-[70vh] text-sm font-mono whitespace-pre-wrap">
            {content}
          </pre>
        )
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              {getFileIcon()}
              <h1 className="text-xl font-semibold">{fileName}</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* File Info */}
          <div className="mb-4 p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Path:</span>{' '}
                <span className="font-mono">{filePath}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>{' '}
                <span className="capitalize">{fileType}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Size:</span>{' '}
                <span>{content ? `${content.length} bytes` : '-'}</span>
              </div>
            </div>
          </div>

          {/* File Content */}
          {renderContent()}
        </div>
      </main>
    </div>
  )
}
