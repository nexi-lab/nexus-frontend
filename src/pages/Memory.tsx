import { ArrowLeft, Brain, Calendar, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../i18n/useTranslation';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { StoreMemoryDialog } from '../components/StoreMemoryDialog';

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

export function Memory() {
  const navigate = useNavigate();
  const { userInfo, apiClient } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'stored'>('list');

  // Memory list state
  const [memories, setMemories] = useState<RegisteredMemory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  // Workspaces state (for templates)
  const [workspaces, setWorkspaces] = useState<Array<{ path: string; name: string | null }>>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  // Stored memory records state
  const [storedMemories, setStoredMemories] = useState<StoredMemory[]>([]);
  const [loadingStoredMemories, setLoadingStoredMemories] = useState(false);
  const [storedMemoryError, setStoredMemoryError] = useState<string | null>(null);

  // Store memory dialog state
  const [storeMemoryDialogOpen, setStoreMemoryDialogOpen] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);

  // Create memory state
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data when switching tabs
  useEffect(() => {
    if (activeTab === 'list') {
      loadMemories();
      loadWorkspaces();
    } else if (activeTab === 'stored') {
      loadStoredMemories();
    }
  }, [activeTab]);

  // Auto-update name field based on path (only if user hasn't manually edited it)
  useEffect(() => {
    if (path && !nameManuallyEdited) {
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
      setMemoryError(err instanceof Error ? err.message : t('memory.loadFailed'));
    } finally {
      setLoadingMemories(false);
    }
  };

  const loadStoredMemories = async () => {
    setLoadingStoredMemories(true);
    setStoredMemoryError(null);
    try {
      const result = await apiClient.queryMemoryRecords({ state: null, limit: 100 });
      const sortedMemories = (result.memories || []).sort((a, b) => {
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setStoredMemories(sortedMemories);
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : t('memory.loadFailed'));
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
    if (!confirm(t('memory.unregisterConfirm').replace('{name}', displayName))) {
      return;
    }

    try {
      await apiClient.unregisterMemory(path);
      await loadMemories();
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : t('memory.unregisterFailed'));
    }
  };

  const handleStoreMemory = (namespace: string) => {
    setSelectedNamespace(namespace);
    setStoreMemoryDialogOpen(true);
  };

  const handleDeleteStoredMemory = async (memoryId: string, content: string) => {
    const preview = content.length > 50 ? content.substring(0, 50) + '...' : content;
    if (!confirm(t('memory.deleteConfirm').replace('{preview}', preview))) {
      return;
    }

    try {
      await apiClient.deleteMemory(memoryId);
      await loadStoredMemories();
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : t('memory.deleteFailed'));
    }
  };

  const handleApproveMemory = async (memoryId: string) => {
    setStoredMemories((prev) =>
      prev.map((mem) =>
        mem.memory_id === memoryId ? { ...mem, state: 'active' } : mem
      )
    );

    try {
      await apiClient.approveMemory(memoryId);
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : t('memory.deleteFailed'));
      await loadStoredMemories();
    }
  };

  const handleDeactivateMemory = async (memoryId: string) => {
    setStoredMemories((prev) =>
      prev.map((mem) =>
        mem.memory_id === memoryId ? { ...mem, state: 'inactive' } : mem
      )
    );

    try {
      await apiClient.deactivateMemory(memoryId);
    } catch (err) {
      setStoredMemoryError(err instanceof Error ? err.message : t('memory.deleteFailed'));
      await loadStoredMemories();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!path.trim()) {
      setError(t('memory.pathRequired'));
      return;
    }

    if (path.trim().startsWith('/')) {
      setError(t('memory.pathNoSlash'));
      return;
    }

    const userId = userInfo?.user || userInfo?.subject_id;
    if (!userId) {
      setError('Unable to determine user ID. Please log in again.');
      return;
    }

    setIsCreating(true);

    try {
      const fullPath = `/memory/${userId}/${path.trim()}`;
      await apiClient.registerMemory({
        path: fullPath,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        metadata: {
          user_id: userId,
        },
      });

      resetForm();
      await loadMemories();
      setActiveTab('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('memory.registerFailed'));
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

  const getMemoryDisplayName = (path: string) => {
    const parts = path.split('/');
    const basename = parts[parts.length - 1] || path;
    return basename
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const userMemories = memories.filter((mem) => {
    const userId = userInfo?.user || userInfo?.subject_id;
    return mem.metadata?.user_id === userId;
  });

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to files">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Brain className="h-8 w-8" />
            <h1 className="text-2xl font-bold">{t('memory.title')}</h1>
          </div>
          <Button onClick={() => setActiveTab('create')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('memory.register')}
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Introduction */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              {t('memory.description')}
            </p>
          </div>

          {/* Tabs */}
          <div className="mb-6 flex items-center gap-2 border-b">
            <Button
              variant="ghost"
              className={`rounded-none border-b-2 ${
                activeTab === 'list' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => setActiveTab('list')}
            >
              {t('memory.myMemories')} ({userMemories.length})
            </Button>
            <Button
              variant="ghost"
              className={`rounded-none border-b-2 ${
                activeTab === 'stored' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => setActiveTab('stored')}
            >
              {t('memory.storedMemories')} ({storedMemories.length})
            </Button>
            <Button
              variant="ghost"
              className={`rounded-none border-b-2 ${
                activeTab === 'create' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => setActiveTab('create')}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('memory.registerNew')}
            </Button>
          </div>

          {/* Tab Content */}
          {activeTab === 'stored' ? (
            // Stored Memory Records View
            <div className="space-y-4">
              {storedMemoryError && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{storedMemoryError}</div>}

              {loadingStoredMemories ? (
                <div className="text-center py-8 text-muted-foreground">{t('memory.loading')}</div>
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
                          {memory.namespace && (
                            <div className="font-medium text-base mb-2">{memory.namespace}</div>
                          )}

                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                              memory.state === 'active'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                            }`}>
                              {memory.state === 'active' ? 'Approved' : 'Pending'}
                            </span>

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

                            {memory.importance !== null && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-xs rounded">
                                importance: {memory.importance.toFixed(2)}
                              </span>
                            )}
                          </div>

                          <p className="text-sm mb-2">{memory.content}</p>

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
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {memory.state === 'active' ? 'Approved' : 'Pending'}
                            </span>
                            <button
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
            // Memory Namespace List View
            <div className="space-y-4">
              {memoryError && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{memoryError}</div>}

              {loadingMemories ? (
                <div className="text-center py-8 text-muted-foreground">{t('memory.loading')}</div>
              ) : userMemories.length === 0 ? (
                <div className="text-center py-12">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">{t('memory.noMemories')}</p>
                  <Button onClick={() => setActiveTab('create')} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('memory.registerFirst')}
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
                  <p className="text-blue-900 dark:text-blue-100 font-semibold mb-2">About Memory Paths</p>
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
                <div className="space-y-2">
                  <label htmlFor="memory-path" className="text-sm font-medium">
                    {t('memory.path')} *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-2 bg-muted text-muted-foreground rounded-md border font-mono text-sm whitespace-nowrap">
                      /memory/{userInfo?.user || userInfo?.subject_id || 'user'}/
                    </span>
                    <Input
                      id="memory-path"
                      placeholder={t('memory.pathPlaceholder')}
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      disabled={isCreating}
                      className="font-mono flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{t('memory.pathDescription')}</p>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Quick Templates:</p>
                    <div className="flex flex-wrap gap-2">
                      {loadingWorkspaces ? (
                        <span className="text-xs text-muted-foreground">Loading workspaces...</span>
                      ) : (
                        workspaces
                          .filter((workspace) => {
                            const userId = userInfo?.user || userInfo?.subject_id;
                            const memoryPath = `/memory/${userId}${workspace.path}`;
                            return !memories.some((mem) => mem.path === memoryPath);
                          })
                          .map((workspace) => {
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
                  <p className="text-xs text-muted-foreground">{t('memory.nameDescription')}</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="memory-description" className="text-sm font-medium">
                    {t('memory.descriptionLabel')} ({t('common.close')})
                  </label>
                  <Textarea
                    id="memory-description"
                    placeholder={t('memory.descriptionPlaceholder')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isCreating}
                    rows={3}
                  />
                </div>

                {error && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{error}</div>}

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={resetForm} disabled={isCreating}>
                    {t('workspace.reset')}
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? t('memory.registering') : t('memory.registerNew')}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/20 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="font-medium">Nexus Hub</div>
          <div className="flex gap-3">
            <a href="https://github.com/nexi-lab/nexus" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Docs
            </a>
            <span>|</span>
            <a href="https://nexus.nexilab.co/health" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              API
            </a>
            <span>|</span>
            <a href="https://github.com/nexi-lab/nexus/issues" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              Help
            </a>
          </div>
        </div>
      </footer>

      <StoreMemoryDialog
        open={storeMemoryDialogOpen}
        onOpenChange={(open) => {
          setStoreMemoryDialogOpen(open);
          if (!open) {
            setSelectedNamespace(null);
            loadStoredMemories();
          }
        }}
        initialNamespace={selectedNamespace}
        onRegisterMemory={() => {
          setActiveTab('create');
        }}
      />
    </div>
  );
}
