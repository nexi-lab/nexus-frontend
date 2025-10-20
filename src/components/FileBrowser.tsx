import { useState } from 'react'
import { Upload, FolderPlus } from 'lucide-react'
import { Button } from './ui/button'
import { Breadcrumb } from './Breadcrumb'
import { LeftPanel } from './LeftPanel'
import { FileContentViewer } from './FileContentViewer'
import { FileUpload } from './FileUpload'
import { CreateFolderDialog } from './CreateFolderDialog'
import { RenameDialog } from './RenameDialog'
import { type ContextMenuAction } from './FileContextMenu'
import { filesAPI } from '../api/files'
import { useDeleteFile, useUploadFile, useCreateDirectory } from '../hooks/useFiles'
import type { FileInfo } from '../types/file'

export function FileBrowser() {
  const [currentPath, setCurrentPath] = useState('/')
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadTargetPath, setUploadTargetPath] = useState<string>('/')
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false)
  const [renameFile, setRenameFile] = useState<FileInfo | null>(null)
  const [creatingNewItem, setCreatingNewItem] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null)

  const deleteMutation = useDeleteFile()
  const uploadMutation = useUploadFile()
  const createDirMutation = useCreateDirectory()

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
            <h1 className="text-2xl font-bold">NexusFS</h1>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setCreateFolderDialogOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </Button>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload
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

      <RenameDialog
        open={!!renameFile}
        onOpenChange={(open) => !open && setRenameFile(null)}
        file={renameFile}
      />
    </div>
  )
}
