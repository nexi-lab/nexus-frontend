import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Cloud, Database, FileText, Folder, FolderOpen, HardDrive, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { createFilesAPI, enrichFileWithMount } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys, useFileList, useMounts } from '../hooks/useFiles';
import { cn } from '../lib/utils';
import type { FileInfo } from '../types/file';
import { type ContextMenuAction, FileContextMenu } from './FileContextMenu';
import { InlineFileInput } from './InlineFileInput';

// Helper function to check if a file is a parsed markdown file
function isParsedFile(fileName: string): boolean {
  // Pattern: *_parsed.{ext}.md (e.g., document_parsed.pdf.md, sheet_parsed.xlsx.md)
  return /_parsed\.(pdf|xlsx|xls|xlsm|xlsb|docx|doc|pptx|ppt)\.md$/i.test(fileName);
}

// Helper function to get folder/backend icon based on backend type
function getFolderIcon(backendType?: string, isExpanded?: boolean) {
  if (!backendType) {
    // Default folder icons
    return isExpanded ? (
      <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
    ) : (
      <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
    );
  }

  // Mount point - use backend-specific icon
  switch (backendType) {
    case 'GCSConnectorBackend':
    case 'GCSBackend':
      return (
        <span title={`Backend: ${backendType}`}>
          <Cloud className="h-4 w-4 text-blue-400 flex-shrink-0" />
        </span>
      );
    case 'LocalBackend':
      return (
        <span title={`Backend: ${backendType}`}>
          <HardDrive className="h-4 w-4 text-gray-400 flex-shrink-0" />
        </span>
      );
    default:
      return (
        <span title={`Backend: ${backendType}`}>
          <Database className="h-4 w-4 text-purple-400 flex-shrink-0" />
        </span>
      );
  }
}

interface FileTreeProps {
  currentPath: string;
  onPathChange: (path: string) => void;
  onFileClick?: (file: FileInfo) => void;
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void;
  searchResults?: FileInfo[] | null;
  creatingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null;
  onCreateItem?: (path: string, type: 'file' | 'folder') => void;
  onCancelCreate?: () => void;
}

interface TreeNodeProps {
  path: string;
  name: string;
  currentPath: string;
  onPathChange: (path: string) => void;
  onFileClick?: (file: FileInfo) => void;
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void;
  level: number;
  searchResults?: FileInfo[] | null;
  relevantPaths?: Set<string>;
  creatingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null;
  onCreateItem?: (path: string, type: 'file' | 'folder') => void;
  onCancelCreate?: () => void;
  backendType?: string;
  mounts?: import('../types/file').MountInfo[];
}

function TreeNode({
  path,
  name,
  currentPath,
  onPathChange,
  onFileClick,
  onContextMenuAction,
  level,
  searchResults,
  relevantPaths,
  creatingNewItem,
  onCreateItem,
  onCancelCreate,
  backendType,
  mounts,
}: TreeNodeProps) {
  const queryClient = useQueryClient();
  const { apiClient } = useAuth();
  const filesAPI = useMemo(() => createFilesAPI(apiClient), [apiClient]);
  const [isExpanded, setIsExpanded] = useState(currentPath.startsWith(path) || path === '/');
  const [isSyncing, setIsSyncing] = useState(false);

  // Use regular file listing for all paths
  const { data: rawFiles, isLoading } = useFileList(path, isExpanded);

  // Handle sync mount - call actual sync_mount API
  const handleSyncMount = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent expanding/collapsing the folder

    setIsSyncing(true);
    try {
      // Call the sync_mount API
      const result = await filesAPI.syncMount(path, true, false);

      console.log('Sync mount result:', result);

      // Invalidate all file list queries for this path and subdirectories
      // This will refresh the file tree to show newly synced files
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
      await queryClient.invalidateQueries({ queryKey: fileKeys.mounts() });

      // Handle different possible property names from API response
      const filesScanned = result.files_scanned ?? (result as any).files_found ?? 0;
      const filesCreated = result.files_created ?? (result as any).files_added ?? 0;
      const filesUpdated = result.files_updated ?? 0;
      const filesDeleted = result.files_deleted ?? 0;

      toast.success(`Synced ${path}: ${filesScanned} files scanned, ${filesCreated} created, ${filesUpdated} updated, ${filesDeleted} deleted`);
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error(`Failed to sync ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Enrich files with mount information if mounts are available
  const files = useMemo(() => {
    if (!rawFiles || !mounts) return rawFiles;
    return rawFiles.map(file => enrichFileWithMount(file, mounts));
  }, [rawFiles, mounts]);

  const isActive = currentPath === path;

  // Filter directories and files based on search results
  const directories = useMemo(() => {
    const allDirs = files?.filter((f) => f.isDirectory) || [];

    // If no search is active, show all directories
    if (!searchResults || !relevantPaths) {
      return allDirs;
    }

    // Only show directories that are in the relevant paths
    return allDirs.filter((dir) => relevantPaths.has(dir.path));
  }, [files, searchResults, relevantPaths]);

  const fileItems = useMemo(() => {
    return files?.filter((f) => !f.isDirectory && !isParsedFile(f.name)) || [];
  }, [files]);

  const dirFileInfo: FileInfo = {
    path,
    name,
    isDirectory: true,
    backendType,
  };

  return (
    <div>
      <FileContextMenu file={dirFileInfo} onAction={(action, file) => onContextMenuAction?.(action, file)}>
        <div
          className={cn(
            'group flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-muted/50 rounded-md transition-colors',
            isActive && 'bg-muted font-medium',
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            setIsExpanded(!isExpanded);
            onPathChange(path);
          }}
        >
          {directories.length > 0 ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )
          ) : (
            <span className="w-4" />
          )}
          {getFolderIcon(dirFileInfo.backendType, isExpanded)}
          <span className="truncate">{name}</span>
          {backendType && backendType !== 'LocalBackend' && (
            <button
              onClick={handleSyncMount}
              disabled={isSyncing}
              className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-muted p-1 rounded transition-opacity"
              title="Sync mount"
            >
              <RefreshCw className={cn('h-3 w-3 text-muted-foreground', isSyncing && 'animate-spin')} />
            </button>
          )}
        </div>
      </FileContextMenu>

      {isExpanded && !isLoading && (
        <div>
          {directories.map((dir) => (
            <TreeNode
              key={dir.path}
              path={dir.path}
              name={dir.name}
              currentPath={currentPath}
              onPathChange={onPathChange}
              onFileClick={onFileClick}
              onContextMenuAction={onContextMenuAction}
              level={level + 1}
              searchResults={searchResults}
              relevantPaths={relevantPaths}
              creatingNewItem={creatingNewItem}
              onCreateItem={onCreateItem}
              onCancelCreate={onCancelCreate}
              backendType={dir.backendType}
              mounts={mounts}
            />
          ))}

          {/* Show inline input for new file/folder creation */}
          {creatingNewItem && creatingNewItem.parentPath === path && (
            <InlineFileInput
              type={creatingNewItem.type}
              level={level + 1}
              onConfirm={(name) => {
                const newPath = `${path}/${name}`.replace(/\/+/g, '/');
                onCreateItem?.(newPath, creatingNewItem.type);
              }}
              onCancel={() => onCancelCreate?.()}
            />
          )}

          {fileItems.map((file) => (
            <FileContextMenu key={file.path} file={file} onAction={(action, file) => onContextMenuAction?.(action, file)}>
              <div
                className="flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-muted/50 rounded-md transition-colors overflow-hidden"
                style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
                onClick={() => onFileClick?.(file)}
              >
                <span className="w-4 flex-shrink-0" />
                <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <span className="truncate min-w-0">{file.name}</span>
              </div>
            </FileContextMenu>
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  currentPath,
  onPathChange,
  onFileClick,
  onContextMenuAction,
  searchResults,
  creatingNewItem,
  onCreateItem,
  onCancelCreate,
}: FileTreeProps) {
  // Fetch mounts once globally
  const { data: mounts } = useMounts();

  // Build a set of all relevant directory paths from search results
  const relevantPaths = useMemo(() => {
    if (!searchResults || searchResults.length === 0) {
      return undefined;
    }

    const paths = new Set<string>();

    searchResults.forEach((file) => {
      // Add all parent directories of each matching file
      const parts = file.path.split('/').filter(Boolean);
      let currentPath = '';

      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += '/' + parts[i];
        paths.add(currentPath);
      }
    });

    // Always include root
    paths.add('/');

    return paths;
  }, [searchResults]);

  return (
    <div className="h-full overflow-auto">
      <TreeNode
        path="/"
        name="/"
        currentPath={currentPath}
        onPathChange={onPathChange}
        onFileClick={onFileClick}
        onContextMenuAction={onContextMenuAction}
        level={0}
        searchResults={searchResults}
        relevantPaths={relevantPaths}
        creatingNewItem={creatingNewItem}
        onCreateItem={onCreateItem}
        onCancelCreate={onCancelCreate}
        mounts={mounts}
      />
    </div>
  );
}
