import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FolderPlus, AlertCircle } from 'lucide-react'
import { Button } from './ui/button'
import { Breadcrumb } from './Breadcrumb'
import { FileTree } from './FileTree'
import { FileList } from './FileList'
import { FileUpload } from './FileUpload'
import { FilePreview } from './FilePreview'
import { SearchBar } from './SearchBar'
import { CreateFolderDialog } from './CreateFolderDialog'
import { RenameDialog } from './RenameDialog'
import { useFileList, useDeleteFile } from '../hooks/useFiles'
import type { FileInfo } from '../types/file'
import { filesAPI } from '../api/files'

export function FileBrowser() {
  const navigate = useNavigate()
  const [currentPath, setCurrentPath] = useState('/')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null)
  const [renameFile, setRenameFile] = useState<FileInfo | null>(null)
  const [searchResults, setSearchResults] = useState<any[] | null>(null)

  const { data: files, isLoading, error } = useFileList(currentPath)
  const deleteMutation = useDeleteFile()

  const handleFileClick = (file: FileInfo) => {
    if (file.isDirectory) {
      setCurrentPath(file.path)
      setSearchResults(null)
    } else {
      // Navigate to the file viewer page
      navigate(`/view?path=${encodeURIComponent(file.path)}`)
    }
  }

  const handleFileDownload = async (file: FileInfo) => {
    try {
      const content = await filesAPI.read(file.path)
      const blob = new Blob([content], { type: 'text/plain' })
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

  const handleFileDelete = async (file: FileInfo) => {
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) return

    try {
      await deleteMutation.mutateAsync({
        path: file.path,
        isDirectory: file.isDirectory,
      })
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  const handleSearchResults = (results: any[]) => {
    setSearchResults(results)
  }

  const displayFiles = searchResults || files || []

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4 flex-1">
            <h1 className="text-2xl font-bold">NexusFS</h1>
            <div className="flex-1 max-w-2xl">
              <SearchBar
                currentPath={currentPath}
                onResultsFound={handleSearchResults}
              />
            </div>
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
        {/* File Tree Sidebar */}
        <FileTree currentPath={currentPath} onPathChange={setCurrentPath} />

        {/* File List */}
        <div className="flex-1 flex flex-col">
          {isLoading && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">Loading files...</p>
            </div>
          )}

          {error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
                <p className="text-destructive">Failed to load files</p>
                <p className="text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </div>
            </div>
          )}

          {!isLoading && !error && (
            <>
              {searchResults && (
                <div className="px-4 py-2 bg-muted/50 border-b">
                  <p className="text-sm">
                    Found {searchResults.length} result(s)
                    <button
                      className="ml-2 text-primary hover:underline"
                      onClick={() => setSearchResults(null)}
                    >
                      Clear search
                    </button>
                  </p>
                </div>
              )}
              <FileList
                files={displayFiles}
                onFileClick={handleFileClick}
                onFileDownload={handleFileDownload}
                onFileDelete={handleFileDelete}
                onFileRename={setRenameFile}
              />
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <FileUpload
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        currentPath={currentPath}
      />

      <CreateFolderDialog
        open={createFolderDialogOpen}
        onOpenChange={setCreateFolderDialogOpen}
        currentPath={currentPath}
      />

      <FilePreview
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        file={previewFile}
        onDownload={handleFileDownload}
      />

      <RenameDialog
        open={!!renameFile}
        onOpenChange={(open) => !open && setRenameFile(null)}
        file={renameFile}
      />
    </div>
  )
}
