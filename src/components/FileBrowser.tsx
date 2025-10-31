import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, FolderPlus } from 'lucide-react'
import { Button } from './ui/button'
import { Breadcrumb } from './Breadcrumb'
import { LeftPanel } from './LeftPanel'
import { FileContentViewer } from './FileContentViewer'
import { FileUpload } from './FileUpload'
import { CreateFolderDialog } from './CreateFolderDialog'
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog'
import { RenameDialog } from './RenameDialog'
import { LoginDialog } from './LoginDialog'
import { ManagePermissionsDialog } from './ManagePermissionsDialog'
import { type ContextMenuAction } from './FileContextMenu'
import { createFilesAPI } from '../api/files'
import { useDeleteFile, useUploadFile, useCreateDirectory, useCreateWorkspace } from '../hooks/useFiles'
import { useAuth } from '../contexts/AuthContext'
import type { FileInfo } from '../types/file'

export function FileBrowser() {
  const navigate = useNavigate()
  const { isAuthenticated, logout, apiClient, userInfo } = useAuth()
  const filesAPI = useMemo(() => createFilesAPI(apiClient), [apiClient])
  const [currentPath, setCurrentPath] = useState('/')
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadTargetPath, setUploadTargetPath] = useState<string>('/')
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false)
  const [createWorkspaceDialogOpen, setCreateWorkspaceDialogOpen] = useState(false)
  const [renameFile, setRenameFile] = useState<FileInfo | null>(null)
  const [managePermissionsFile, setManagePermissionsFile] = useState<FileInfo | null>(null)
  const [creatingNewItem, setCreatingNewItem] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null)
  const [loginDialogOpen, setLoginDialogOpen] = useState(!isAuthenticated)

  const deleteMutation = useDeleteFile()
  const uploadMutation = useUploadFile()
  const createDirMutation = useCreateDirectory()
  const createWorkspaceMutation = useCreateWorkspace()

  const handleFileSelect = (file: FileInfo) => {
    setSelectedFile(file)
  }

  const handleFileDeleted = () => {
    setSelectedFile(null)
  }

  const handleCreateItem = async (path: string, type: 'file' | 'folder') => {
    try {
      if (type === 'folder') {
        await createDirMutation.mutateAsync({ path })
      } else {
        // Create empty file
        const encoder = new TextEncoder()
        const emptyContent = encoder.encode('').buffer
        await uploadMutation.mutateAsync({ path, content: emptyContent })

        // Open the newly created file
        const newFile: FileInfo = {
          path,
          name: path.split('/').pop() || '',
          isDirectory: false,
        }
        setSelectedFile(newFile)
      }
      setCreatingNewItem(null)
    } catch (error) {
      console.error('Failed to create item:', error)
      alert(`Failed to create ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setCreatingNewItem(null)
    }
  }

  const handleCancelCreate = () => {
    setCreatingNewItem(null)
  }

  const handleCreateWorkspace = async (path: string, name: string, description: string) => {
    await createWorkspaceMutation.mutateAsync({
      path,
      name: name || undefined,
      description: description || undefined,
    })
  }

  const handleContextMenuAction = async (action: ContextMenuAction, file: FileInfo) => {
    switch (action) {
      case 'open':
        if (!file.isDirectory) {
          setSelectedFile(file)
        }
        break

      case 'download':
        if (!file.isDirectory) {
          try {
            const content = await filesAPI.read(file.path)
            const blob = new Blob([content as unknown as BlobPart], { type: 'application/octet-stream' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = file.name
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          } catch (error) {
            console.error('Failed to download file:', error)
          }
        }
        break

      case 'rename':
        setRenameFile(file)
        break

      case 'delete':
        if (confirm(`Are you sure you want to delete ${file.name}?`)) {
          try {
            await deleteMutation.mutateAsync({
              path: file.path,
              isDirectory: file.isDirectory,
            })
            // Clear selected file if it was deleted
            if (selectedFile?.path === file.path) {
              setSelectedFile(null)
            }
          } catch (error) {
            console.error('Failed to delete:', error)
            alert(`Failed to delete ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
        break

      case 'copy-path':
        try {
          await navigator.clipboard.writeText(file.path)
          // Could add a toast notification here
          console.log('Path copied to clipboard:', file.path)
        } catch (error) {
          console.error('Failed to copy path:', error)
        }
        break

      case 'new-file':
        if (file.isDirectory) {
          setCreatingNewItem({ type: 'file', parentPath: file.path })
        }
        break

      case 'new-folder':
        if (file.isDirectory) {
          setCreatingNewItem({ type: 'folder', parentPath: file.path })
        }
        break

      case 'upload':
        if (file.isDirectory) {
          setUploadTargetPath(file.path)
          setUploadDialogOpen(true)
        }
        break

      case 'find-in-folder':
        // This is handled by LeftPanel
        break

      case 'manage-permissions':
        setManagePermissionsFile(file)
        break

      default:
        console.log('Unhandled action:', action, file)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4 flex-1">
            <img src="/nexus-logo.png" alt="Nexus Logo" className="h-10 w-10" />
            <h1 className="text-2xl font-bold">NexusFS</h1>
          </div>
          <div className="flex gap-2 items-center">
            {isAuthenticated ? (
              <>
                {userInfo?.user && (
                  <span className="text-sm text-muted-foreground mr-2">
                    {userInfo.user}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreateWorkspaceDialogOpen(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Workspace
                </Button>
                {userInfo?.is_admin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/admin')}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    logout()
                    setLoginDialogOpen(true)
                  }}
                >
                  Logout
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setLoginDialogOpen(true)}
              >
                Login
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              asChild
            >
              <a
                href="https://github.com/nexi-lab/nexus"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View on GitHub"
              >
                <svg
                  className="h-7 w-7"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
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

      {/* Breadcrumb */}
      <div className="border-b px-4 py-2 bg-muted/20">
        <Breadcrumb path={currentPath} onPathChange={setCurrentPath} />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - File Tree + Search */}
        <LeftPanel
          currentPath={currentPath}
          onPathChange={setCurrentPath}
          onFileSelect={handleFileSelect}
          onContextMenuAction={handleContextMenuAction}
          creatingNewItem={creatingNewItem}
          onCreateItem={handleCreateItem}
          onCancelCreate={handleCancelCreate}
        />

        {/* Right Panel - File Content Viewer */}
        <FileContentViewer file={selectedFile} onFileDeleted={handleFileDeleted} />
      </div>

      {/* Dialogs */}
      <LoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
      />

      <FileUpload
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        currentPath={uploadTargetPath}
      />

      <CreateFolderDialog
        open={createFolderDialogOpen}
        onOpenChange={setCreateFolderDialogOpen}
        currentPath={currentPath}
      />

      <CreateWorkspaceDialog
        open={createWorkspaceDialogOpen}
        onOpenChange={setCreateWorkspaceDialogOpen}
        onCreateWorkspace={handleCreateWorkspace}
      />

      <RenameDialog
        open={!!renameFile}
        onOpenChange={(open) => !open && setRenameFile(null)}
        file={renameFile}
      />

      <ManagePermissionsDialog
        open={!!managePermissionsFile}
        onOpenChange={(open) => !open && setManagePermissionsFile(null)}
        filePath={managePermissionsFile?.path || ''}
      />
    </div>
  )
}
