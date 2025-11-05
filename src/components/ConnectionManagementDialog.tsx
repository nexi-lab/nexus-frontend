import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, CheckCircle2, XCircle, Wifi, WifiOff } from 'lucide-react'

interface ConnectionManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ConnectionStatus {
  connected: boolean
  message: string
  serverVersion?: string
  authenticated?: boolean
  userInfo?: any
}

export function ConnectionManagementDialog({ open, onOpenChange }: ConnectionManagementDialogProps) {
  const { apiKey, userInfo, apiClient, updateConnection } = useAuth()
  const [serverUrl, setServerUrl] = useState('')
  const [newApiKey, setNewApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null)

  // Load current settings when dialog opens
  useEffect(() => {
    if (open) {
      const currentUrl = apiClient.getBaseURL()
      setServerUrl(currentUrl || '')
      setNewApiKey(apiKey || '')
      setError(null)

      // Get current connection status
      checkConnectionStatus()
    }
  }, [open, apiClient, apiKey])

  const checkConnectionStatus = async () => {
    try {
      const health = await apiClient.health()
      const whoami = await apiClient.whoami()

      setConnectionStatus({
        connected: health.status === 'healthy',
        message: 'Connected',
        serverVersion: health.version,
        authenticated: whoami.authenticated,
        userInfo: whoami,
      })
    } catch (err) {
      setConnectionStatus({
        connected: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      })
    }
  }

  const handleTestConnection = async () => {
    setError(null)
    setIsTesting(true)
    setConnectionStatus(null)

    try {
      // Create a temporary client with the new settings
      const { default: NexusAPIClient } = await import('../api/client')
      const tempClient = new NexusAPIClient(
        serverUrl.trim() || undefined,
        newApiKey.trim() || undefined
      )

      // Test health endpoint
      const health = await tempClient.health()

      // Test authentication if API key is provided
      let authStatus = null
      if (newApiKey.trim()) {
        try {
          authStatus = await tempClient.whoami()
        } catch (err) {
          // Authentication failed but server is reachable
          setConnectionStatus({
            connected: true,
            message: 'Server reachable but authentication failed',
            serverVersion: health.version,
            authenticated: false,
          })
          setError('Authentication failed. Please check your API key.')
          setIsTesting(false)
          return
        }
      }

      // Success
      setConnectionStatus({
        connected: true,
        message: authStatus?.authenticated ? 'Connected and authenticated' : 'Server reachable',
        serverVersion: health.version,
        authenticated: authStatus?.authenticated,
        userInfo: authStatus,
      })
      setError(null)
    } catch (err) {
      setConnectionStatus({
        connected: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      })
      setError(err instanceof Error ? err.message : 'Failed to connect to server')
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async () => {
    setError(null)
    setIsLoading(true)

    try {
      // Validate inputs
      if (!serverUrl.trim()) {
        setError('Server URL is required')
        setIsLoading(false)
        return
      }

      if (!newApiKey.trim()) {
        setError('API key is required')
        setIsLoading(false)
        return
      }

      // Update connection in AuthContext
      await updateConnection(serverUrl.trim(), newApiKey.trim())

      // Close dialog
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update connection')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setServerUrl('')
    setNewApiKey('')
    setError(null)
    setConnectionStatus(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {connectionStatus?.connected ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : connectionStatus?.connected === false ? (
              <WifiOff className="h-5 w-5 text-red-500" />
            ) : (
              <Wifi className="h-5 w-5 text-muted-foreground" />
            )}
            Nexus Connection Settings
          </DialogTitle>
          <DialogDescription>
            Configure your connection to the Nexus server
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Connection Status Card */}
          {connectionStatus && (
            <div className={`p-3 rounded-md border ${
              connectionStatus.connected
                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
            }`}>
              <div className="flex items-start gap-2">
                {connectionStatus.connected ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                )}
                <div className="flex-1 text-sm">
                  <p className={
                    connectionStatus.connected
                      ? 'text-green-700 dark:text-green-300 font-medium'
                      : 'text-red-700 dark:text-red-300 font-medium'
                  }>
                    {connectionStatus.message}
                  </p>
                  {connectionStatus.serverVersion && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Server Version: {connectionStatus.serverVersion}
                    </p>
                  )}
                  {connectionStatus.authenticated && connectionStatus.userInfo && (
                    <div className="text-xs text-muted-foreground mt-1">
                      <p>User: {connectionStatus.userInfo.user || connectionStatus.userInfo.subject_id}</p>
                      {connectionStatus.userInfo.tenant_id && (
                        <p>Tenant: {connectionStatus.userInfo.tenant_id}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Current Connection Info */}
          {userInfo && (
            <div className="p-3 rounded-md bg-muted/50 text-sm space-y-1">
              <p className="font-medium">Current Connection:</p>
              <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
                <p>Server: {apiClient.getBaseURL() || 'Same origin'}</p>
                <p>User: {userInfo.user || userInfo.subject_id}</p>
                {userInfo.tenant_id && <p>Tenant: {userInfo.tenant_id}</p>}
              </div>
            </div>
          )}

          {/* Server URL Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Server URL
            </label>
            <Input
              type="url"
              placeholder="https://nexus.nexilab.co"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              The URL of your Nexus server (e.g., https://nexus.nexilab.co)
            </p>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              API Key
            </label>
            <Input
              type="password"
              placeholder="nxa_..."
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Your Nexus API key for authentication
            </p>
          </div>

          {/* Test Connection Button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting || isLoading || !serverUrl.trim()}
            className="w-full"
          >
            {isTesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing Connection...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || !serverUrl.trim() || !newApiKey.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save & Connect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
