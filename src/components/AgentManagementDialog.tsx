import { useState, useEffect } from 'react'
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
import { Bot, Eye, EyeOff, Copy, Check, Info, Trash2, Plus, Calendar } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface AgentManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegisterAgent: (agentId: string, name: string, description: string, generateApiKey: boolean) => Promise<{ api_key?: string }>
}

interface Agent {
  agent_id: string
  user_id: string
  name: string
  description?: string
  created_at: string
}

export function AgentManagementDialog({
  open,
  onOpenChange,
  onRegisterAgent,
}: AgentManagementDialogProps) {
  const { userInfo, apiClient } = useAuth()
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list')

  // Agent list state
  const [agents, setAgents] = useState<Agent[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)

  // Create agent state
  const [agentName, setAgentName] = useState('')
  const [description, setDescription] = useState('')
  const [generateApiKey, setGenerateApiKey] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState(false)

  // Load agents when dialog opens
  useEffect(() => {
    if (open) {
      loadAgents()
    }
  }, [open])

  const loadAgents = async () => {
    setLoadingAgents(true)
    setAgentError(null)
    try {
      const agentList = await apiClient.listAgents()
      setAgents(agentList)
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to load agents')
    } finally {
      setLoadingAgents(false)
    }
  }

  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    if (!confirm(`Are you sure you want to delete agent "${agentName}"?`)) {
      return
    }

    try {
      await apiClient.deleteAgent(agentId)
      await loadAgents() // Refresh list
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to delete agent')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!agentName.trim()) {
      setError('Agent name is required')
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
      // Note: Backend currently doesn't store display name (TODO: fix backend)
      // Using agent name as placeholder for the 'name' parameter
      const result = await onRegisterAgent(
        fullAgentId,
        agentName.trim(),  // Using agent_name since display name isn't stored
        description.trim(),
        generateApiKey
      )

      // If API key was generated, show it
      if (result.api_key) {
        setNewApiKey(result.api_key)
      } else {
        // No API key - reset form and switch to list view
        resetForm()
        await loadAgents() // Refresh the list
        setActiveTab('list')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register agent')
    } finally {
      setIsRegistering(false)
    }
  }

  const resetForm = () => {
    setAgentName('')
    setDescription('')
    setGenerateApiKey(false)
    setNewApiKey(null)
    setShowApiKey(false)
    setCopied(false)
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    setActiveTab('list')
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

  // Extract agent name from full agent_id (user_id,agent_name)
  const getAgentDisplayName = (agentId: string) => {
    const parts = agentId.split(',')
    return parts.length === 2 ? parts[1] : agentId
  }

  // Filter to only show user's agents
  const userAgents = agents.filter(agent => {
    const userId = userInfo?.user || userInfo?.subject_id
    return agent.user_id === userId
  })

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Management
          </DialogTitle>
          <DialogDescription>
            Manage your AI agents for delegation and multi-agent workflows.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'list'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('list')}
          >
            My Agents ({userAgents.length})
          </button>
          <button
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'create'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('create')}
          >
            <Plus className="h-4 w-4 inline mr-1" />
            Register New Agent
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto py-4">
          {activeTab === 'list' ? (
            // Agent List View
            <div className="space-y-4">
              {agentError && (
                <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">
                  {agentError}
                </div>
              )}

              {loadingAgents ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading agents...
                </div>
              ) : userAgents.length === 0 ? (
                <div className="text-center py-12">
                  <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">No agents registered yet</p>
                  <Button onClick={() => setActiveTab('create')} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Register Your First Agent
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {userAgents.map((agent) => {
                    // Backend doesn't store display name (see TODO in nexus_fs.py:2397)
                    // Extract just the agent name part (without user_id prefix)
                    const agentName = getAgentDisplayName(agent.agent_id)

                    return (
                      <div
                        key={agent.agent_id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Bot className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{agentName}</span>
                          </div>
                          {agent.description && (
                            <div className="text-sm text-muted-foreground mb-2">
                              {agent.description}
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Created {new Date(agent.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAgent(agent.agent_id, agentName)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm mt-4">
                <p className="text-blue-900 dark:text-blue-100">
                  <strong>💡 How to use agents:</strong> Agents inherit all your permissions and can be used with the <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">X-Agent-ID</code> header in API requests.
                </p>
              </div>
            </div>
          ) : newApiKey ? (
            // API Key Display View
            <div className="space-y-4">
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
            // Register Agent Form
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
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
            </form>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          {activeTab === 'create' && !newApiKey ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isRegistering}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isRegistering}>
                {isRegistering ? 'Registering...' : 'Register Agent'}
              </Button>
            </>
          ) : newApiKey ? (
            <Button onClick={() => {
              resetForm()
              loadAgents()
              setActiveTab('list')
            }}>
              Done
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
