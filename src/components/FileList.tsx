import { Download, Edit, File, FileCode, FileText, Folder, Image, Trash2 } from 'lucide-react';
import type { FileInfo } from '../types/file';
import { Button } from './ui/button';

interface FileListProps {
  files: FileInfo[];
  onFileClick: (file: FileInfo) => void;
  onFileDownload: (file: FileInfo) => void;
  onFileDelete: (file: FileInfo) => void;
  onFileRename: (file: FileInfo) => void;
}

function getFileIcon(file: FileInfo) {
  if (file.isDirectory) {
    return <Folder className="h-5 w-5 text-blue-500" />;
  }

  const ext = file.name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return <Image className="h-5 w-5 text-purple-500" />;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
      return <FileCode className="h-5 w-5 text-green-500" />;
    case 'txt':
    case 'md':
    case 'json':
    case 'yml':
    case 'yaml':
      return <FileText className="h-5 w-5 text-gray-500" />;
    default:
      return <File className="h-5 w-5 text-gray-400" />;
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(dateString?: string): string {
  if (!dateString) return '-';

  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

// Helper function to check if a file is a parsed markdown file
function isParsedFile(fileName: string): boolean {
  // Pattern: *_parsed.{ext}.md (e.g., document_parsed.pdf.md, sheet_parsed.xlsx.md)
  return /_parsed\.(pdf|xlsx|xls|xlsm|xlsb|docx|doc|pptx|ppt)\.md$/i.test(fileName);
}

export function FileList({ files, onFileClick, onFileDownload, onFileDelete, onFileRename }: FileListProps) {
  // Filter out parsed markdown files
  const visibleFiles = files.filter((file) => !isParsedFile(file.name));

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full">
        <thead className="border-b bg-muted/50 sticky top-0">
          <tr>
            <th className="text-left p-3 font-medium text-sm">Name</th>
            <th className="text-left p-3 font-medium text-sm">Modified</th>
            <th className="text-left p-3 font-medium text-sm">Size</th>
            <th className="text-left p-3 font-medium text-sm">Type</th>
            <th className="text-right p-3 font-medium text-sm">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleFiles.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center p-8 text-muted-foreground">
                No files found
              </td>
            </tr>
          ) : (
            visibleFiles.map((file) => (
              <tr key={file.path} className="border-b hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => onFileClick(file)}>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {getFileIcon(file)}
                    <span className="text-sm">{file.name}</span>
                  </div>
                </td>
                <td className="p-3 text-sm text-muted-foreground">{formatDate(file.modified)}</td>
                <td className="p-3 text-sm text-muted-foreground">{file.isDirectory ? '-' : formatFileSize(file.size)}</td>
                <td className="p-3 text-sm text-muted-foreground">{file.isDirectory ? 'Folder' : file.type || 'File'}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFileRename(file);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {!file.isDirectory && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFileDownload(file);
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFileDelete(file);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
