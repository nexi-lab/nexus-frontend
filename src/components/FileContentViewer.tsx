import { Code, Download, Edit, FileIcon, FileJson, FileText, Film, History, Image as ImageIcon, Loader2, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { useDeleteFile, useFileContent, useUpdateFile } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import ExcelViewer from './ExcelViewer';
import { FileVersionHistoryDialog } from './FileVersionHistoryDialog';
import { PDFViewer } from './PDFViewer';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

// Helper to convert Uint8Array to string
function bytesToString(bytes: Uint8Array | undefined | null | any): string {
  if (!bytes) return '';

  // Handle Uint8Array
  if (bytes instanceof Uint8Array) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  }

  // Handle ArrayBuffer
  if (bytes instanceof ArrayBuffer) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(new Uint8Array(bytes));
  }

  // Handle empty or invalid data
  if (typeof bytes === 'object' && bytes.length === 0) {
    return '';
  }

  // Fallback: return empty string for unexpected types
  console.warn('Unexpected bytes type:', typeof bytes, bytes);
  return '';
}

interface FileContentViewerProps {
  file: FileInfo | null;
  onFileDeleted?: () => void;
}

export function FileContentViewer({ file, onFileDeleted }: FileContentViewerProps) {
  const { apiClient } = useAuth();
  const filesAPI = useMemo(() => createFilesAPI(apiClient), [apiClient]);

  const filePath = file?.path || '';
  const fileName = file?.name || 'Unknown';

  const { data: contentBytes, isLoading, error } = useFileContent(filePath, !!file && !file.isDirectory);
  const deleteMutation = useDeleteFile();
  const updateMutation = useUpdateFile();

  // For binary files (PDF, XLSX, etc.), try to load the parsed markdown file
  // Pattern: {filename without ext}_parsed.{ext}.md
  // Example: AR_Subledger_05.2025.xlsx -> AR_Subledger_05.2025_parsed.xlsx.md
  const fileExt = fileName.toLowerCase().split('.').pop() || '';
  const binaryFileTypes = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt'];
  const hasParsedMarkdown = binaryFileTypes.includes(fileExt);

  // Construct parsed markdown path by removing extension and adding _parsed.{ext}.md
  let parsedMdPath = '';
  if (hasParsedMarkdown && filePath) {
    const pathWithoutExt = filePath.substring(0, filePath.lastIndexOf('.'));
    parsedMdPath = `${pathWithoutExt}_parsed.${fileExt}.md`;
  }

  const { data: parsedMdBytes, isLoading: parsedMdLoading, error: parsedMdError } = useFileContent(parsedMdPath, hasParsedMarkdown);

  // Debug: log parsed markdown path construction
  useEffect(() => {
    if (hasParsedMarkdown && filePath) {
      console.log('Parsed markdown lookup:', {
        originalFile: filePath,
        parsedMdPath,
        hasContent: !!parsedMdBytes,
        isLoading: parsedMdLoading,
        hasError: !!parsedMdError,
        errorMessage: parsedMdError instanceof Error ? parsedMdError.message : parsedMdError,
      });
    }
  }, [hasParsedMarkdown, filePath, parsedMdPath, parsedMdBytes, parsedMdLoading, parsedMdError]);

  // Convert bytes to string for text display
  const content = bytesToString(contentBytes);
  const parsedMdContent = bytesToString(parsedMdBytes);

  const [fileType, setFileType] = useState<'text' | 'markdown' | 'image' | 'pdf' | 'json' | 'code' | 'video' | 'excel' | 'html' | 'unknown'>('unknown');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [showParsedContent, setShowParsedContent] = useState(false); // Toggle between raw and parsed content (default: raw)

  // Check if file is editable
  const isEditable = fileType === 'text' || fileType === 'markdown';

  // Reset editing state and toggle when file changes
  useEffect(() => {
    setIsEditing(false);
    setEditContent('');
    setShowParsedContent(false); // Default to showing raw content
  }, [file?.path]);

  // Update edit content when file content loads
  useEffect(() => {
    if (content && !isEditing) {
      setEditContent(content);
    }
  }, [content, isEditing]);

  useEffect(() => {
    if (!file || file.isDirectory) {
      setFileType('unknown');
      return;
    }

    const ext = fileName.split('.').pop()?.toLowerCase();
    if (!ext) {
      setFileType('text');
      return;
    }

    // Determine file type based on extension
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
      setFileType('image');
    } else if (ext === 'pdf') {
      setFileType('pdf');
    } else if (['xlsx', 'xls', 'xlsm', 'xlsb'].includes(ext)) {
      setFileType('excel');
    } else if (['md', 'markdown'].includes(ext)) {
      setFileType('markdown');
    } else if (['json', 'jsonl'].includes(ext)) {
      setFileType('json');
    } else if (['html', 'htm'].includes(ext)) {
      setFileType('html');
    } else if (
      ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'rb', 'php', 'css', 'scss', 'sql', 'sh', 'yaml', 'yml', 'xml'].includes(ext)
    ) {
      setFileType('code');
    } else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
      setFileType('video');
    } else if (['txt', 'log', 'csv'].includes(ext)) {
      setFileType('text');
    } else {
      setFileType('text'); // Default to text
    }
  }, [fileName, file]);

  const handleDownload = async () => {
    if (!file) return;

    try {
      const fileContent = await filesAPI.read(filePath);
      const blob = new Blob([fileContent as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  const handleDelete = async () => {
    if (!file) return;
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

    try {
      await deleteMutation.mutateAsync({
        path: filePath,
        isDirectory: file.isDirectory,
      });
      onFileDeleted?.();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleEdit = () => {
    setEditContent(content || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(content || '');
  };

  const handleSave = async () => {
    if (!file) return;

    try {
      const encoder = new TextEncoder();
      const contentBuffer = encoder.encode(editContent).buffer;
      await updateMutation.mutateAsync({ path: filePath, content: contentBuffer });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save file:', error);
      alert(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getFileIcon = () => {
    switch (fileType) {
      case 'image':
        return <ImageIcon className="h-5 w-5" />;
      case 'code':
        return <Code className="h-5 w-5" />;
      case 'json':
        return <FileJson className="h-5 w-5" />;
      case 'video':
        return <Film className="h-5 w-5" />;
      case 'html':
        return <Code className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const renderContent = () => {
    if (!file) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <FileIcon className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg">No file selected</p>
          <p className="text-sm">Select a file from the left panel to view its contents</p>
        </div>
      );
    }

    if (file.isDirectory) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <FileIcon className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg">Directory selected</p>
          <p className="text-sm">Select a file to view its contents</p>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-lg font-medium mb-1">Loading file...</p>
            <p className="text-sm text-muted-foreground">{fileName}</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-destructive mb-2">Failed to load file</p>
            <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      );
    }

    switch (fileType) {
      case 'image':
        return (
          <div className="flex items-center justify-center p-8 bg-muted/20 rounded-lg h-full">
            <img
              src={contentBytes ? URL.createObjectURL(new Blob([contentBytes as unknown as BlobPart], { type: 'image/*' })) : ''}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        );

      case 'json':
        try {
          const jsonData = JSON.parse(content || '{}');
          return <pre className="p-6 bg-muted rounded-lg overflow-auto h-full text-sm font-mono">{JSON.stringify(jsonData, null, 2)}</pre>;
        } catch {
          return <pre className="p-6 bg-muted rounded-lg overflow-auto h-full text-sm font-mono whitespace-pre-wrap">{content}</pre>;
        }

      case 'markdown':
        if (isEditing) {
          return (
            <div className="grid grid-cols-2 gap-4 h-full">
              {/* Editor */}
              <div className="flex flex-col h-full">
                <div className="text-sm font-medium mb-2 text-muted-foreground">Editor</div>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 font-mono text-sm resize-none"
                  placeholder="Enter markdown content..."
                />
              </div>
              {/* Preview */}
              <div className="flex flex-col h-full">
                <div className="text-sm font-medium mb-2 text-muted-foreground">Preview</div>
                <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none p-4 bg-white dark:bg-muted rounded-lg overflow-auto flex-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent || ''}</ReactMarkdown>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div className="prose prose-sm md:prose-base lg:prose-lg dark:prose-invert max-w-none p-6 bg-white dark:bg-muted rounded-lg overflow-auto h-full">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
          </div>
        );

      case 'code':
        return (
          <pre className="p-6 bg-muted rounded-lg overflow-auto h-full text-sm font-mono">
            <code>{content}</code>
          </pre>
        );

      case 'html':
        return (
          <div className="h-full w-full bg-white dark:bg-muted">
            <iframe
              srcDoc={content}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              title={fileName}
            />
          </div>
        );

      case 'pdf':
        // If we have parsed markdown content and user wants to see it, show that instead of PDF viewer
        if (parsedMdContent && !parsedMdError && showParsedContent) {
          return (
            <div className="prose prose-sm md:prose-base lg:prose-lg dark:prose-invert max-w-none p-6 bg-white dark:bg-muted rounded-lg overflow-auto h-full">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ node: _node, ...props }) => (
                    <div
                      style={{
                        overflowX: 'auto',
                        overflowY: 'auto',
                        maxHeight: '70vh',
                        border: '2px solid #3b82f6',
                        borderRadius: '8px',
                        padding: '1rem',
                        background: 'white',
                        marginBottom: '1rem',
                      }}
                    >
                      <table {...props} style={{ width: 'max-content', minWidth: '100%' }} />
                    </div>
                  ),
                  th: ({ node: _node, ...props }) => (
                    <th {...props} style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem', background: '#f9fafb', fontWeight: 600 }} />
                  ),
                  td: ({ node: _node, ...props }) => <td {...props} style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem' }} />,
                }}
              >
                {parsedMdContent}
              </ReactMarkdown>
            </div>
          );
        }

        // Otherwise, fall back to PDF viewer
        if (parsedMdLoading) {
          return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-lg font-medium">Loading PDF content...</p>
            </div>
          );
        }

        if (!contentBytes || !(contentBytes instanceof Uint8Array)) {
          return (
            <div className="p-8 text-center bg-muted/20 rounded-lg h-full flex flex-col items-center justify-center">
              <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">{contentBytes ? 'Invalid PDF data format' : 'Loading PDF...'}</p>
            </div>
          );
        }
        return <PDFViewer fileData={contentBytes} onDownload={handleDownload} />;

      case 'excel':
        // If we have parsed markdown content and user wants to see it, show markdown
        if (parsedMdContent && !parsedMdError && showParsedContent) {
          return (
            <div className="prose prose-sm md:prose-base lg:prose-lg dark:prose-invert max-w-none p-6 bg-white dark:bg-muted rounded-lg overflow-auto h-full">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ node: _node, ...props }) => (
                    <div
                      style={{
                        overflowX: 'auto',
                        overflowY: 'auto',
                        maxHeight: '70vh',
                        border: '2px solid #3b82f6',
                        borderRadius: '8px',
                        padding: '1rem',
                        background: 'white',
                        marginBottom: '1rem',
                      }}
                    >
                      <table {...props} style={{ width: 'max-content', minWidth: '100%' }} />
                    </div>
                  ),
                  th: ({ node: _node, ...props }) => (
                    <th {...props} style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem', background: '#f9fafb', fontWeight: 600 }} />
                  ),
                  td: ({ node: _node, ...props }) => <td {...props} style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem' }} />,
                }}
              >
                {parsedMdContent}
              </ReactMarkdown>
            </div>
          );
        }

        // Loading state for parsed content
        if (parsedMdLoading && showParsedContent) {
          return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="text-lg font-medium">Loading parsed content...</p>
            </div>
          );
        }

        // User wants raw Excel view (Univer) or no parsed content available
        // Show ExcelViewer for raw spreadsheet display
        if (contentBytes) {
          return <ExcelViewer contentBytes={contentBytes} />;
        }

        // Fallback - no content available
        return (
          <div className="p-8 text-center bg-muted/20 rounded-lg h-full flex flex-col items-center justify-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">Excel File</p>
            <p className="text-muted-foreground mb-4">Unable to load file content.</p>
            <Button onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download File
            </Button>
          </div>
        );

      case 'video':
        return (
          <div className="flex items-center justify-center p-8 bg-muted/20 rounded-lg h-full">
            <video controls className="max-w-full max-h-full">
              <source src={`data:video/*;base64,${btoa(content || '')}`} />
              Your browser does not support video playback.
            </video>
          </div>
        );

      case 'text':
        if (isEditing) {
          return (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="h-full font-mono text-sm resize-none"
              placeholder="Enter text content..."
            />
          );
        }
        return <pre className="p-6 bg-muted rounded-lg overflow-auto h-full text-sm font-mono whitespace-pre-wrap">{content}</pre>;
      default:
        if (isEditing) {
          return (
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="h-full font-mono text-sm resize-none"
              placeholder="Enter text content..."
            />
          );
        }
        return <pre className="p-6 bg-muted rounded-lg overflow-auto h-full text-sm font-mono whitespace-pre-wrap">{content}</pre>;
    }
  };

  if (!file) {
    return (
      <div className="flex-1 flex flex-col h-full min-w-0">
        <div className="flex-1 overflow-auto p-6">{renderContent()}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* File Header */}
      <div className="border-b bg-background/95 backdrop-blur p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getFileIcon()}
          <h2 className="text-lg font-semibold">{fileName}</h2>
        </div>
        {!file.isDirectory && (
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button variant="default" size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {isEditable && (
                  <Button variant="outline" size="sm" onClick={handleEdit}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setVersionHistoryOpen(true)}>
                  <History className="h-4 w-4 mr-2" />
                  History
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* File Info */}
      {!file.isDirectory && (
        <div className="border-b p-3 bg-muted/30">
          <div className="flex gap-6 text-xs text-muted-foreground items-center">
            <div>
              <span className="font-medium">Path:</span> <span className="font-mono">{filePath}</span>
            </div>
            <div>
              <span className="font-medium">Type:</span> <span className="capitalize">{fileType}</span>
            </div>
            {file.size && (
              <div>
                <span className="font-medium">Size:</span> <span>{file.size} bytes</span>
              </div>
            )}
            {hasParsedMarkdown && parsedMdContent && !parsedMdError && (
              <div className="ml-auto flex items-center gap-2">
                <span className="font-medium">View:</span>
                <Button
                  variant={showParsedContent ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowParsedContent(true)}
                  className="h-7 px-3 text-xs"
                >
                  Parsed
                </Button>
                <Button
                  variant={!showParsedContent ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowParsedContent(false)}
                  className="h-7 px-3 text-xs"
                >
                  Raw
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Content */}
      <div className={`flex-1 overflow-auto ${hasParsedMarkdown && parsedMdContent && !parsedMdError ? '' : 'p-6'}`}>{renderContent()}</div>

      {/* Version History Dialog */}
      {file && !file.isDirectory && <FileVersionHistoryDialog open={versionHistoryOpen} onOpenChange={setVersionHistoryOpen} filePath={filePath} />}
    </div>
  );
}
