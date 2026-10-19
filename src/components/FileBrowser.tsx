import { Settings } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type NexusAPIClient from '../api/client';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { useCreateDirectory, useDeleteFile, useUploadFile } from '../hooks/useFiles';
import { useTranslation } from '../i18n/useTranslation';
import type { FileInfo } from '../types/file';
import { copyToClipboard } from '../utils';
import { isWithinPath, renamedPath } from '../utils/vfsPaths';
import { Breadcrumb } from './Breadcrumb';
import { FileContentViewer } from './FileContentViewer';
import type { ContextMenuAction } from './FileContextMenu';
import { FileUpload } from './FileUpload';
import { LanguageSelector } from './LanguageSelector';
import { LeftPanel } from './LeftPanel';
import { ManagePermissionsDialog } from './ManagePermissionsDialog';
import { NexusConnection } from './NexusConnection';
import { RenameDialog } from './RenameDialog';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './ui/button';

export function FileBrowser() {
  return <NexusConnection>{(apiClient) => <ConnectedFileBrowser apiClient={apiClient} />}</NexusConnection>;
}

function ConnectedFileBrowser({ apiClient }: { apiClient: NexusAPIClient }) {
  const navigate = useNavigate();
  const { logout, apiUrl, userInfo } = useAuth();
  const { t } = useTranslation();
  const filesAPI = useMemo(() => createFilesAPI(apiClient), [apiClient]);
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [renameFile, setRenameFile] = useState<FileInfo | null>(null);
  const [permissionFile, setPermissionFile] = useState<FileInfo | null>(null);
  const [creating, setCreating] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null);
  const deleteFile = useDeleteFile();
  const uploadFile = useUploadFile();
  const createDirectory = useCreateDirectory();

  const handleDeleted = (paths: string[]) => {
    setSelectedFile((selected) => (selected && paths.some((root) => isWithinPath(selected.path, root)) ? null : selected));
    setCurrentPath((path) => {
      const deleted = paths.find((root) => isWithinPath(path, root));
      return deleted ? deleted.substring(0, deleted.lastIndexOf('/')) || '/' : path;
    });
  };

  const handleCreate = async (path: string, type: 'file' | 'folder') => {
    try {
      if (type === 'folder') await createDirectory.mutateAsync({ path });
      else {
        await uploadFile.mutateAsync({ path, content: new ArrayBuffer(0) });
        setSelectedFile({ path, name: path.split('/').pop() || path, isDirectory: false });
      }
      setCreating(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to create ${type}`);
    }
  };

  const handleAction = async (action: ContextMenuAction, file: FileInfo) => {
    try {
      switch (action) {
        case 'open':
          if (!file.isDirectory) setSelectedFile(file);
          break;
        case 'download': {
          const content = await filesAPI.read(file.path);
          const url = URL.createObjectURL(new Blob([content as unknown as BlobPart], { type: 'application/octet-stream' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          break;
        }
        case 'rename':
          setRenameFile(file);
          break;
        case 'delete':
          if (!window.confirm(`Are you sure you want to delete ${file.name}?`)) break;
          await deleteFile.mutateAsync({ path: file.path, isDirectory: file.isDirectory });
          handleDeleted([file.path]);
          break;
        case 'copy-path':
          await copyToClipboard(file.path);
          break;
        case 'new-file':
        case 'new-folder':
          setCreating({ type: action === 'new-file' ? 'file' : 'folder', parentPath: file.path });
          break;
        case 'upload':
          setUploadTarget(file.path);
          break;
        case 'manage-permissions':
          if (userInfo?.is_admin) setPermissionFile(file);
          break;
        case 'find-in-folder':
          break;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'File operation failed');
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="relative z-50 border-b bg-background">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Nexus Logo" className="h-10 w-10" />
            <h1 className="text-2xl font-bold">{t('landing.nexus')}</h1>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <span className="min-w-0 break-all text-sm text-muted-foreground">
              {userInfo?.subject_id} {userInfo?.zone_id && `| ${userInfo.zone_id}`} {apiUrl && `| Nexus: ${apiUrl}`}
            </span>
            {userInfo?.is_admin && (
              <Button variant="ghost" onClick={() => navigate('/admin')}>
                <Settings className="mr-2 h-4 w-4" />
                {t('landing.admin')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate('/settings')}>
              Connection
            </Button>
            <Button variant="ghost" onClick={() => navigate('/account')}>
              Account
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              {t('common.logout')}
            </Button>
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="border-b bg-muted/20 px-4 py-2">
        <Breadcrumb path={currentPath} onPathChange={setCurrentPath} />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={20} minSize={15} maxSize={40}>
            <LeftPanel
              currentPath={currentPath}
              onPathChange={setCurrentPath}
              onFileSelect={(file) => (file.isDirectory ? setCurrentPath(file.path) : setSelectedFile(file))}
              onPathsDeleted={handleDeleted}
              onContextMenuAction={handleAction}
              creatingNewItem={creating}
              onCreateItem={handleCreate}
              onCancelCreate={() => setCreating(null)}
            />
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-blue-500" />
          <Panel defaultSize={80} minSize={50}>
            <FileContentViewer file={selectedFile} onFileDeleted={(path) => handleDeleted([path])} />
          </Panel>
        </PanelGroup>
      </div>
      <footer className="border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <a href="https://github.com/nexi-lab/nexus" target="_blank" rel="noopener noreferrer">
          {t('landing.docs')}
        </a>
      </footer>
      <FileUpload open={uploadTarget !== null} onOpenChange={(open) => !open && setUploadTarget(null)} currentPath={uploadTarget ?? '/'} />
      <RenameDialog
        open={!!renameFile}
        onOpenChange={(open) => !open && setRenameFile(null)}
        file={renameFile}
        onRenamed={(oldPath, newPath) => {
          setCurrentPath((path) => renamedPath(path, oldPath, newPath));
          setSelectedFile((file) => {
            if (!file || !isWithinPath(file.path, oldPath)) return file;
            const path = renamedPath(file.path, oldPath, newPath);
            return { ...file, path, name: path.split('/').pop() || path };
          });
        }}
      />
      {userInfo?.is_admin && permissionFile && (
        <ManagePermissionsDialog open onOpenChange={(open) => !open && setPermissionFile(null)} filePath={permissionFile.path} />
      )}
    </div>
  );
}
