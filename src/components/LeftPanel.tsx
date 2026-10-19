import { useQueryClient } from '@tanstack/react-query';
import { Files, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { fileKeys, useDeleteFile } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import { isWithinPath } from '../utils/vfsPaths';
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
  onPathsDeleted?: (paths: string[]) => void;
}

export function LeftPanel({ onFileSelect, onContextMenuAction, onPathsDeleted, ...props }: LeftPanelProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'explorer' | 'search'>('explorer');
  const [searchPath, setSearchPath] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, FileInfo>>(new Map());
  const [anchors, setAnchors] = useState<Map<string, string>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const deleteFile = useDeleteFile();
  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
    } finally {
      setRefreshing(false);
    }
  };
  const removeSelected = async () => {
    if (!window.confirm(`Delete ${selected.size} selected items?`)) return;
    const directories = new Set([...selected.values()].filter((item) => item.isDirectory).map((item) => item.path));
    const roots = [...selected.values()].filter((item) => {
      let parent = item.path;
      while (parent !== '/') {
        parent = parent.slice(0, parent.lastIndexOf('/')) || '/';
        if (directories.has(parent)) return false;
      }
      return true;
    });
    const deleted: string[] = [];
    for (const item of roots) {
      try {
        await deleteFile.mutateAsync({ path: item.path, isDirectory: item.isDirectory });
        deleted.push(item.path);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Failed to delete ${item.name}`);
      }
    }
    setSelected((previous) => new Map([...previous].filter(([path]) => !deleted.some((root) => isWithinPath(path, root)))));
    onPathsDeleted?.(deleted);
  };
  const handleAction = (action: ContextMenuAction, file: FileInfo) => {
    if (action === 'find-in-folder') {
      setSearchPath(file.path);
      setTab('search');
    }
    onContextMenuAction?.(action, file);
  };

  return (
    <div className="flex h-full w-full flex-col border-r bg-muted/20">
      <div className="flex border-b bg-background">
        <button type="button" className="flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm" onClick={() => setTab('explorer')}>
          <Files className="h-4 w-4" />
          Explorer
        </button>
        <button type="button" className="flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm" onClick={() => setTab('search')}>
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'explorer' ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b bg-background/50 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Files {selected.size > 0 && `(${selected.size} selected)`}</span>
              <div className="flex items-center gap-1">
                {selected.size > 0 && (
                  <>
                    <Button variant="ghost" size="icon" title="Clear selection" onClick={() => setSelected(new Map())}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete selected" onClick={removeSelected} disabled={deleteFile.isPending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <button type="button" title="Refresh file tree" disabled={refreshing} onClick={refresh}>
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <FileTree
                {...props}
                onFileClick={onFileSelect}
                onContextMenuAction={handleAction}
                selectedPaths={new Set(selected.keys())}
                onToggleSelect={(file, parent) => {
                  setSelected((previous) => {
                    const next = new Map(previous);
                    if (next.has(file.path)) next.delete(file.path);
                    else next.set(file.path, file);
                    return next;
                  });
                  setAnchors((previous) => new Map(previous).set(parent, file.path));
                }}
                onRangeSelect={(parent, siblings, target) => {
                  const from = siblings.findIndex((file) => file.path === (anchors.get(parent) ?? target));
                  const to = siblings.findIndex((file) => file.path === target);
                  if (from < 0 || to < 0) return;
                  setSelected(
                    (previous) =>
                      new Map([...previous, ...siblings.slice(Math.min(from, to), Math.max(from, to) + 1).map((file) => [file.path, file] as const)]),
                  );
                  setAnchors((previous) => new Map(previous).set(parent, target));
                }}
              />
            </div>
          </div>
        ) : (
          <SearchBar currentPath={searchPath ?? props.currentPath} onFileSelect={onFileSelect} onContextMenuAction={handleAction} />
        )}
      </div>
    </div>
  );
}
