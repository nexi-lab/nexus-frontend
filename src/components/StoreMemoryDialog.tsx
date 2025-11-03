import { Brain } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';

interface StoreMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoreMemoryDialog({ open, onOpenChange }: StoreMemoryDialogProps) {
  const { userInfo, apiClient } = useAuth();

  // Form state
  const [content, setContent] = useState('');
  const [scope, setScope] = useState<'agent' | 'user' | 'tenant' | 'global'>('user');
  const [memoryType, setMemoryType] = useState<string>('fact');
  const [importance, setImportance] = useState<number>(0.5);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agents, setAgents] = useState<Array<{ agent_id: string; name: string }>>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [isStoring, setIsStoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load agents when dialog opens
  useEffect(() => {
    if (open) {
      loadAgents();
    }
  }, [open]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

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
      const result = await apiClient.storeMemory({
        content: content.trim(),
        scope: scope,
        memory_type: memoryType,
        importance: importance,
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
    setContent('');
    setScope('user');
    setMemoryType('fact');
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

            {/* Memory Type */}
            <div className="space-y-2">
              <label htmlFor="memory-type" className="text-sm font-medium">
                Memory Type
              </label>
              <select
                id="memory-type"
                value={memoryType}
                onChange={(e) => setMemoryType(e.target.value)}
                disabled={isStoring}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option value="fact">Fact - Known fact or information</option>
                <option value="preference">Preference - User/agent preference</option>
                <option value="experience">Experience - Past experience or event</option>
                <option value="strategy">Strategy - Problem-solving approach</option>
                <option value="observation">Observation - Observed pattern</option>
                <option value="reflection">Reflection - Self-reflection note</option>
              </select>
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
