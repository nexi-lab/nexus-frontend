import { Brain, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';

interface StoreMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNamespace?: string | null;
  onRegisterMemory?: () => void;
}

export function StoreMemoryDialog({ open, onOpenChange, initialNamespace, onRegisterMemory }: StoreMemoryDialogProps) {
  const { userInfo, apiClient } = useAuth();
  
  if (!apiClient) {
    return null;
  }

  // Form state
  const [namespace, setNamespace] = useState<string>('');
  const [scope, setScope] = useState<'agent' | 'user' | 'tenant' | 'global'>('user');
  const [content, setContent] = useState('');
  const [importance, setImportance] = useState<number>(0.5);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agents, setAgents] = useState<Array<{ agent_id: string; name: string }>>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Registered memories (namespaces)
  const [registeredMemories, setRegisteredMemories] = useState<Array<{ path: string; name: string | null }>>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);

  const [isStoring, setIsStoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load agents and registered memories when dialog opens
  useEffect(() => {
    if (open) {
      loadAgents();
      loadRegisteredMemories();

      // Set initial namespace if provided
      if (initialNamespace) {
        // Strip /memory/{user_id}/ prefix to get the namespace
        const userId = userInfo?.user || userInfo?.subject_id;
        const prefix = `/memory/${userId}/`;
        if (initialNamespace.startsWith(prefix)) {
          setNamespace(initialNamespace.substring(prefix.length));
        } else {
          setNamespace(initialNamespace);
        }
      }
    }
  }, [open, initialNamespace, userInfo]);

  const loadAgents = async () => {
    setLoadingAgents(true);
    try {
      const result = await apiClient.call('list_agents', {});
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

  const loadRegisteredMemories = async () => {
    setLoadingMemories(true);
    try {
      const memoryList = await apiClient.listRegisteredMemories();

      // Filter to only show user's memories
      const userId = userInfo?.user || userInfo?.subject_id;
      const userMemories = memoryList.filter((mem) => mem.metadata?.user_id === userId);

      setRegisteredMemories(userMemories);
    } catch (err) {
      console.error('Failed to load registered memories:', err);
      setRegisteredMemories([]);
    } finally {
      setLoadingMemories(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!namespace.trim()) {
      setError('Namespace is required');
      return;
    }

    if (!content.trim()) {
      setError('Memory content is required');
      return;
    }

    // Validate agent selection for agent-scoped memories
    if (scope === 'agent' && !selectedAgentId) {
      setError('Please select an agent for agent-scoped memory');
      return;
    }

    setIsStoring(true);

    try {
      // Add /memory/{user_id}/ prefix to namespace
      const userId = userInfo?.user || userInfo?.subject_id;
      const fullNamespace = `/memory/${userId}/${namespace.trim()}`;

      const result = await apiClient.storeMemory({
        content: content.trim(),
        scope: scope,
        importance: importance,
        namespace: fullNamespace,
        state: 'active',
      });

      setSuccess(`Memory stored successfully! ID: ${result.memory_id}`);

      // Reset form after 2 seconds
      setTimeout(() => {
        resetForm();
        setSuccess(null);
        onOpenChange(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store memory');
    } finally {
      setIsStoring(false);
    }
  };

  const resetForm = () => {
    setNamespace('');
    setScope('user');
    setContent('');
    setImportance(0.5);
    setSelectedAgentId('');
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Store Memory
          </DialogTitle>
          <DialogDescription>Store a memory record for AI agents. Memories are stored with identity-based access control.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Success Message */}
            {success && <div className="bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100 px-3 py-2 rounded-md text-sm">{success}</div>}

            {/* Error Message */}
            {error && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{error}</div>}

            {/* Namespace */}
            <div className="space-y-2">
              <label htmlFor="namespace" className="text-sm font-medium">
                Namespace *
              </label>
              {loadingMemories ? (
                <div className="text-sm text-muted-foreground">Loading namespaces...</div>
              ) : registeredMemories.length === 0 ? (
                <div className="flex items-center gap-2">
                  <div className="text-sm text-destructive flex-1">No registered memory namespaces. Please register a namespace first.</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Close this dialog and notify parent to switch to register tab
                      handleClose();
                      if (onRegisterMemory) {
                        onRegisterMemory();
                      }
                    }}
                    title="Register Memory Namespace"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <select
                  id="namespace"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  disabled={isStoring}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="">-- Select a namespace --</option>
                  {registeredMemories.map((memory) => {
                    // Strip /memory/{user_id}/ prefix to show just the namespace
                    const userId = userInfo?.user || userInfo?.subject_id;
                    const prefix = `/memory/${userId}/`;
                    const namespacePath = memory.path.startsWith(prefix) ? memory.path.substring(prefix.length) : memory.path;
                    const displayName = memory.name || namespacePath;

                    return (
                      <option key={memory.path} value={namespacePath}>
                        {displayName}
                      </option>
                    );
                  })}
                </select>
              )}
              <p className="text-xs text-muted-foreground">Select the namespace to organize this memory</p>
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
                  setScope(e.target.value as 'agent' | 'user' | 'tenant' | 'global');
                  if (e.target.value !== 'agent') setSelectedAgentId('');
                }}
                disabled={isStoring}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="user">User - Shared across all your agents</option>
                <option value="agent">Agent - Only for specific agent</option>
                <option value="tenant">Tenant - Shared across organization</option>
                <option value="global">Global - System-wide (admin only)</option>
              </select>
            </div>

            {/* Agent Selector (if scope is 'agent') */}
            {scope === 'agent' && (
              <div className="space-y-2">
                <label htmlFor="agent-selector" className="text-sm font-medium">
                  Select Agent *
                </label>
                {loadingAgents ? (
                  <div className="text-sm text-muted-foreground">Loading agents...</div>
                ) : agents.length === 0 ? (
                  <div className="text-sm text-destructive">No agents registered. Please register an agent first.</div>
                ) : (
                  <select
                    id="agent-selector"
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    disabled={isStoring}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                  >
                    <option value="">-- Select an agent --</option>
                    {agents.map((agent) => {
                      const agentName = agent.agent_id.includes(',') ? agent.agent_id.split(',')[1] : agent.agent_id;
                      return (
                        <option key={agent.agent_id} value={agent.agent_id}>
                          {agentName}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            )}

            {/* Memory Content */}
            <div className="space-y-2">
              <label htmlFor="memory-content" className="text-sm font-medium">
                Memory Content *
              </label>
              <Textarea
                id="memory-content"
                placeholder="Enter memory content (e.g., 'User prefers dark mode', 'Meeting scheduled for Monday 3pm')"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isStoring}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">The actual content/data to store in this memory record</p>
            </div>

            {/* Importance Slider */}
            <div className="space-y-2">
              <label htmlFor="importance" className="text-sm font-medium">
                Importance: {importance.toFixed(2)}
              </label>
              <input
                id="importance"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={importance}
                onChange={(e) => setImportance(parseFloat(e.target.value))}
                disabled={isStoring}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">How important is this memory? (0.0 = low, 1.0 = high)</p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isStoring}>
              Cancel
            </Button>
            <Button type="submit" disabled={isStoring}>
              {isStoring ? 'Storing...' : 'Store Memory'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
