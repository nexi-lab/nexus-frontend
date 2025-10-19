import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { useFileList } from '../hooks/useFiles'
import { cn } from '../lib/utils'

interface FileTreeProps {
  currentPath: string
  onPathChange: (path: string) => void
}

interface TreeNodeProps {
  path: string
  name: string
  currentPath: string
  onPathChange: (path: string) => void
  level: number
}

function TreeNode({ path, name, currentPath, onPathChange, level }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(
    currentPath.startsWith(path) || path === '/'
  )
  const { data: files, isLoading } = useFileList(path, isExpanded)

  const isActive = currentPath === path
  const directories = files?.filter((f) => f.isDirectory) || []

  return (
    <div>
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

      {isExpanded && !isLoading && (
        <div>
          {directories.map((dir) => (
            <TreeNode
              key={dir.path}
              path={dir.path}
              name={dir.name}
              currentPath={currentPath}
              onPathChange={onPathChange}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree({ currentPath, onPathChange }: FileTreeProps) {
  return (
    <div className="w-64 border-r bg-muted/20 overflow-auto p-2">
      <TreeNode
        path="/"
        name="Root"
        currentPath={currentPath}
        onPathChange={onPathChange}
        level={0}
      />
    </div>
  )
}
