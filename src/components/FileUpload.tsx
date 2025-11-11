import { AlertCircle, CheckCircle2, Loader2, Upload, X, FolderOpen, FileIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useUploadFile, useCreateDirectory } from '../hooks/useFiles';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

interface FileUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath: string;
}

interface FileWithPath {
  file: File;
  relativePath: string;
}

interface FileUploadStatus {
  file: File;
  relativePath: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export function FileUpload({ open, onOpenChange, currentPath }: FileUploadProps) {
  const [filesWithPaths, setFilesWithPaths] = useState<FileWithPath[]>([]);
  const [uploadStatuses, setUploadStatuses] = useState<FileUploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadFile();
  const createDirMutation = useCreateDirectory();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = e.dataTransfer.items;
    if (items) {
      const filesWithPaths = await collectFilesFromItems(items);
      setFilesWithPaths(filesWithPaths);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const filesWithPaths: FileWithPath[] = files.map(file => ({
        file,
        relativePath: file.name, // Single files have no parent path
      }));
      setFilesWithPaths(filesWithPaths);
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const filesWithPaths: FileWithPath[] = files.map(file => {
        // webkitRelativePath contains the folder structure
        const relativePath = (file as any).webkitRelativePath || file.name;
        return {
          file,
          relativePath,
        };
      });
      setFilesWithPaths(filesWithPaths);
    }
  };

  // Helper function to collect files from drag-and-drop items (supports folders)
  const collectFilesFromItems = async (items: DataTransferItemList): Promise<FileWithPath[]> => {
    const filesWithPaths: FileWithPath[] = [];

    const traverseEntry = async (entry: any, path = ''): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve) => {
          entry.file((f: File) => resolve(f));
        });
        const relativePath = path ? `${path}/${file.name}` : file.name;
        filesWithPaths.push({ file, relativePath });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise<any[]>((resolve) => {
          reader.readEntries((entries: any[]) => resolve(entries));
        });
        for (const childEntry of entries) {
          const childPath = path ? `${path}/${entry.name}` : entry.name;
          await traverseEntry(childEntry, childPath);
        }
      }
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          await traverseEntry(entry);
        }
      }
    }

    return filesWithPaths;
  };

  const handleUpload = async () => {
    // Initialize upload statuses
    const initialStatuses: FileUploadStatus[] = filesWithPaths.map(({ file, relativePath }) => ({
      file,
      relativePath,
      status: 'pending',
    }));
    setUploadStatuses(initialStatuses);
    setIsUploading(true);

    // Collect unique directories that need to be created
    const directories = new Set<string>();
    for (const { relativePath } of filesWithPaths) {
      const pathParts = relativePath.split('/');
      if (pathParts.length > 1) {
        // Build all parent directories
        for (let i = 0; i < pathParts.length - 1; i++) {
          const dirPath = pathParts.slice(0, i + 1).join('/');
          const fullDirPath = `${currentPath}/${dirPath}`.replace('//', '/');
          directories.add(fullDirPath);
        }
      }
    }

    // Create directories first
    for (const dirPath of Array.from(directories).sort()) {
      try {
        await createDirMutation.mutateAsync({ path: dirPath });
      } catch (error) {
        // Ignore errors if directory already exists
        console.log(`Directory ${dirPath} may already exist:`, error);
      }
    }

    // Upload files sequentially
    for (let i = 0; i < filesWithPaths.length; i++) {
      const { file, relativePath } = filesWithPaths[i];

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

        const filePath = `${currentPath}/${relativePath}`.replace('//', '/');

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
      setFilesWithPaths([]);
      setUploadStatuses([]);
      onOpenChange(false);
    }
  };

  const allComplete = uploadStatuses.length > 0 && uploadStatuses.every((s) => s.status === 'success' || s.status === 'error');
  const hasErrors = uploadStatuses.some((s) => s.status === 'error');

  const removeFile = (index: number) => {
    setFilesWithPaths(filesWithPaths.filter((_, i) => i !== index));
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
              <p className="text-sm text-muted-foreground mb-2">Drag and drop files or folders here</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <FileIcon className="h-4 w-4 mr-2" />
                  Select Files
                </Button>
                <Button variant="outline" onClick={() => folderInputRef.current?.click()}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Select Folder
                </Button>
              </div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
              <input
                ref={folderInputRef}
                type="file"
                {...({ webkitdirectory: '', directory: '' } as any)}
                multiple
                className="hidden"
                onChange={handleFolderSelect}
              />
            </div>

            {filesWithPaths.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected Files ({filesWithPaths.length}):</p>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filesWithPaths.map(({ file, relativePath }, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="text-sm truncate flex-1" title={relativePath}>
                        {relativePath}
                      </span>
                      <span className="text-xs text-muted-foreground mx-2">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => removeFile(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
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
                    <p className="text-sm font-medium truncate" title={status.relativePath}>{status.relativePath}</p>
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
              <Button onClick={handleUpload} disabled={filesWithPaths.length === 0}>
                Upload {filesWithPaths.length > 0 && `(${filesWithPaths.length} file${filesWithPaths.length > 1 ? 's' : ''})`}
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
