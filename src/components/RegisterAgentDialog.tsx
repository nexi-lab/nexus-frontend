import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Bot, Eye, EyeOff, Copy, Check, Info } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface RegisterAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegisterAgent: (agentId: string, name: string, description: string, generateApiKey: boolean) => Promise<{ api_key?: string }>
}

export function RegisterAgentDialog({
  open,
  onOpenChange,
  onRegisterAgent,
}: RegisterAgentDialogProps) {
  const { userInfo } = useAuth()
  const [agentName, setAgentName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [generateApiKey, setGenerateApiKey] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!agentName.trim()) {
      setError('Agent name is required')
      return
    }

    if (!displayName.trim()) {
      setError('Display name is required')
      return
    }

    // Validate agent name (alphanumeric, underscores, hyphens only - NO commas)
    if (!/^[a-z0-9_-]+$/.test(agentName.trim())) {
      setError('Agent name must contain only lowercase letters, numbers, underscores, and hyphens')
      return
    }

    // Check for commas explicitly
    if (agentName.includes(',')) {
      setError('Agent name cannot contain commas')
      return
    }

    // Get user_id from userInfo
    const userId = userInfo?.user || userInfo?.subject_id
    if (!userId) {
      setError('Unable to determine user ID. Please log in again.')
      return
    }

    // Compose full agent_id as <user_id>,<agent_name>
    const fullAgentId = `${userId},${agentName.trim()}`

    setIsRegistering(true)

    try {
      const result = await onRegisterAgent(
        fullAgentId,
        displayName.trim(),
        description.trim(),
        generateApiKey
      )

      // If API key was generated, show it
      if (result.api_key) {
        setNewApiKey(result.api_key)
      } else {
        // No API key - close dialog and reset
        resetForm()
        onOpenChange(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register agent')
    } finally {
      setIsRegistering(false)
    }
  }

  const resetForm = () => {
    setAgentName('')
    setDisplayName('')
    setDescription('')
    setGenerateApiKey(false)
    setNewApiKey(null)
    setShowApiKey(false)
    setCopied(false)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  const handleCopyApiKey = async () => {
    if (!newApiKey) return

    try {
      await navigator.clipboard.writeText(newApiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const maskApiKey = (key: string) => {
    if (key.length <= 12) {
      return '*'.repeat(key.length)
    }
    return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Register New Agent
          </DialogTitle>
          <DialogDescription>
            Register an AI agent for delegation and multi-agent workflows.
          </DialogDescription>
        </DialogHeader>

        {newApiKey ? (
          // Show API key (one-time display)
          <div className="space-y-4 py-4">
            <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-orange-900 dark:text-orange-100 mb-1">
                    Important: Save Your API Key
                  </p>
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    This is the only time the API key will be displayed. Make sure to copy and save it securely.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-muted p-3 rounded-lg font-mono text-sm break-all border border-border">
                  {showApiKey ? newApiKey : maskApiKey(newApiKey)}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey ? "Hide API key" : "Show API key"}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyApiKey}
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm">
              <p className="text-blue-900 dark:text-blue-100">
                <strong>Note:</strong> This agent can authenticate using its own API key, or use the owner's credentials with the <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">X-Agent-ID</code> header (recommended).
              </p>
            </div>
          </div>
        ) : (
          // Registration form
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {/* Agent Name */}
              <div className="space-y-2">
                <label htmlFor="agent-name" className="text-sm font-medium">
                  Agent Name *
                </label>
                <div className="flex items-center gap-0">
                  <span className="px-3 py-2 bg-muted text-muted-foreground border border-r-0 rounded-l-md font-mono text-sm">
                    {userInfo?.user || 'user'},
                  </span>
                  <Input
                    id="agent-name"
                    placeholder="data_analyst"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value.toLowerCase())}
                    disabled={isRegistering}
                    className="font-mono rounded-l-none"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Unique name for your agent (lowercase, alphanumeric, underscores, hyphens only)
                </p>
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <label htmlFor="display-name" className="text-sm font-medium">
                  Display Name *
                </label>
                <Input
                  id="display-name"
                  placeholder="Data Analyst Agent"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isRegistering}
                />
                <p className="text-xs text-muted-foreground">
                  Human-readable name for the agent
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label htmlFor="agent-description" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="agent-description"
                  placeholder="Analyzes data and generates reports..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isRegistering}
                  rows={3}
                />
              </div>

              {/* Generate API Key Option */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="generate-api-key"
                    checked={generateApiKey}
                    onChange={(e) => setGenerateApiKey(e.target.checked)}
                    disabled={isRegistering}
                    className="h-4 w-4"
                  />
                  <label htmlFor="generate-api-key" className="text-sm font-medium">
                    Generate API key for agent
                  </label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  {generateApiKey ? (
                    <span className="text-orange-600 dark:text-orange-400">
                      ⚠️ Agent will have its own API key (for independent authentication)
                    </span>
                  ) : (
                    <span className="text-green-600 dark:text-green-400">
                      ✓ Recommended: Agent will use owner's credentials + X-Agent-ID header
                    </span>
                  )}
                </p>
              </div>

              {/* Info Box */}
              <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                <p className="font-medium">Permission Inheritance:</p>
                <p className="text-muted-foreground">
                  Agents automatically inherit all permissions from their owner (you). You can grant additional permissions using ReBAC if needed.
                </p>
              </div>

              {error && (
                <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isRegistering}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isRegistering}>
                {isRegistering ? 'Registering...' : 'Register Agent'}
              </Button>
            </DialogFooter>
          </form>
        )}

        {newApiKey && (
          <DialogFooter>
            <Button onClick={handleClose}>
              Done
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
