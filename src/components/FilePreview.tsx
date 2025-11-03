import { Download, X } from 'lucide-react';
import { useFileContent } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';

interface FilePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileInfo | null;
  onDownload: (file: FileInfo) => void;
}

export function FilePreview({ open, onOpenChange, file, onDownload }: FilePreviewProps) {
  const { data: content, isLoading } = useFileContent(file?.path || '', open && !!file && !file.isDirectory);

  if (!file || file.isDirectory) return null;

  const getFileType = () => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) return 'image';
    if (['mp4', 'webm', 'ogg'].includes(ext || '')) return 'video';
    if (['pdf'].includes(ext || '')) return 'pdf';
    return 'text';
  };

  const fileType = getFileType();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{file.name}</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => onDownload(file)}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-auto max-h-[70vh]">
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          )}

          {!isLoading && fileType === 'text' && <pre className="p-4 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap break-words">{content}</pre>}

          {fileType === 'image' && (
            <div className="flex items-center justify-center p-4">
              <img
                src={content ? URL.createObjectURL(new Blob([content as unknown as BlobPart], { type: 'image/*' })) : ''}
                alt={file.name}
                className="max-w-full h-auto"
              />
            </div>
          )}

          {fileType === 'pdf' && (
            <div className="p-4 text-center">
              <p className="text-muted-foreground">PDF preview not supported. Please download to view.</p>
              <Button onClick={() => onDownload(file)} className="mt-4">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
