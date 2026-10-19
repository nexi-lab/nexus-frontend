import { Copy, Download, Edit, File, FileText, FolderPlus, type LucideIcon, Search, Shield, Trash2, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { FileInfo } from '../types/file';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from './ui/context-menu';

export type ContextMenuAction =
  | 'find-in-folder'
  | 'new-file'
  | 'new-folder'
  | 'upload'
  | 'open'
  | 'download'
  | 'rename'
  | 'delete'
  | 'copy-path'
  | 'manage-permissions';

interface FileContextMenuProps {
  children: ReactNode;
  file: FileInfo;
  onAction: (action: ContextMenuAction, file: FileInfo) => void;
}

export function FileContextMenu({ children, file, onAction }: FileContextMenuProps) {
  const { userInfo } = useAuth();
  const primary: Array<[ContextMenuAction, string, LucideIcon]> = file.isDirectory
    ? [
        ['find-in-folder', 'Find in Folder', Search],
        ['new-file', 'New File', FileText],
        ['new-folder', 'New Folder', FolderPlus],
        ['upload', 'Upload Files', Upload],
      ]
    : [
        ['open', 'Open', File],
        ['download', 'Download', Download],
      ];
  const common: Array<[ContextMenuAction, string, LucideIcon]> = [
    ['rename', 'Rename', Edit],
    ['copy-path', 'Copy Path', Copy],
  ];
  if (userInfo?.is_admin) common.push(['manage-permissions', 'Manage Permissions', Shield]);
  common.push(['delete', 'Delete', Trash2]);
  const items = (actions: typeof primary) =>
    actions.map(([action, label, Icon]) => (
      <ContextMenuItem key={action} onClick={() => onAction(action, file)}>
        <Icon className="mr-2 h-4 w-4" />
        {label}
      </ContextMenuItem>
    ));
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {items(primary)}
        <ContextMenuSeparator />
        {items(common)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
