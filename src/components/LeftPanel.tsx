import { useQueryClient } from '@tanstack/react-query';
import { Files, RefreshCw, Search, Trash2, Unplug, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys, useConnectors, useDeleteFile } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import type { ContextMenuAction } from './FileContextMenu';
import { FileTree } from './FileTree';
import { SearchBar } from './SearchBar';
import { Button } from './ui/button';

interface LeftPanelProps {
  currentPath: string;
  onPathChange: (path: string) => void;
  onFileSelect: (file: FileInfo) => void;
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void;
  creatingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null;
  onCreateItem?: (path: string, type: 'file' | 'folder') => void;
  onCancelCreate?: () => void;
}

export function LeftPanel({
  currentPath,
  onPathChange,
  onFileSelect,
  onContextMenuAction,
  creatingNewItem,
  onCreateItem,
  onCancelCreate,
}: LeftPanelProps) {
  const queryClient = useQueryClient();
  const { apiClient } = useAuth();
  const filesAPI = useMemo(() => createFilesAPI(apiClient), [apiClient]);
  const [activeTab, setActiveTab] = useState<'explorer' | 'search'>('explorer');
  const [searchFolderPath, setSearchFolderPath] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const deleteMutation = useDeleteFile();

  // Fetch active connectors to identify connector paths
  const { data: connectors = [] } = useConnectors();

  // Multi-select state (within explorer tree)
  const [selectedItems, setSelectedItems] = useState<Map<string, FileInfo>>(new Map());
  const [lastSelectedByParent, setLastSelectedByParent] = useState<Map<string, string>>(new Map());
  const selectedCount = selectedItems.size;

  const selectedPaths = useMemo(() => new Set(selectedItems.keys()), [selectedItems]);

  // Check if all selected items are connectors (root connector paths)
  const connectorPaths = useMemo(() => new Set(connectors.map(c => c.mount_point)), [connectors]);
  const selectedConnectors = useMemo(() => {
    const selected: FileInfo[] = [];
    for (const [path, file] of selectedItems.entries()) {
      if (connectorPaths.has(path)) {
        selected.push(file);
      }
    }
    return selected;
  }, [selectedItems, connectorPaths]);

  const hasOnlyConnectorsSelected = selectedCount > 0 && selectedConnectors.length === selectedCount;
  const hasConnectorsSelected = selectedConnectors.length > 0;

  const toggleSelect = (file: FileInfo, parentPath: string) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(file.path)) next.delete(file.path);
      else next.set(file.path, file);
      return next;
    });
    setLastSelectedByParent((prev) => {
      const next = new Map(prev);
      next.set(parentPath, file.path);
      return next;
    });
  };

  const rangeSelect = (parentPath: string, orderedSiblings: FileInfo[], targetPath: string) => {
    const anchorPath = lastSelectedByParent.get(parentPath) ?? targetPath;
    const startIndex = orderedSiblings.findIndex((f) => f.path === anchorPath);
    const endIndex = orderedSiblings.findIndex((f) => f.path === targetPath);

    if (startIndex === -1 || endIndex === -1) {
      // Fallback: behave like a normal toggle anchored at target
      const target = orderedSiblings.find((f) => f.path === targetPath);
      if (target) toggleSelect(target, parentPath);
      return;
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const slice = orderedSiblings.slice(from, to + 1);

    setSelectedItems((prev) => {
      const next = new Map(prev);
      for (const f of slice) {
        next.set(f.path, f);
      }
      return next;
    });

    setLastSelectedByParent((prev) => {
      const next = new Map(prev);
      next.set(parentPath, targetPath);
      return next;
    });
  };

  const clearSelection = () => setSelectedItems(new Map());

  const handleDisconnectConnectors = async () => {
    if (selectedConnectors.length === 0) return;
    const count = selectedConnectors.length;
    const connectorNames = selectedConnectors.map(c => c.name).join(', ');

    if (!window.confirm(
      `Disconnect ${count} connector${count === 1 ? '' : 's'}?\n\n${connectorNames}\n\n` +
      'This will:\n' +
      '- Deactivate the connector(s)\n' +
      '- Delete the connector directory and all its contents\n' +
      '- Remove the saved connector configuration\n\n' +
      'This action cannot be undone.'
    )) {
      return;
    }

    setIsDisconnecting(true);
    const errors: Array<{ path: string; error: unknown }> = [];

    for (const connector of selectedConnectors) {
      try {
        await filesAPI.deleteConnector(connector.path);
      } catch (err) {
        errors.push({ path: connector.path, error: err });
      }
    }

    // Invalidate queries to refresh UI
    await queryClient.invalidateQueries({ queryKey: ['saved_connectors'] });
    await queryClient.invalidateQueries({ queryKey: fileKeys.connectors() });
    await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });

    setIsDisconnecting(false);

    if (errors.length > 0) {
      console.error('Batch disconnect errors:', errors);
      toast.error(`Disconnected with errors: ${errors.length} connector${errors.length === 1 ? '' : 's'} failed`);
    } else {
      toast.success(`Disconnected ${count} connector${count === 1 ? '' : 's'}`);
    }

    clearSelection();
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    const count = selectedItems.size;
    if (!window.confirm(`Delete ${count} item${count === 1 ? '' : 's'}?\n\nThis will permanently delete the selected files/folders.`)) {
      return;
    }

    const items = Array.from(selectedItems.values()).sort((a, b) => b.path.length - a.path.length);
    const errors: Array<{ path: string; error: unknown }> = [];

    for (const item of items) {
      try {
        await deleteMutation.mutateAsync({ path: item.path, isDirectory: item.isDirectory });
      } catch (err) {
        errors.push({ path: item.path, error: err });
      }
    }

    await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });

    if (errors.length > 0) {
      console.error('Batch delete errors:', errors);
      toast.error(`Deleted with errors: ${errors.length} item${errors.length === 1 ? '' : 's'} failed`);
    } else {
      toast.success(`Deleted ${count} item${count === 1 ? '' : 's'}`);
    }

    clearSelection();
  };

  // Refresh file tree
  const handleRefreshFileTree = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate all file list queries to force refetch
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
      // Invalidate connectors to refetch connector roots and update cloud icons
      await queryClient.invalidateQueries({ queryKey: fileKeys.connectors() });
    } finally {
      // Add a small delay for visual feedback
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleContextMenuAction = (action: ContextMenuAction, file: FileInfo) => {
    if (action === 'find-in-folder' && file.isDirectory) {
      // Switch to search tab and set the folder context
      setActiveTab('search');
      setSearchFolderPath(file.path);
    }
    // Pass all actions to parent
    onContextMenuAction?.(action, file);
  };

  return (
    <div className="w-full border-r bg-muted/20 flex flex-col h-full">
      {/* Tab Header */}
      <div className="border-b bg-background/95 flex">
        <button
          type='button'
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'explorer'
              ? 'bg-background border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
          onClick={() => setActiveTab('explorer')}
        >
          <Files className="h-4 w-4" />
          Explorer
        </button>
        <button 
          type='button'
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'search' ? 'bg-background border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
          onClick={() => setActiveTab('search')}
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'explorer' ? (
          <div className="h-full flex flex-col">
            {/* Refresh button for explorer */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Files</span>
                {selectedCount > 0 && (
                  <span className="text-xs text-muted-foreground">({selectedCount} selected)</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {selectedCount > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={clearSelection}
                      title="Clear selection"
                      type="button"
                      className="h-7 w-7"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    {hasOnlyConnectorsSelected ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDisconnectConnectors}
                        title={`Disconnect ${selectedConnectors.length} connector${selectedConnectors.length === 1 ? '' : 's'}`}
                        type="button"
                        className="h-7 w-7"
                        disabled={isDisconnecting}
                      >
                        <Unplug className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    ) : hasConnectorsSelected ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleDisconnectConnectors}
                          title={`Disconnect ${selectedConnectors.length} connector${selectedConnectors.length === 1 ? '' : 's'}`}
                          type="button"
                          className="h-7 w-7"
                          disabled={isDisconnecting}
                        >
                          <Unplug className="h-3.5 w-3.5 text-orange-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleDeleteSelected}
                          title="Delete non-connector items"
                          type="button"
                          className="h-7 w-7"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDeleteSelected}
                        title="Delete selected"
                        type="button"
                        className="h-7 w-7"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </>
                )}
                <button
                  onClick={handleRefreshFileTree}
                  disabled={isRefreshing}
                  className="p-1 hover:bg-muted rounded transition-colors disabled:opacity-50"
                  title="Refresh file tree"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground hover:text-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <FileTree
                currentPath={currentPath}
                onPathChange={(path) => {
                  onPathChange(path);
                  // When a directory is clicked in tree, we just navigate to it
                  // Don't select it for viewing
                }}
                onFileClick={onFileSelect}
                onContextMenuAction={handleContextMenuAction}
                creatingNewItem={creatingNewItem}
                onCreateItem={onCreateItem}
                onCancelCreate={onCancelCreate}
                selectedPaths={selectedPaths}
                onToggleSelect={toggleSelect}
                onRangeSelect={rangeSelect}
              />
            </div>
          </div>
        ) : (
          <SearchBar currentPath={searchFolderPath || currentPath} onFileSelect={onFileSelect} onContextMenuAction={handleContextMenuAction} />
        )}
      </div>
    </div>
  );
}
