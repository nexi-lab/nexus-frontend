import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Cloud, Database, FileText, Folder, FolderOpen, HardDrive, Mail, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { createFilesAPI, enrichFileWithConnector } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys, useConnectors, useFileList } from '../hooks/useFiles';
import { cn } from '../lib/utils';
import type { FileInfo } from '../types/file';
import { type ContextMenuAction, FileContextMenu } from './FileContextMenu';
import { InlineFileInput } from './InlineFileInput';

// Custom icon for Google Drive (folder with cloud)
const FolderCloudIcon = ({ className }: { className?: string }) => (
  <div className={`relative ${className}`}>
    <Folder className="h-4 w-4 text-green-500" />
    <Cloud className="h-3 w-3 absolute -bottom-0.5 -right-0.5 text-blue-400" />
  </div>
);

// Helper function to check if a file is a parsed markdown file
function isParsedFile(fileName: string): boolean {
  // Pattern: *_parsed.{ext}.md (e.g., document_parsed.pdf.md, sheet_parsed.xlsx.md)
  return /_parsed\.(pdf|xlsx|xls|xlsm|xlsb|docx|doc|pptx|ppt)\.md$/i.test(fileName);
}

// Helper function to check if a file starts with a dot (hidden file)
function isDotFile(fileName: string): boolean {
  return fileName.startsWith('.');
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

  // Connector root - use backend-specific icon
  // Normalize backend type for comparison (case-insensitive, handle variations)
  const normalizedBackendType = backendType.toLowerCase();
  
  if (normalizedBackendType.includes('gcs') || normalizedBackendType === 'gcs_connector') {
    return (
      <span title={`Backend: ${backendType}`}>
        <Cloud className="h-4 w-4 text-blue-400 flex-shrink-0" />
      </span>
    );
  }
  
  if (normalizedBackendType.includes('gdrive') || 
      normalizedBackendType === 'gdrive_connector' ||
      normalizedBackendType === 'googledriveconnectorbackend') {
    return (
      <span title={`Backend: ${backendType}`}>
        <FolderCloudIcon className="h-4 w-4 flex-shrink-0" />
      </span>
    );
  }
  
  if (normalizedBackendType.includes('local')) {
    return (
      <span title={`Backend: ${backendType}`}>
        <HardDrive className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </span>
    );
  }

  if (normalizedBackendType.includes('gmail')) {
    return (
      <span title={`Backend: ${backendType}`}>
        <Mail className="h-4 w-4 text-red-500 flex-shrink-0" />
      </span>
    );
  }
  
  // Default fallback
  return (
    <span title={`Backend: ${backendType}`}>
      <Database className="h-4 w-4 text-purple-400 flex-shrink-0" />
    </span>
  );
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
  selectedPaths?: Set<string>;
  onToggleSelect?: (file: FileInfo, parentPath: string) => void;
  onRangeSelect?: (parentPath: string, orderedSiblings: FileInfo[], targetPath: string) => void;
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
  connectors?: import('../types/file').ConnectorInfo[];
  selectedPaths?: Set<string>;
  onToggleSelect?: (file: FileInfo, parentPath: string) => void;
  onRangeSelect?: (parentPath: string, orderedSiblings: FileInfo[], targetPath: string) => void;
  selectionMode?: boolean;
  parentPath?: string;
  siblingsInParent?: FileInfo[];
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
  connectors,
  selectedPaths,
  onToggleSelect,
  onRangeSelect,
  selectionMode,
  parentPath,
  siblingsInParent,
}: TreeNodeProps) {
  const queryClient = useQueryClient();
  const { apiClient } = useAuth();
  const filesAPI = useMemo(() => createFilesAPI(apiClient), [apiClient]);
  const [isExpanded, setIsExpanded] = useState(currentPath.startsWith(path) || path === '/');
  const [isSyncing, setIsSyncing] = useState(false);

  // Use regular file listing for all paths
  const { data: rawFiles, isLoading } = useFileList(path, isExpanded);

  // Handle sync connector - call actual sync_mount API
  const handleSyncConnector = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent expanding/collapsing the folder

    setIsSyncing(true);
    try {
      // Call the sync_mount API
      const result = await filesAPI.syncConnector(path, true, false);

      console.log('Sync connector result:', result);

      // Invalidate all file list queries for this path and subdirectories
      // This will refresh the file tree to show newly synced files
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
      await queryClient.invalidateQueries({ queryKey: fileKeys.connectors() });

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

  // Enrich files with connector information if connectors are available
  const files = useMemo(() => {
    if (!rawFiles || !connectors) return rawFiles;
    return rawFiles.map((file) => enrichFileWithConnector(file, connectors));
  }, [rawFiles, connectors]);

  const isActive = currentPath === path;

  // Filter directories and files based on search results
  const directories = useMemo(() => {
    const allDirs = files?.filter((f) => f.isDirectory && !isDotFile(f.name)) || [];

    // If no search is active, show all directories
    if (!searchResults || !relevantPaths) {
      return allDirs;
    }

    // Only show directories that are in the relevant paths
    return allDirs.filter((dir) => relevantPaths.has(dir.path));
  }, [files, searchResults, relevantPaths]);

  const fileItems = useMemo(() => {
    return files?.filter((f) => !f.isDirectory && !isParsedFile(f.name) && !isDotFile(f.name)) || [];
  }, [files]);

  const siblingsInThisFolder = useMemo(() => {
    // Order matches what the UI renders: directories first, then files
    return [...directories, ...fileItems];
  }, [directories, fileItems]);

  const dirFileInfo: FileInfo = {
    path,
    name,
    isDirectory: true,
    backendType,
  };
  const isSelected = !!selectedPaths?.has(path);
  const checkboxContextParent = parentPath ?? path;
  const checkboxContextSiblings = siblingsInParent ?? siblingsInThisFolder;

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
          <input
            type="checkbox"
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              // Shift+click selects range between last anchor and current within the same folder list
              if ((e as any).nativeEvent?.shiftKey) {
                onRangeSelect?.(checkboxContextParent, checkboxContextSiblings, path);
                return;
              }
              onToggleSelect?.(dirFileInfo, checkboxContextParent);
            }}
            className={cn(
              'h-3.5 w-3.5 mr-1',
              selectionMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
            aria-label={`Select ${name}`}
          />
          {/* Always show arrow for directories, even if children haven't loaded yet */}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0" />
          )}
          {getFolderIcon(dirFileInfo.backendType, isExpanded)}
          <span className="truncate">{name}</span>
          {backendType && backendType !== 'LocalBackend' && (
            <button
              onClick={handleSyncConnector}
              disabled={isSyncing}
              className="ml-auto opacity-0 group-hover:opacity-100 hover:bg-muted p-1 rounded transition-opacity"
              title="Sync connector"
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
              connectors={connectors}
              selectedPaths={selectedPaths}
              onToggleSelect={onToggleSelect}
              onRangeSelect={onRangeSelect}
              selectionMode={selectionMode}
              parentPath={path}
              siblingsInParent={siblingsInThisFolder}
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
                className="group flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-muted/50 rounded-md transition-colors overflow-hidden"
                style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
                onClick={() => onFileClick?.(file)}
              >
                <input
                  type="checkbox"
                  checked={!!selectedPaths?.has(file.path)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    // Shift+click selects range within this folder
                    if ((e as any).nativeEvent?.shiftKey) {
                      onRangeSelect?.(path, siblingsInThisFolder, file.path);
                      return;
                    }
                    onToggleSelect?.(file, path);
                  }}
                  className={cn(
                    'h-3.5 w-3.5 mr-1',
                    selectionMode || selectedPaths?.has(file.path) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                  aria-label={`Select ${file.name}`}
                />
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
  selectedPaths,
  onToggleSelect,
  onRangeSelect,
}: FileTreeProps) {
  // Fetch connectors once globally
  const { data: connectors } = useConnectors();

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
        connectors={connectors}
        selectedPaths={selectedPaths}
        onToggleSelect={onToggleSelect}
        onRangeSelect={onRangeSelect}
        selectionMode={(selectedPaths?.size || 0) > 0}
      />
    </div>
  );
}
