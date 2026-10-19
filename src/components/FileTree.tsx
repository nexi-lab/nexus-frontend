import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fileKeys, useFileList } from '../hooks/useFiles';
import { cn } from '../lib/utils';
import type { FileInfo } from '../types/file';
import { isWithinPath } from '../utils/vfsPaths';
import { type ContextMenuAction, FileContextMenu } from './FileContextMenu';
import { InlineFileInput } from './InlineFileInput';

interface FileTreeProps {
  currentPath: string;
  onPathChange: (path: string) => void;
  onFileClick?: (file: FileInfo) => void;
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void;
  creatingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null;
  onCreateItem?: (path: string, type: 'file' | 'folder') => void;
  onCancelCreate?: () => void;
  selectedPaths?: Set<string>;
  onToggleSelect?: (file: FileInfo, parent: string) => void;
  onRangeSelect?: (parent: string, siblings: FileInfo[], path: string) => void;
}

function TreeNode({
  file,
  parent,
  siblings,
  level,
  ...props
}: FileTreeProps & {
  file: FileInfo;
  parent: string;
  siblings: FileInfo[];
  level: number;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(file.path === '/' || isWithinPath(props.currentPath, file.path));
  const { data, isLoading, error } = useFileList(file.path, file.isDirectory && expanded);
  const children = useMemo(
    () =>
      (data ?? [])
        .filter((entry) => !entry.name.startsWith('.'))
        .sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name)),
    [data],
  );
  useEffect(() => {
    if (props.creatingNewItem?.parentPath === file.path) setExpanded(true);
  }, [props.creatingNewItem?.parentPath, file.path]);
  const selected = props.selectedPaths?.has(file.path) ?? false;
  const creating = props.creatingNewItem;

  return (
    <div>
      <FileContextMenu file={file} onAction={(action, target) => props.onContextMenuAction?.(action, target)}>
        <div
          className={cn(
            'group flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm hover:bg-muted/50',
            props.currentPath === file.path && 'bg-muted font-medium',
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (file.isDirectory) {
              setExpanded(!expanded);
              props.onPathChange(file.path);
              if (!expanded) void queryClient.invalidateQueries({ queryKey: fileKeys.list(file.path) });
            } else props.onFileClick?.(file);
          }}
        >
          <input
            type="checkbox"
            aria-label={`Select ${file.name}`}
            checked={selected}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              if ((event.nativeEvent as MouseEvent).shiftKey) props.onRangeSelect?.(parent, siblings, file.path);
              else props.onToggleSelect?.(file, parent);
            }}
            className={cn('mr-1 h-3.5 w-3.5', selected || props.selectedPaths?.size ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
          />
          {file.isDirectory ? (
            <>
              {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              {expanded ? <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" /> : <Folder className="h-4 w-4 shrink-0 text-blue-500" />}
            </>
          ) : (
            <FileText className="ml-4 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{file.name}</span>
        </div>
      </FileContextMenu>
      {file.isDirectory && expanded && (
        <div>
          {isLoading && <output className="px-4 text-xs text-muted-foreground">Loading {file.path}...</output>}
          {error && (
            <div role="alert" className="px-4 py-2 text-sm text-destructive">
              Failed to list {file.path}: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          )}
          {children.map((child) => (
            <TreeNode key={child.path} {...props} file={child} parent={file.path} siblings={children} level={level + 1} />
          ))}
          {creating?.parentPath === file.path && (
            <InlineFileInput
              type={creating.type}
              level={level + 1}
              onConfirm={(name) => props.onCreateItem?.(`${file.path === '/' ? '' : file.path}/${name}`, creating.type)}
              onCancel={() => props.onCancelCreate?.()}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function FileTree(props: FileTreeProps) {
  const root: FileInfo = { path: '/', name: '/', isDirectory: true };
  return (
    <div className="h-full overflow-auto">
      <TreeNode {...props} file={root} parent="/" siblings={[root]} level={0} />
    </div>
  );
}
