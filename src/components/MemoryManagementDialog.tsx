import { Brain, Calendar, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { StoreMemoryDialog } from './StoreMemoryDialog';
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

interface StoredMemory {
  memory_id: string;
  content: string;
  content_hash: string;
  tenant_id: string | null;
  user_id: string | null;
  agent_id: string | null;
  scope: string;
  visibility: string;
  memory_type: string | null;
  importance: number | null;
  state: string | null;
  namespace: string | null;
  path_key: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function MemoryManagementDialog({ open, onOpenChange }: MemoryManagementDialogProps) {
  const { userInfo, apiClient } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'stored'>('list');

  // Memory list state
  const [memories, setMemories] = useState<RegisteredMemory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  // Workspaces state
  const [workspaces, setWorkspaces] = useState<Array<{ path: string; name: string | null }>>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  // Stored memory records state
  const [storedMemories, setStoredMemories] = useState<StoredMemory[]>([]);
  const [loadingStoredMemories, setLoadingStoredMemories] = useState(false);
  const [storedMemoryError, setStoredMemoryError] = useState<string | null>(null);

  // Store memory dialog state
  const [storeMemoryDialogOpen, setStoreMemoryDialogOpen] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);

  // Edit memory dialog state - Disabled until backend update_memory is fully implemented
  // const [editMemoryDialogOpen, setEditMemoryDialogOpen] = useState(false);
  // const [editingMemory, setEditingMemory] = useState<StoredMemory | null>(null);
  // const [editContent, setEditContent] = useState('');
  // const [editImportance, setEditImportance] = useState(0.5);
  // const [isUpdating, setIsUpdating] = useState(false);

  // Create memory state
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load memories and workspaces when dialog opens
  useEffect(() => {
    if (open) {
      loadMemories();
      loadStoredMemories();
      loadWorkspaces();
    }
  }, [open]);

  // Auto-update name field based on path (only if user hasn't manually edited it)
  useEffect(() => {
    if (path && !nameManuallyEdited) {
      // Extract basename from path and format it
      const parts = path.split('/');
      const basename = parts[parts.length - 1];
      if (basename) {
        const formattedName = basename
          .replace(/[-_]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        setName(formattedName);
      } else {
        setName('');
      }
    }
  }, [path, nameManuallyEdited]);

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

  const loadStoredMemories = async () => {
    setLoadingStoredMemories(true);
    setStoredMemoryError(null);
    try {
      // Pass state: null to get all memories (both active and inactive)
      // Deleted memories are hard-deleted from DB, so won't appear
      const result = await apiClient.queryMemoryRecords({ state: null, limit: 100 });

      // Sort by created_at descending (newest first)
      const sortedMemories = (result.memories || []).sort((a, b) => {
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setStoredMemories(sortedMemories);
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : 'Failed to load stored memories');
    } finally {
      setLoadingStoredMemories(false);
    }
  };

  const loadWorkspaces = async () => {
    setLoadingWorkspaces(true);
    try {
      const workspaceList = await apiClient.listWorkspaces();
      setWorkspaces(workspaceList);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      setWorkspaces([]);
    } finally {
      setLoadingWorkspaces(false);
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

  const handleStoreMemory = (namespace: string) => {
    setSelectedNamespace(namespace);
    setStoreMemoryDialogOpen(true);
  };

  const handleDeleteStoredMemory = async (memoryId: string, content: string) => {
    const preview = content.length > 50 ? content.substring(0, 50) + '...' : content;
    if (!confirm(`Are you sure you want to delete this memory?\n\n"${preview}"\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      await apiClient.deleteMemory(memoryId);
      await loadStoredMemories(); // Refresh list
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : 'Failed to delete memory');
    }
  };

  const handleApproveMemory = async (memoryId: string) => {
    // Optimistic update - update UI immediately
    setStoredMemories((prev) =>
      prev.map((mem) =>
        mem.memory_id === memoryId ? { ...mem, state: 'active' } : mem
      )
    );

    try {
      await apiClient.approveMemory(memoryId);
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : 'Failed to approve memory');
      // Revert on error
      await loadStoredMemories();
    }
  };

  const handleDeactivateMemory = async (memoryId: string) => {
    // Optimistic update - update UI immediately
    setStoredMemories((prev) =>
      prev.map((mem) =>
        mem.memory_id === memoryId ? { ...mem, state: 'inactive' } : mem
      )
    );

    try {
      await apiClient.deactivateMemory(memoryId);
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : 'Failed to reject memory');
      // Revert on error
      await loadStoredMemories();
    }
  };

  // Edit handlers - Disabled until backend update_memory is fully implemented
  /*
  const handleOpenEditMemory = (memory: StoredMemory) => {
    setEditingMemory(memory);
    setEditContent(memory.content);
    setEditImportance(memory.importance ?? 0.5);
    setEditMemoryDialogOpen(true);
  };

  const handleUpdateMemory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingMemory) return;

    setIsUpdating(true);
    setStoredMemoryError(null);

    try {
      const result = await apiClient.updateMemory({
        memory_id: editingMemory.memory_id,
        content: editContent.trim() !== editingMemory.content ? editContent.trim() : undefined,
        importance: editImportance !== editingMemory.importance ? editImportance : undefined,
      });

      // Update the memory in the list
      setStoredMemories((prev) =>
        prev.map((mem) =>
          mem.memory_id === editingMemory.memory_id ? result.memory : mem
        )
      );

      // Close dialog
      setEditMemoryDialogOpen(false);
      setEditingMemory(null);
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : 'Failed to update memory');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCloseEditDialog = () => {
    setEditMemoryDialogOpen(false);
    setEditingMemory(null);
    setStoredMemoryError(null);
  };
  */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!path.trim()) {
      setError('Memory path suffix is required');
      return;
    }

    // Validate path format (should NOT start with "/" since it's a suffix)
    if (path.trim().startsWith('/')) {
      setError('Path should not start with "/" (prefix is auto-added)');
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
      // Construct full path with user prefix
      const fullPath = `/memory/${userId}/${path.trim()}`;

      // Register the memory with full path and optional name
      await apiClient.registerMemory({
        path: fullPath,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        metadata: {
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
    setPath('');
    setName('');
    setNameManuallyEdited(false);
    setDescription('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    setActiveTab('list');
    onOpenChange(false);
  };

  // Extract memory name from full path and format it nicely
  const getMemoryDisplayName = (path: string) => {
    const parts = path.split('/');
    const basename = parts[parts.length - 1] || path;

    // Convert "base_name" or "base-name" to "Base Name"
    return basename
      .replace(/[-_]/g, ' ')  // Replace hyphens and underscores with spaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())  // Capitalize each word
      .join(' ');
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
            type='button'
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'list' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('list')}
          >
            Namespaces ({userMemories.length})
          </button>
          <button
            type='button'
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'stored' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('stored')}
          >
            Stored Memories ({storedMemories.length})
          </button>
          <button
            type='button'
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
          {activeTab === 'stored' ? (
            // Stored Memory Records View
            <div className="space-y-4">
              {storedMemoryError && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{storedMemoryError}</div>}

              {loadingStoredMemories ? (
                <div className="text-center py-8 text-muted-foreground">Loading stored memories...</div>
              ) : storedMemories.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-2">No memory records stored yet</p>
                  <p className="text-sm text-muted-foreground">Use "Store Memory" to create your first memory</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {storedMemories.map((memory) => (
                    <div key={memory.memory_id} className="p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                          {/* Namespace Header */}
                          {memory.namespace && (
                            <div className="font-medium text-base mb-2">{memory.namespace}</div>
                          )}

                          {/* Status and Metadata Badges */}
                          <div className="flex items-center gap-2 mb-2">
                            {/* Approval Status Badge */}
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                              memory.state === 'active'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                            }`}>
                              {memory.state === 'active' ? 'Approved' : 'Pending'}
                            </span>

                            {/* Scope Badge */}
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                              memory.scope === 'agent'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                : memory.scope === 'tenant'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                  : memory.scope === 'user'
                                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                            }`}>
                              {memory.scope}
                            </span>

                            {/* Importance Badge */}
                            {memory.importance !== null && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-xs rounded">
                                importance: {memory.importance.toFixed(2)}
                              </span>
                            )}
                          </div>

                          {/* Content */}
                          <p className="text-sm mb-2">{memory.content}</p>

                          {/* Additional Metadata */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {memory.path_key && (
                              <span className="font-mono bg-muted px-2 py-0.5 rounded">key: {memory.path_key}</span>
                            )}
                            {memory.created_at && (
                              <span>Created {new Date(memory.created_at).toLocaleString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZoneName: 'short'
                              })}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className="text-xs text-muted-foreground font-mono">{memory.memory_id.substring(0, 8)}...</span>
                          {/* Approval Toggle */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {memory.state === 'active' ? 'Approved' : 'Pending'}
                            </span>
                            <button
                             type='button'
                              onClick={() => memory.state === 'active' ? handleDeactivateMemory(memory.memory_id) : handleApproveMemory(memory.memory_id)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                memory.state === 'active'
                                  ? 'bg-green-500 focus:ring-green-500'
                                  : 'bg-gray-300 dark:bg-gray-600 focus:ring-gray-400'
                              }`}
                              title={memory.state === 'active' ? 'Click to reject/unapprove' : 'Click to approve'}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  memory.state === 'active' ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                          {/* Edit functionality disabled - backend update_memory not fully implemented
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditMemory(memory)}
                            title="Edit memory"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteStoredMemory(memory.memory_id, memory.content)}
                            className="text-destructive hover:text-destructive"
                            title="Delete memory"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'list' ? (
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

                    return (
                      <div key={memory.path} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Brain className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{displayName}</span>
                          </div>
                          <div className="text-sm text-muted-foreground font-mono mb-1">{memory.path}</div>
                          {memory.description && <div className="text-sm text-muted-foreground mb-2">{memory.description}</div>}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Created {new Date(memory.created_at).toLocaleString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZoneName: 'short'
                              })}
                            </div>
                            {memory.created_by && <div>Created by: {memory.created_by}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStoreMemory(memory.path)}
                            title="Store Memory"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMemory(memory.path, memory.name)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm mt-4 space-y-3">
                <div>
                  <p className="text-blue-900 dark:text-blue-100 font-semibold mb-2">💡 About Memory Paths</p>
                  <p className="text-blue-800 dark:text-blue-200">
                    Memory paths are organizational namespaces for storing memories. Each path can contain multiple memory records with different scopes (user/agent/tenant).
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // Create Memory Form
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                {/* Memory Path */}
                <div className="space-y-2">
                  <label htmlFor="memory-path" className="text-sm font-medium">
                    Memory Path *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-2 bg-muted text-muted-foreground rounded-md border font-mono text-sm whitespace-nowrap">
                      /memory/{userInfo?.user || userInfo?.subject_id || 'user'}/
                    </span>
                    <Input
                      id="memory-path"
                      placeholder="e.g., global/preferences"
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      disabled={isCreating}
                      className="font-mono flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">Enter the path suffix (prefix is auto-added)</p>

                  {/* Template Suggestions */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Quick Templates:</p>
                    <div className="flex flex-wrap gap-2">
                      {/* Workspace templates */}
                      {loadingWorkspaces ? (
                        <span className="text-xs text-muted-foreground">Loading workspaces...</span>
                      ) : (
                        workspaces
                          .filter((workspace) => {
                            // Filter out workspaces that are already registered as memory paths
                            const userId = userInfo?.user || userInfo?.subject_id;
                            const memoryPath = `/memory/${userId}${workspace.path}`;
                            return !memories.some((mem) => mem.path === memoryPath);
                          })
                          .map((workspace) => {
                            // workspace.path is already the full path like "/workspace/admin/month-end-close"
                            // Strip the leading "/" to make it a suffix
                            const pathSuffix = workspace.path.startsWith('/') ? workspace.path.substring(1) : workspace.path;
                            const workspaceName = workspace.name || workspace.path.split('/').pop() || workspace.path;
                            return {
                              path: pathSuffix,
                              desc: `${workspaceName} workspace memories`,
                            };
                          })
                          .concat([
                            { path: 'global/preferences', desc: 'Global preferences across all workspaces' },
                          ])
                          .map((template) => (
                            <button
                              key={template.path}
                              type="button"
                              onClick={() => setPath(template.path)}
                              disabled={isCreating}
                              className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded border transition-colors disabled:opacity-50"
                              title={template.desc}
                            >
                              {template.path}
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Memory Name (optional) */}
                <div className="space-y-2">
                  <label htmlFor="memory-name" className="text-sm font-medium">
                    Name (Optional)
                  </label>
                  <Input
                    id="memory-name"
                    placeholder="Auto-generated from path if not provided"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameManuallyEdited(true);
                    }}
                    disabled={isCreating}
                  />
                  <p className="text-xs text-muted-foreground">Leave empty to auto-generate from path (e.g., "global/preferences" → "Preferences")</p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label htmlFor="memory-description" className="text-sm font-medium">
                    Description (Optional)
                  </label>
                  <Textarea
                    id="memory-description"
                    placeholder="Description of this memory path..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isCreating}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">What is this memory path for?</p>
                </div>

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

      {/* Store Memory Dialog */}
      <StoreMemoryDialog
        open={storeMemoryDialogOpen}
        onOpenChange={(open) => {
          setStoreMemoryDialogOpen(open);
          if (!open) {
            setSelectedNamespace(null);
            // Refresh stored memories list when dialog closes
            loadStoredMemories();
          }
        }}
        initialNamespace={selectedNamespace}
        onRegisterMemory={() => {
          // Switch to the Register Memory tab
          setActiveTab('create');
        }}
      />

      {/* Edit Memory Dialog - Disabled until backend update_memory is fully implemented
      <Dialog open={editMemoryDialogOpen} onOpenChange={handleCloseEditDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Memory
            </DialogTitle>
            <DialogDescription>Update the content or importance of this memory record.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateMemory}>
            <div className="space-y-4">
              {storedMemoryError && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{storedMemoryError}</div>}

              {editingMemory && (
                <div className="text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded">
                  ID: {editingMemory.memory_id}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="edit-memory-content" className="text-sm font-medium">
                  Memory Content *
                </label>
                <Textarea
                  id="edit-memory-content"
                  placeholder="Enter memory content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  disabled={isUpdating}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">Update the content of this memory record</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-importance" className="text-sm font-medium">
                  Importance: {editImportance.toFixed(2)}
                </label>
                <input
                  id="edit-importance"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={editImportance}
                  onChange={(e) => setEditImportance(parseFloat(e.target.value))}
                  disabled={isUpdating}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">How important is this memory? (0.0 = low, 1.0 = high)</p>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={handleCloseEditDialog} disabled={isUpdating}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? 'Updating...' : 'Update Memory'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      */}
    </Dialog>
  );
}
