import { AlertCircle, CheckCircle2, Loader2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useUploadFile } from '../hooks/useFiles';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface FileUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
}

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export function FileUpload({ open, onOpenChange, currentPath }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<FileUploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadFile();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleUpload = async () => {
    // Initialize upload statuses
    const initialStatuses: FileUploadStatus[] = files.map((file) => ({
      file,
      status: 'pending',
    }));
    setUploadStatuses(initialStatuses);
    setIsUploading(true);

    // Upload files sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Update status to uploading
      setUploadStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'uploading' } : s)));

      try {
        // Read file content
        const content = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              resolve(e.target.result as ArrayBuffer);
            } else {
              reject(new Error('Failed to read file'));
            }
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsArrayBuffer(file);
        });

        const filePath = `${currentPath}/${file.name}`.replace('//', '/');

        // Upload file
        await uploadMutation.mutateAsync({ path: filePath, content });

        // Update status to success
        setUploadStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'success' } : s)));
      } catch (error) {
        // Update status to error with message
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        setUploadStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'error', error: errorMessage } : s)));
      }
    }

    setIsUploading(false);
  };

  const handleClose = () => {
    if (!isUploading) {
      setFiles([]);
      setUploadStatuses([]);
      onOpenChange(false);
    }
  };

  const allComplete = uploadStatuses.length > 0 && uploadStatuses.every((s) => s.status === 'success' || s.status === 'error');
  const hasErrors = uploadStatuses.some((s) => s.status === 'error');

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Files to {currentPath}</DialogTitle>
        </DialogHeader>

        {/* File Selection Area (hidden when uploading) */}
        {uploadStatuses.length === 0 && (
          <>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/25'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">Drag and drop files here, or click to select files</p>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                Select Files
              </Button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected Files:</p>
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="text-sm truncate">{file.name}</span>
                    <Button variant="ghost" size="icon" onClick={() => removeFile(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Upload Progress Area */}
        {uploadStatuses.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {uploadStatuses.map((status, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded border ${
                  status.status === 'error'
                    ? 'bg-destructive/10 border-destructive'
                    : status.status === 'success'
                      ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                      : 'bg-muted border-border'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {status.status === 'uploading' && <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />}
                  {status.status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />}
                  {status.status === 'error' && <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />}
                  {status.status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{status.file.name}</p>
                    {status.status === 'error' && status.error && <p className="text-xs text-destructive mt-1">{status.error}</p>}
                    {status.status === 'success' && <p className="text-xs text-green-600 dark:text-green-400 mt-1">Uploaded successfully</p>}
                    {status.status === 'uploading' && <p className="text-xs text-muted-foreground mt-1">Uploading...</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary when upload is complete */}
        {allComplete && (
          <div className={`p-3 rounded-lg ${hasErrors ? 'bg-orange-50 dark:bg-orange-950' : 'bg-green-50 dark:bg-green-950'}`}>
            <p className="text-sm font-medium">
              {hasErrors
                ? `Upload complete with errors (${uploadStatuses.filter((s) => s.status === 'success').length}/${uploadStatuses.length} succeeded)`
                : `All ${uploadStatuses.length} file(s) uploaded successfully!`}
            </p>
          </div>
        )}

        <DialogFooter>
          {uploadStatuses.length === 0 ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={files.length === 0}>
                Upload
              </Button>
            </>
          ) : (
            <Button onClick={handleClose} disabled={isUploading} variant={allComplete && !hasErrors ? 'default' : 'outline'}>
              {isUploading ? 'Uploading...' : 'Close'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
