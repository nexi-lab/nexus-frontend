import { Cloud, Copy, Download, Edit, File, FileText, FolderPlus, History, Search, Shield, Trash2, Upload, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FileInfo } from '../types/file';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from './ui/context-menu';

export type ContextMenuAction =
  | 'find-in-folder'
  | 'new-file'
  | 'new-folder'
  | 'upload'
  | 'open'
  | 'download'
  | 'version-history'
  | 'rename'
  | 'delete'
  | 'copy-path'
  | 'copy-relative-path'
  | 'manage-permissions'
  | 'add-mount'
  | 'remove-mount';

interface FileContextMenuProps {
  children: ReactNode;
  file: FileInfo;
  onAction: (action: ContextMenuAction, file: FileInfo) => void;
}

export function FileContextMenu({ children, file, onAction }: FileContextMenuProps) {
  const handleAction = (action: ContextMenuAction) => {
    onAction(action, file);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {file.isDirectory ? (
          // Folder context menu
          <>
            <ContextMenuItem onClick={() => handleAction('find-in-folder')}>
              <Search className="mr-2 h-4 w-4" />
              Find in Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleAction('new-file')}>
              <FileText className="mr-2 h-4 w-4" />
              New File
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAction('new-folder')}>
              <FolderPlus className="mr-2 h-4 w-4" />
              New Folder
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAction('upload')}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Files
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleAction('add-mount')}>
              <Cloud className="mr-2 h-4 w-4" />
              Add Mount Here
            </ContextMenuItem>
            {file.backendType && file.backendType !== 'LocalBackend' && (
              <ContextMenuItem onClick={() => handleAction('remove-mount')}>
                <XCircle className="mr-2 h-4 w-4" />
                Remove Mount
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleAction('rename')}>
              <Edit className="mr-2 h-4 w-4" />
              Rename
              <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAction('copy-path')}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Path
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleAction('manage-permissions')}>
              <Shield className="mr-2 h-4 w-4" />
              Manage Permissions
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleAction('delete')}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : (
          // File context menu
          <>
            <ContextMenuItem onClick={() => handleAction('open')}>
              <File className="mr-2 h-4 w-4" />
              Open
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAction('download')}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAction('version-history')}>
              <History className="mr-2 h-4 w-4" />
              Version History
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleAction('rename')}>
              <Edit className="mr-2 h-4 w-4" />
              Rename
              <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleAction('copy-path')}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Path
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleAction('manage-permissions')}>
              <Shield className="mr-2 h-4 w-4" />
              Manage Permissions
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleAction('delete')}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
