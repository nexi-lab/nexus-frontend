import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText } from 'lucide-react'
import { useFileList } from '../hooks/useFiles'
import { cn } from '../lib/utils'
import { FileContextMenu, type ContextMenuAction } from './FileContextMenu'
import { InlineFileInput } from './InlineFileInput'
import type { FileInfo } from '../types/file'

interface FileTreeProps {
  currentPath: string
  onPathChange: (path: string) => void
  onFileClick?: (file: FileInfo) => void
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void
  searchResults?: FileInfo[] | null
  creatingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null
  onCreateItem?: (path: string, type: 'file' | 'folder') => void
  onCancelCreate?: () => void
}

interface TreeNodeProps {
  path: string
  name: string
  currentPath: string
  onPathChange: (path: string) => void
  onFileClick?: (file: FileInfo) => void
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void
  level: number
  searchResults?: FileInfo[] | null
  relevantPaths?: Set<string>
  creatingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null
  onCreateItem?: (path: string, type: 'file' | 'folder') => void
  onCancelCreate?: () => void
}

function TreeNode({ path, name, currentPath, onPathChange, onFileClick, onContextMenuAction, level, searchResults, relevantPaths, creatingNewItem, onCreateItem, onCancelCreate }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(
    currentPath.startsWith(path) || path === '/'
  )
  const { data: files, isLoading } = useFileList(path, isExpanded)

  const isActive = currentPath === path

  // Filter directories and files based on search results
  const directories = useMemo(() => {
    const allDirs = files?.filter((f) => f.isDirectory) || []

    // If no search is active, show all directories
    if (!searchResults || !relevantPaths) {
      return allDirs
    }

    // Only show directories that are in the relevant paths
    return allDirs.filter((dir) => relevantPaths.has(dir.path))
  }, [files, searchResults, relevantPaths])

  const fileItems = useMemo(() => {
    return files?.filter((f) => !f.isDirectory) || []
  }, [files])

  const dirFileInfo: FileInfo = {
    path,
    name,
    isDirectory: true,
  }

  return (
    <div>
      <FileContextMenu
        file={dirFileInfo}
        onAction={(action, file) => onContextMenuAction?.(action, file)}
      >
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-muted/50 rounded-md transition-colors',
            isActive && 'bg-muted font-medium'
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            setIsExpanded(!isExpanded)
            onPathChange(path)
          }}
        >
          {directories.length > 0 ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )
          ) : (
            <span className="w-4" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
          )}
          <span className="truncate">{name}</span>
        </div>
      </FileContextMenu>

      {isExpanded && !isLoading && (
        <div>
          {directories.map((dir) => (
            <TreeNode
              key={dir.path}
              path={dir.path}
              name={dir.name}
              currentPath={currentPath}
              onPathChange={onPathChange}
              onFileClick={onFileClick}
              onContextMenuAction={onContextMenuAction}
              level={level + 1}
              searchResults={searchResults}
              relevantPaths={relevantPaths}
              creatingNewItem={creatingNewItem}
              onCreateItem={onCreateItem}
              onCancelCreate={onCancelCreate}
            />
          ))}

          {/* Show inline input for new file/folder creation */}
          {creatingNewItem && creatingNewItem.parentPath === path && (
            <InlineFileInput
              type={creatingNewItem.type}
              level={level + 1}
              onConfirm={(name) => {
                const newPath = `${path}/${name}`.replace(/\/+/g, '/')
                onCreateItem?.(newPath, creatingNewItem.type)
              }}
              onCancel={() => onCancelCreate?.()}
            />
          )}

          {fileItems.map((file) => (
            <FileContextMenu
              key={file.path}
              file={file}
              onAction={(action, file) => onContextMenuAction?.(action, file)}
            >
              <div
                className="flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
                style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
                onClick={() => onFileClick?.(file)}
              >
                <span className="w-4" />
                <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <span className="truncate">{file.name}</span>
              </div>
            </FileContextMenu>
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree({ currentPath, onPathChange, onFileClick, onContextMenuAction, searchResults, creatingNewItem, onCreateItem, onCancelCreate }: FileTreeProps) {
  // Build a set of all relevant directory paths from search results
  const relevantPaths = useMemo(() => {
    if (!searchResults || searchResults.length === 0) {
      return undefined
    }

    const paths = new Set<string>()

    searchResults.forEach((file) => {
      // Add all parent directories of each matching file
      const parts = file.path.split('/').filter(Boolean)
      let currentPath = ''

      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += '/' + parts[i]
        paths.add(currentPath)
      }
    })

    // Always include root
    paths.add('/')

    return paths
  }, [searchResults])

  return (
    <div className="h-full overflow-auto">
      <TreeNode
        path="/"
        name="Root"
        currentPath={currentPath}
        onPathChange={onPathChange}
        onFileClick={onFileClick}
        onContextMenuAction={onContextMenuAction}
        level={0}
        searchResults={searchResults}
        relevantPaths={relevantPaths}
        creatingNewItem={creatingNewItem}
        onCreateItem={onCreateItem}
        onCancelCreate={onCancelCreate}
      />
    </div>
  )
}
