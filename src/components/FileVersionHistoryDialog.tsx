import { useState, useEffect } from 'react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { History, Download, RotateCcw, Calendar, User, Bot, FileText, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface Version {
  version: number
  content_hash: string
  size: number
  mime_type: string
  created_at: string
  created_by: string | null
  change_reason: string | null
  source_type: string | null
  parent_version_id: number | null
}

interface FileVersionHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filePath: string
}

export function FileVersionHistoryDialog({
  open,
  onOpenChange,
  filePath,
}: FileVersionHistoryDialogProps) {
  const { apiClient } = useAuth()
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rollingBack, setRollingBack] = useState<number | null>(null)

  // Load versions when dialog opens or filePath changes
  useEffect(() => {
    if (open && filePath) {
      loadVersions()
    }
  }, [open, filePath])

  const loadVersions = async () => {
    setLoading(true)
    setError(null)
    try {
      const versionList = await apiClient.listVersions(filePath)
      setVersions(versionList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version history')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadVersion = async (version: number) => {
    try {
      const content = await apiClient.getVersion(filePath, version)
      const blob = new Blob([content], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const fileName = filePath.split('/').pop() || 'file'
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName}.v${version}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download version:', err)
      setError(err instanceof Error ? err.message : 'Failed to download version')
    }
  }

  const handleRollback = async (version: number) => {
    if (!confirm(`Are you sure you want to rollback to version ${version}? This will create a new version with the old content.`)) {
      return
    }

    setRollingBack(version)
    try {
      await apiClient.rollback(filePath, version)
      await loadVersions() // Refresh the list
      alert(`Successfully rolled back to version ${version}`)
    } catch (err) {
      console.error('Failed to rollback:', err)
      setError(err instanceof Error ? err.message : 'Failed to rollback')
    } finally {
      setRollingBack(null)
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Extract display info from created_by (could be user or agent)
  const getCreatorInfo = (createdBy: string | null) => {
    if (!createdBy) {
      return { displayName: 'System', isAgent: false }
    }

    // Check if it's an agent (format: <user_id>,<agent_name>)
    if (createdBy.includes(',')) {
      const parts = createdBy.split(',')
      const agentName = parts.length === 2 ? parts[1] : createdBy
      return { displayName: agentName, isAgent: true }
    }

    // Regular user
    return { displayName: createdBy, isAgent: false }
  }

  const fileName = filePath.split('/').pop() || 'file'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            Edit history for <span className="font-mono">{fileName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-auto py-4">
          {error && (
            <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm mb-4 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading version history...
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground">No version history found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => {
                const creatorInfo = getCreatorInfo(v.created_by)
                const isCurrentVersion = v.version === versions[0].version

                return (
                  <div
                    key={v.version}
                    className={`flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                      isCurrentVersion ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`font-bold text-lg ${isCurrentVersion ? 'text-primary' : ''}`}>
                          v{v.version}
                        </span>
                        {isCurrentVersion && (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                            Current
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 text-sm">
                        {/* Creator */}
                        <div className="flex items-center gap-2 text-muted-foreground">
                          {creatorInfo.isAgent ? (
                            <Bot className="h-3.5 w-3.5" />
                          ) : (
                            <User className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {creatorInfo.displayName}
                            {creatorInfo.isAgent && (
                              <span className="ml-1 text-xs opacity-70">(agent)</span>
                            )}
                          </span>
                        </div>

                        {/* Date */}
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(v.created_at)}
                        </div>

                        {/* Size */}
                        <div className="text-muted-foreground">
                          Size: {formatSize(v.size)}
                        </div>

                        {/* Change reason */}
                        {v.change_reason && (
                          <div className="text-muted-foreground italic mt-1">
                            "{v.change_reason}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadVersion(v.version)}
                        title="Download this version"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {!isCurrentVersion && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRollback(v.version)}
                          disabled={rollingBack !== null}
                          title="Rollback to this version"
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        >
                          {rollingBack === v.version ? (
                            <span className="text-xs">Rolling back...</span>
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Info box */}
          {!loading && versions.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm mt-4">
              <p className="text-blue-900 dark:text-blue-100">
                <strong>💡 Version History:</strong> All file edits are tracked with the user or agent who made the change. You can download any version or rollback to restore previous content.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
