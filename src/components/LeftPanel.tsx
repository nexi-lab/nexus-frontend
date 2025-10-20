import { useState } from 'react'
import { Search, FolderTree } from 'lucide-react'
import { SearchBar } from './SearchBar'
import { FileTree } from './FileTree'
import { type ContextMenuAction } from './FileContextMenu'
import type { FileInfo } from '../types/file'

interface LeftPanelProps {
  currentPath: string
  onPathChange: (path: string) => void
  onFileSelect: (file: FileInfo) => void
  onContextMenuAction?: (action: ContextMenuAction, file: FileInfo) => void
  creatingNewItem?: { type: 'file' | 'folder'; parentPath: string } | null
  onCreateItem?: (path: string, type: 'file' | 'folder') => void
  onCancelCreate?: () => void
}

export function LeftPanel({ currentPath, onPathChange, onFileSelect, onContextMenuAction, creatingNewItem, onCreateItem, onCancelCreate }: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<'explorer' | 'search'>('explorer')
  const [searchFolderPath, setSearchFolderPath] = useState<string | null>(null)

  const handleContextMenuAction = (action: ContextMenuAction, file: FileInfo) => {
    if (action === 'find-in-folder' && file.isDirectory) {
      // Switch to search tab and set the folder context
      setActiveTab('search')
      setSearchFolderPath(file.path)
    }
    // Pass all actions to parent
    onContextMenuAction?.(action, file)
  }

  return (
    <div className="w-80 border-r bg-muted/20 flex flex-col h-full">
      {/* Tab Header */}
      <div className="border-b bg-background/95 flex">
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'explorer'
              ? 'bg-background border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
          onClick={() => setActiveTab('explorer')}
        >
          <FolderTree className="h-4 w-4" />
          Explorer
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'search'
              ? 'bg-background border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
          onClick={() => setActiveTab('search')}
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'explorer' ? (
          <div className="h-full overflow-auto p-2">
            <FileTree
              currentPath={currentPath}
              onPathChange={(path) => {
                onPathChange(path)
                // When a directory is clicked in tree, we just navigate to it
                // Don't select it for viewing
              }}
              onFileClick={onFileSelect}
              onContextMenuAction={handleContextMenuAction}
              creatingNewItem={creatingNewItem}
              onCreateItem={onCreateItem}
              onCancelCreate={onCancelCreate}
            />
          </div>
        ) : (
          <SearchBar
            currentPath={searchFolderPath || currentPath}
            onFileSelect={onFileSelect}
            onContextMenuAction={handleContextMenuAction}
          />
        )}
      </div>
    </div>
  )
}
