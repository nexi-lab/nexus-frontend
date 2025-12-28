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
import { Loader2, CheckCircle2, XCircle, Wifi, WifiOff, Eye, EyeOff, Copy, Check } from 'lucide-react'

interface ConnectionManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedAgentId: string | null // Current agent to view
  agentApiKey?: string // Agent's API key from backend config
}

interface ConnectionStatus {
  connected: boolean
  message: string
  serverVersion?: string
  authenticated?: boolean
  userInfo?: any
}

export function ConnectionManagementDialog({ open, onOpenChange, selectedAgentId, agentApiKey }: ConnectionManagementDialogProps) {
  const { userInfo, apiClient } = useAuth()
  const [serverUrl, setServerUrl] = useState('')
  const [newApiKey, setNewApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState(false)

  // Load agent settings from backend when dialog opens
  useEffect(() => {
    if (open && selectedAgentId) {
      // Use current server URL and agent's API key from backend config
      const currentUrl = apiClient.getBaseURL()
      setServerUrl(currentUrl || '')
      setNewApiKey(agentApiKey || '')
      setError(null)

      // Get current connection status with the agent's API key directly
      checkConnectionStatus(agentApiKey)
    }
  }, [open, selectedAgentId, apiClient, agentApiKey])

  const checkConnectionStatus = async (apiKeyToUse?: string) => {
    try {
      // Use agent's API key to check connection status
      const { default: NexusAPIClient } = await import('../api/client')
      const testClient = new NexusAPIClient(
        apiClient.getBaseURL() || undefined,
        apiKeyToUse || newApiKey || undefined // Use passed key or state
      )

      const health = await testClient.health()
      const whoami = await testClient.whoami()

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

  const handleCopyApiKey = async () => {
    try {
      await navigator.clipboard.writeText(newApiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
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
            View this agent's Nexus connection settings and test the connection.
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

          {/* Agent Connection Info */}
          {connectionStatus?.authenticated && connectionStatus.userInfo && (
            <div className="p-3 rounded-md bg-muted/50 text-sm space-y-1">
              <p className="font-medium">Agent Connection:</p>
              <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
                <p>Server: {serverUrl}</p>
                <p>Identity: {connectionStatus.userInfo.subject_id}</p>
                {connectionStatus.userInfo.tenant_id && <p>Tenant: {connectionStatus.userInfo.tenant_id}</p>}
              </div>
            </div>
          )}

          {/* Server URL (Read-only) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Server URL
            </label>
            <Input
              type="url"
              value={serverUrl}
              readOnly
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              The Nexus server this agent connects to
            </p>
          </div>

          {/* API Key (Read-only with show/hide and copy) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Agent API Key
            </label>
            <div className="relative">
              <Input
                type="text"
                value={showApiKey ? newApiKey : '•'.repeat(newApiKey.length)}
                readOnly
                className="bg-muted font-mono text-xs pr-20"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCopyApiKey}
                  title="Copy API key"
                  disabled={!newApiKey}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This agent's API key from backend config (read-only)
            </p>
          </div>

          {/* Test Connection Button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting || !serverUrl.trim() || !newApiKey.trim()}
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
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
