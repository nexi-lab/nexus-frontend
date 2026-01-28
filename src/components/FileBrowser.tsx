import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BookOpen, Bot, Brain, Cloud, FileText, FolderPlus, MessageSquare, Settings } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import { AuthenticationError } from '../api/client';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys, useConnectors, useCreateDirectory, useDeleteFile, useFileList, useUploadFile } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import { copyToClipboard } from '../utils';
import { createSkillZipFromDirectory } from '../utils/skillPackaging';
import { Breadcrumb } from './Breadcrumb';
import { ChatPanel } from './ChatPanel';
import { CreateFolderDialog } from './CreateFolderDialog';
import { FileContentViewer } from './FileContentViewer';
import type { ContextMenuAction } from './FileContextMenu';
import { FileUpload } from './FileUpload';
import { FileVersionHistoryDialog } from './FileVersionHistoryDialog';
import { LeftPanel } from './LeftPanel';
import { ManagePermissionsDialog } from './ManagePermissionsDialog';
import { ConnectorManagementDialog } from './ConnectorManagementDialog';
import { RenameDialog } from './RenameDialog';
import { StoreMemoryDialog } from './StoreMemoryDialog';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './ui/button';
import { useTranslation } from '../i18n/useTranslation';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';

export function FileBrowser() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, isUserAuthenticated, logout, apiClient, apiUrl, userInfo, userAccount, userLogout } = useAuth();
  
  if (!apiClient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium mb-2">API client not initialized</p>
          <p>Please configure your connection in the login page.</p>
        </div>
      </div>
    );
  }
  
  const { t } = useTranslation();
  const filesAPI = useMemo(() => createFilesAPI(apiClient), [apiClient]);
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadTargetPath, setUploadTargetPath] = useState<string>('/');
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [storeMemoryDialogOpen, setStoreMemoryDialogOpen] = useState(false);
  const [connectorManagementDialogOpen, setConnectorManagementDialogOpen] = useState(false);
  const [renameFile, setRenameFile] = useState<FileInfo | null>(null);
  const [managePermissionsFile, setManagePermissionsFile] = useState<FileInfo | null>(null);
  const [versionHistoryFile, setVersionHistoryFile] = useState<FileInfo | null>(null);
  const [creatingNewItem, setCreatingNewItem] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null);
  const [initialSelectedAgentId, setInitialSelectedAgentId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'file' | 'chat'>('file');

  const deleteMutation = useDeleteFile();
  const uploadMutation = useUploadFile();
  const createDirMutation = useCreateDirectory();
  
  // Check for authentication errors on initial load
  const { error: rootError, refetch: refetchRoot } = useFileList('/', true);
  const { error: connectorsError } = useConnectors(true);
  const authError = rootError instanceof AuthenticationError ? rootError : (connectorsError instanceof AuthenticationError ? connectorsError : null);

  // Check if user is provisioned by checking if any workspace exists
  // Use listWorkspaces() API instead of checking root files, since workspaces
  // are created at /tenant:{tenant_id}/user:{user_id}/workspace/{workspace_id}
  const { data: workspaces, isLoading: loadingWorkspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      if (!apiClient) return [];
      try {
        return await apiClient.listWorkspaces();
      } catch (error) {
        // If API call fails, assume no workspaces (will show setup)
        console.warn('Failed to list workspaces:', error);
        return [];
      }
    },
    enabled: !!(isAuthenticated || isUserAuthenticated) && !!apiClient && !!userInfo,
    staleTime: 30 * 1000, // 30 seconds
  });

  const isProvisioned = useMemo(() => {
    if (!userInfo) return true; // Assume provisioned while loading
    if (loadingWorkspaces) return true; // Assume provisioned while loading workspaces
    
    // User is provisioned if they have at least one workspace
    return workspaces && workspaces.length > 0;
  }, [workspaces, loadingWorkspaces, userInfo]);

  const [needsProvisioning, setNeedsProvisioning] = useState(false);

  useEffect(() => {
    // Only show provisioning if authenticated, workspaces loaded, and not provisioned
    if ((isAuthenticated || isUserAuthenticated) && !loadingWorkspaces && !isProvisioned && userInfo) {
      setNeedsProvisioning(true);
    } else {
      setNeedsProvisioning(false);
    }
  }, [isAuthenticated, isUserAuthenticated, loadingWorkspaces, isProvisioned, userInfo]);

  const handleWorkspaceCreated = () => {
    // Refresh file list and reset provisioning state
    refetchRoot();
    queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
    queryClient.invalidateQueries({ queryKey: ['workspaces'] }); // Refresh workspaces list
    setNeedsProvisioning(false);
    toast.success('Your workspace is ready!');
  };

  // Handle agent selection from URL parameters
  useEffect(() => {
    const agentId = searchParams.get('agent');
    if (agentId) {
      setInitialSelectedAgentId(agentId);
      setViewMode('chat');
      // Clear the URL parameter
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleFileSelect = (file: FileInfo) => {
    setSelectedFile(file);
    // Auto-switch to File tab when a file is selected
    setViewMode('file');
  };

  const handleFileDeleted = () => {
    setSelectedFile(null);
  };

  const handleCreateItem = async (path: string, type: 'file' | 'folder') => {
    try {
      if (type === 'folder') {
        await createDirMutation.mutateAsync({ path });
      } else {
        // Create empty file
        const encoder = new TextEncoder();
        const emptyContent = encoder.encode('').buffer;
        await uploadMutation.mutateAsync({ path, content: emptyContent });

        // Open the newly created file
        const newFile: FileInfo = {
          path,
          name: path.split('/').pop() || '',
          isDirectory: false,
        };
        setSelectedFile(newFile);
      }
      setCreatingNewItem(null);
    } catch (error) {
      console.error('Failed to create item:', error);
      alert(`Failed to create ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setCreatingNewItem(null);
    }
  };

  const handleCancelCreate = () => {
    setCreatingNewItem(null);
  };

  const handleContextMenuAction = async (action: ContextMenuAction, file: FileInfo) => {
    switch (action) {
      case 'open':
        if (!file.isDirectory) {
          setSelectedFile(file);
        }
        break;

      case 'download':
        if (!file.isDirectory) {
          try {
            const content = await filesAPI.read(file.path);
            const blob = new Blob([content as unknown as BlobPart], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } catch (error) {
            console.error('Failed to download file:', error);
          }
        }
        break;

      case 'rename':
        setRenameFile(file);
        break;

      case 'delete':
        if (confirm(`Are you sure you want to delete ${file.name}?`)) {
          try {
            await deleteMutation.mutateAsync({
              path: file.path,
              isDirectory: file.isDirectory,
            });
            // Clear selected file if it was deleted
            if (selectedFile?.path === file.path) {
              setSelectedFile(null);
            }
          } catch (error) {
            console.error('Failed to delete:', error);
            alert(`Failed to delete ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        break;

      case 'copy-path':
        try {
          await copyToClipboard(file.path);
          // Could add a toast notification here
          console.log('Path copied to clipboard:', file.path);
        } catch (error) {
          console.error('Failed to copy path:', error);
        }
        break;

      case 'new-file':
        if (file.isDirectory) {
          setCreatingNewItem({ type: 'file', parentPath: file.path });
        }
        break;

      case 'new-folder':
        if (file.isDirectory) {
          setCreatingNewItem({ type: 'folder', parentPath: file.path });
        }
        break;

      case 'upload':
        if (file.isDirectory) {
          setUploadTargetPath(file.path);
          setUploadDialogOpen(true);
        }
        break;

      case 'find-in-folder':
        // This is handled by LeftPanel
        break;

      case 'version-history':
        if (!file.isDirectory) {
          setVersionHistoryFile(file);
        }
        break;

      case 'manage-permissions':
        setManagePermissionsFile(file);
        break;

      case 'add-connector':
        if (file.isDirectory) {
          setConnectorManagementDialogOpen(true);
        }
        break;

      case 'remove-connector':
        if (file.isDirectory && file.path) {
          if (confirm(`Are you sure you want to remove the connector at ${file.path}? This will also delete the connector directory and saved configuration.`)) {
            try {
              // Use the bundled delete_connector API
              await filesAPI.deleteConnector(file.path);
              console.log('Connector deleted successfully');

              // Invalidate queries to refresh the UI
              await queryClient.invalidateQueries({ queryKey: fileKeys.connectors() });
              await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
            } catch (error) {
              console.error('Failed to remove connector:', error);
              alert(`Failed to remove connector: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }
        break;

      case 'add-skill-to-personal':
        if (file.isDirectory && userInfo) {
          try {
            toast.info(`Reading skill metadata from "${file.name}"...`);

            // Create skill ZIP package from directory using shared utility
            const { zipBase64, skillName } = await createSkillZipFromDirectory(file.path, filesAPI);

            // Import to personal tier using the skills API
            toast.info(`Adding "${skillName}" to your personal skills...`);
            await apiClient.skillsImport({
              zip_data: zipBase64,
              tier: 'personal',
              allow_overwrite: false,
            });

            // Show success message
            toast.success(`Skill "${skillName}" has been added to your personal skills!`);

            // Invalidate skills cache and file list
            queryClient.invalidateQueries({ queryKey: ['skills'] });
            queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
          } catch (error) {
            console.error('Failed to add skill to personal:', error);
            toast.error(`Failed to add skill: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        break;

      default:
        console.log('Unhandled action:', action, file);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Global Authentication Error Banner */}
      {authError && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">{t('landing.authError')}</p>
                <p className="text-xs text-destructive/80">{authError.message}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Use appropriate logout function
                if (isUserAuthenticated) {
                  userLogout();
                } else {
                  logout();
                }
                navigate('/login');
              }}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {t('landing.updateApiKey')}
            </Button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="relative z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4 flex-1">
            <img src="/logo.png" alt="Nexus Logo" className="h-10 w-10" />
            <h1 className="text-2xl font-bold">{t('landing.nexus')}</h1>
          </div>
          <div className="flex gap-2 items-center">
            {(isAuthenticated || isUserAuthenticated) ? (
              <>
                {/* Show user info from OAuth account or API key auth */}
                {(userAccount?.email || userInfo?.user) && (
                  <span className="text-sm text-muted-foreground mr-2">
                    <span className="font-medium">{t('landing.user')}:</span> {userAccount?.email || userInfo?.user}
                    {(userAccount?.tenant_id || userInfo?.tenant_id) && (
                      <>
                        <span className="mx-2">|</span>
                        <span className="font-medium">{t('landing.tenant')}:</span> {userAccount?.tenant_id || userInfo?.tenant_id}
                      </>
                    )}
                    {apiUrl && (
                      <>
                        <span className="mx-2">|</span>
                        <span className="font-medium">Nexus:</span> {apiUrl}
                      </>
                    )}
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={() => navigate('/workspace')}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  {t('landing.workspace')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/memory')}>
                  <Brain className="h-4 w-4 mr-2" />
                  {t('landing.memory')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/agent')}>
                  <Bot className="h-4 w-4 mr-2" />
                  {t('landing.agent')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/connector')}>
                  <Cloud className="h-4 w-4 mr-2" />
                  {t('landing.connector')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/skills')}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  {t('landing.skill')}
                </Button>
                {(userAccount?.is_global_admin || userInfo?.is_admin) && (
                  <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
                    <Settings className="h-4 w-4 mr-2" />
                    {t('landing.admin')}
                  </Button>
                )}
                {/* Settings button hidden */}
                <Button
                  variant="outline"
                  onClick={() => {
                    // Use appropriate logout function
                    if (isUserAuthenticated) {
                      userLogout();
                    } else {
                      logout();
                    }
                    navigate('/login');
                  }}
                >
                  {t('common.logout')}
                </Button>
              </>
            ) : (
              <Button onClick={() => navigate('/login')}>{t('common.login')}</Button>
            )}
            <LanguageSelector />
            <ThemeToggle />
            <Button variant="ghost" size="icon" asChild>
              <a href="https://github.com/nexi-lab/nexus" target="_blank" rel="noopener noreferrer" aria-label="View on GitHub">
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Breadcrumb and View Mode Toggle */}
      <div className="border-b px-4 py-2 bg-muted/20 flex items-center justify-between gap-3">
        <Breadcrumb path={currentPath} onPathChange={setCurrentPath} />
        <div className="flex items-center gap-2">
          {/* View Mode Toggle - File/Chat tabs */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
            <Button
              variant={viewMode === 'file' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('file')}
              className="gap-2 h-8"
            >
              <FileText className="h-4 w-4" />
              File
            </Button>
            <Button
              variant={viewMode === 'chat' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('chat')}
              className="gap-2 h-8"
            >
              <MessageSquare className="h-4 w-4" />
              Chat
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Panel - File Tree + Search */}
          <Panel defaultSize={20} minSize={15} maxSize={40}>
            <LeftPanel
              currentPath={currentPath}
              onPathChange={setCurrentPath}
              onFileSelect={handleFileSelect}
              onContextMenuAction={handleContextMenuAction}
              creatingNewItem={creatingNewItem}
              onCreateItem={handleCreateItem}
              onCancelCreate={handleCancelCreate}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-blue-500 transition-colors" />

          {/* Main Panel - File Content Viewer or Chat based on viewMode */}
          <Panel defaultSize={80} minSize={50}>
            {viewMode === 'file' ? (
              // File View
              needsProvisioning && !selectedFile ? (
                <WorkspaceEmptyState onWorkspaceCreated={handleWorkspaceCreated} />
              ) : (
                <FileContentViewer file={selectedFile} onFileDeleted={handleFileDeleted} />
              )
            ) : (
              // Chat View
              <ChatPanel
                isOpen={true}
                onClose={() => setViewMode('file')}
                initialSelectedAgentId={initialSelectedAgentId}
                openedFilePath={selectedFile?.path}
              />
            )}
          </Panel>
        </PanelGroup>
      </div>

      {/* Footer */}
      <footer className="border-t bg-muted/20 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="font-medium">{t('landing.nexus')}</div>
          <div className="flex gap-3">
            <a href="https://github.com/nexi-lab/nexus" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              {t('landing.docs')}
            </a>
            <span>|</span>
            <a href="https://nexus.nexilab.co/health" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              {t('landing.api')}
            </a>
            <span>|</span>
            <a href="https://github.com/nexi-lab/nexus/issues" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              {t('landing.help')}
            </a>
          </div>
        </div>
      </footer>

      {/* Dialogs */}
      <FileUpload open={uploadDialogOpen} onOpenChange={setUploadDialogOpen} currentPath={uploadTargetPath} />

      <CreateFolderDialog open={createFolderDialogOpen} onOpenChange={setCreateFolderDialogOpen} currentPath={currentPath} />

      <StoreMemoryDialog open={storeMemoryDialogOpen} onOpenChange={setStoreMemoryDialogOpen} />

      <ConnectorManagementDialog
        open={connectorManagementDialogOpen}
        onOpenChange={(open) => {
          setConnectorManagementDialogOpen(open);
        }}
      />

      <RenameDialog open={!!renameFile} onOpenChange={(open) => !open && setRenameFile(null)} file={renameFile} />

      <ManagePermissionsDialog
        open={!!managePermissionsFile}
        onOpenChange={(open) => !open && setManagePermissionsFile(null)}
        filePath={managePermissionsFile?.path || ''}
      />

      <FileVersionHistoryDialog
        open={!!versionHistoryFile}
        onOpenChange={(open) => !open && setVersionHistoryFile(null)}
        filePath={versionHistoryFile?.path || ''}
      />
    </div>
  );
}
