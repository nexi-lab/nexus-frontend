import { Brain, Calendar, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

interface MemoryManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RegisteredMemory {
  path: string;
  name: string | null;
  description: string;
  created_at: string;
  created_by: string | null;
  metadata: Record<string, any>;
}

export function MemoryManagementDialog({ open, onOpenChange }: MemoryManagementDialogProps) {
  const { userInfo, apiClient } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Memory list state
  const [memories, setMemories] = useState<RegisteredMemory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  // Create memory state
  const [memoryName, setMemoryName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'tenant' | 'user' | 'agent'>('user');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agents, setAgents] = useState<Array<{ agent_id: string; name: string }>>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load memories and agents when dialog opens
  useEffect(() => {
    if (open) {
      loadMemories();
      loadAgents();
    }
  }, [open]);

  const loadAgents = async () => {
    setLoadingAgents(true);
    try {
      const result = await apiClient.call('list_agents', {});
      // list_agents returns array directly, not wrapped in {agents: [...]}
      const allAgents = Array.isArray(result) ? result : [];

      // Filter to only show agents owned by current user
      const userId = userInfo?.user || userInfo?.subject_id;
      const userAgents = allAgents.filter((agent) => agent.user_id === userId);

      setAgents(userAgents);
    } catch (err) {
      console.error('Failed to load agents:', err);
      setAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  };

  const loadMemories = async () => {
    setLoadingMemories(true);
    setMemoryError(null);
    try {
      const memoryList = await apiClient.listRegisteredMemories();
      setMemories(memoryList);
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Failed to load memories');
    } finally {
      setLoadingMemories(false);
    }
  };

  const handleDeleteMemory = async (path: string, name: string | null) => {
    const displayName = name || path;
    if (!confirm(`Are you sure you want to unregister memory "${displayName}"?\n\nNote: Files will NOT be deleted, only the memory registration.`)) {
      return;
    }

    try {
      await apiClient.unregisterMemory(path);
      await loadMemories(); // Refresh list
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Failed to unregister memory');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!memoryName.trim()) {
      setError('Memory name is required');
      return;
    }

    // Validate memory name (alphanumeric, underscores, hyphens only)
    if (!/^[a-zA-Z0-9_-]+$/.test(memoryName.trim())) {
      setError('Memory name must contain only letters, numbers, underscores, and hyphens');
      return;
    }

    // Validate agent selection for agent-scoped memories
    if (scope === 'agent' && !selectedAgentId) {
      setError('Please select an agent for agent-scoped memory');
      return;
    }

    // Get user_id from userInfo
    const userId = userInfo?.user || userInfo?.subject_id;
    if (!userId) {
      setError('Unable to determine user ID. Please log in again.');
      return;
    }

    setIsCreating(true);

    try {
      // Register the memory using simple name directly (no path prefix)
      await apiClient.registerMemory({
        path: memoryName.trim(),
        name: memoryName.trim(),
        description: description.trim(),
        metadata: {
          scope: scope,
          agent_id: scope === 'agent' ? selectedAgentId : undefined,
          user_id: userId,
        },
      });

      // Success - reset form and switch to list view
      resetForm();
      await loadMemories(); // Refresh the list
      setActiveTab('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register memory');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setMemoryName('');
    setDescription('');
    setScope('user');
    setSelectedAgentId('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    setActiveTab('list');
    onOpenChange(false);
  };

  // Extract memory name from full path (/memory/<user_id>/<memory_name>)
  const getMemoryDisplayName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  // Filter to only show user's memories (based on metadata user_id)
  const userMemories = memories.filter((mem) => {
    const userId = userInfo?.user || userInfo?.subject_id;
    return mem.metadata?.user_id === userId;
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Memory Management
          </DialogTitle>
          <DialogDescription>
            Manage memory namespaces for AI agent learning and knowledge storage. Memory records are stored in the database with identity-based access control
            (not as files).
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'list' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('list')}
          >
            My Memories ({userMemories.length})
          </button>
          <button
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'create' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('create')}
          >
            <Plus className="h-4 w-4 inline mr-1" />
            Register Memory
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto py-4">
          {activeTab === 'list' ? (
            // Memory List View
            <div className="space-y-4">
              {memoryError && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{memoryError}</div>}

              {loadingMemories ? (
                <div className="text-center py-8 text-muted-foreground">Loading memories...</div>
              ) : userMemories.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">No memories registered yet</p>
                  <Button onClick={() => setActiveTab('create')} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Register Your First Memory
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {userMemories.map((memory) => {
                    const displayName = memory.name || getMemoryDisplayName(memory.path);
                    const scope = memory.metadata?.scope || 'user';
                    const agentId = memory.metadata?.agent_id;

                    return (
                      <div key={memory.path} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Brain className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{displayName}</span>
                            {/* Scope badge */}
                            <span
                              className={`px-2 py-0.5 text-xs rounded ${
                                scope === 'agent'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                  : scope === 'tenant'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              }`}
                            >
                              {scope}
                            </span>
                            {agentId && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-xs rounded font-mono">
                                {agentId.includes(',') ? agentId.split(',')[1] : agentId}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground font-mono mb-1">{memory.path}</div>
                          {memory.description && <div className="text-sm text-muted-foreground mb-2">{memory.description}</div>}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Created {new Date(memory.created_at).toLocaleDateString()}
                            </div>
                            <div>
                              {scope === 'agent' && 'Private to agent + owner'}
                              {scope === 'user' && 'Shared across your agents'}
                              {scope === 'tenant' && 'Organization-wide'}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteMemory(memory.path, memory.name)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm mt-4 space-y-3">
                <div>
                  <p className="text-blue-900 dark:text-blue-100 font-semibold mb-2">💡 About Memory Scopes</p>
                  <p className="text-blue-800 dark:text-blue-200 mb-3">
                    Memory records are stored in the database with different scopes that control sharing and access:
                  </p>
                </div>
                <div className="space-y-2 text-blue-800 dark:text-blue-200">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded min-w-[80px]">agent</span>
                    <span className="text-xs">Private to a single agent - not shared</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded min-w-[80px]">user</span>
                    <span className="text-xs">Shared across all of your agents</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded min-w-[80px]">tenant</span>
                    <span className="text-xs">Organization-wide (all users in your tenant)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded min-w-[80px]">global</span>
                    <span className="text-xs">System-wide (available to all users)</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Create Memory Form
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                {/* Memory Name */}
                <div className="space-y-2">
                  <label htmlFor="memory-name" className="text-sm font-medium">
                    Memory Name *
                  </label>
                  <Input
                    id="memory-name"
                    placeholder="preferences"
                    value={memoryName}
                    onChange={(e) => setMemoryName(e.target.value)}
                    disabled={isCreating}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground mb-2">Unique name for your memory (letters, numbers, underscores, hyphens only)</p>

                  {/* Template Suggestions */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Quick Templates:</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { name: 'preferences', desc: 'User preferences and settings' },
                        { name: 'facts', desc: 'Known facts about user/world' },
                        { name: 'knowledge', desc: 'General knowledge base' },
                        { name: 'context', desc: 'Conversational context' },
                        { name: 'history', desc: 'Interaction history' },
                        { name: 'notes', desc: 'Personal notes' },
                        { name: 'documents', desc: 'Document summaries' },
                        { name: 'skills', desc: 'Learned capabilities' },
                      ].map((template) => (
                        <button
                          key={template.name}
                          type="button"
                          onClick={() => setMemoryName(template.name)}
                          disabled={isCreating}
                          className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded border transition-colors disabled:opacity-50"
                          title={template.desc}
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label htmlFor="memory-description" className="text-sm font-medium">
                    Description
                  </label>
                  <Textarea
                    id="memory-description"
                    placeholder="Memory description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isCreating}
                    rows={3}
                  />
                </div>

                {/* Scope */}
                <div className="space-y-2">
                  <label htmlFor="memory-scope" className="text-sm font-medium">
                    Scope *
                  </label>
                  <select
                    id="memory-scope"
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value as 'tenant' | 'user' | 'agent');
                      if (e.target.value !== 'agent') {
                        setSelectedAgentId('');
                      }
                    }}
                    disabled={isCreating}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                  >
                    <option value="user">User - Shared across all your agents</option>
                    <option value="agent">Agent - Only shown to specific agent and owner</option>
                    <option value="tenant">Tenant - Shared for entire organization</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {scope === 'user' && 'All your agents can access this memory namespace'}
                    {scope === 'agent' && 'Only the selected agent and you (as owner) can access'}
                    {scope === 'tenant' && 'All users in your organization can access'}
                  </p>
                </div>

                {/* Agent Selection (only for agent scope) */}
                {scope === 'agent' && (
                  <div className="space-y-2">
                    <label htmlFor="memory-agent" className="text-sm font-medium">
                      Agent *
                    </label>
                    {loadingAgents ? (
                      <div className="text-sm text-muted-foreground">Loading agents...</div>
                    ) : agents.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No agents registered. Please register an agent first.</div>
                    ) : (
                      <select
                        id="memory-agent"
                        value={selectedAgentId}
                        onChange={(e) => setSelectedAgentId(e.target.value)}
                        disabled={isCreating}
                        className="w-full px-3 py-2 border rounded-md bg-background"
                      >
                        <option value="">Select an agent...</option>
                        {agents.map((agent) => {
                          // Extract agent name from "user_id,agent_name" format
                          const agentName = agent.agent_id.includes(',') ? agent.agent_id.split(',')[1] : agent.agent_id;
                          return (
                            <option key={agent.agent_id} value={agent.agent_id}>
                              {agentName}
                            </option>
                          );
                        })}
                      </select>
                    )}
                    <p className="text-xs text-muted-foreground">Select which agent can access this memory namespace</p>
                  </div>
                )}

                {error && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{error}</div>}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          {activeTab === 'create' ? (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isCreating}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isCreating}>
                {isCreating ? 'Registering...' : 'Register Memory'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
