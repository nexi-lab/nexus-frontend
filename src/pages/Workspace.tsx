import { ArrowLeft, Calendar, Folder, FolderPlus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { createWorkspace } from '../utils/resourceUtils';
import { deleteWorkspace } from '../utils/resourceUtils';

interface WorkspaceData {
  path: string;
  name: string | null;
  description: string;
  created_at: string;
  created_by: string | null;
  metadata: Record<string, any>;
}

export function Workspace() {
  const navigate = useNavigate();
  const { userInfo, apiClient } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Workspace list state
  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Create workspace state
  const [workspaceName, setWorkspaceName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load workspaces on mount and when switching to list tab
  useEffect(() => {
    if (activeTab === 'list') {
      loadWorkspaces();
    }
  }, [activeTab]);

  const loadWorkspaces = async () => {
    setLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const workspaceList = await apiClient.listWorkspaces();
      setWorkspaces(workspaceList);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoadingWorkspaces(false);
    }
  };

  const handleDeleteWorkspace = async (path: string, name: string | null) => {
    const displayName = name || path;
    if (!confirm(`Are you sure you want to unregister workspace "${displayName}"?\n\nNote: Files will NOT be deleted, only the workspace registration.`)) {
      return;
    }

    try {
      // Pass apiClient to use the authenticated user's API key, not from environment
      await deleteWorkspace(path, apiClient);
      await loadWorkspaces(); // Refresh list
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to unregister workspace');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!workspaceName.trim()) {
      setError('Workspace name is required');
      return;
    }

    // Get user_id and tenant_id from userInfo
    const userId = userInfo?.user || userInfo?.subject_id;
    const tenantId = userInfo?.tenant_id || 'default';
    
    if (!userId) {
      setError('Unable to determine user ID. Please log in again.');
      return;
    }

    setIsCreating(true);

    try {
      // Use new convention path helper with automatic ReBAC ownership
      // Pass apiClient to use the authenticated user's API key, not from environment
      await createWorkspace(
        workspaceName.trim(),
        tenantId,
        userId,
        apiClient,
        description.trim() || undefined
      );

      // Success - reset form and switch to list view
      resetForm();
      await loadWorkspaces(); // Refresh the list
      setActiveTab('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setWorkspaceName('');
    setDescription('');
    setError(null);
  };

  // Extract workspace name from full path (/workspace/<user_id>/<workspace_name>)
  const getWorkspaceDisplayName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  // Filter to only show user's workspaces (both old and new convention paths)
  const userWorkspaces = workspaces.filter((ws) => {
    const userId = userInfo?.user || userInfo?.subject_id;
    const tenantId = userInfo?.tenant_id || 'default';
    // Support both old convention (/workspace/userId/...) and new convention (/tenant:.../user:.../workspace/...)
    return ws.path.startsWith(`/workspace/${userId}/`) || 
           ws.path.includes(`/user:${userId}/workspace/`) ||
           (tenantId && ws.path.includes(`/tenant:${tenantId}/user:${userId}/workspace/`));
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
            <FolderPlus className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Workspace</h1>
          </div>
          <Button onClick={() => setActiveTab('create')}>
            <Plus className="h-4 w-4 mr-2" />
            New Workspace
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Introduction */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              Manage your workspaces for organizing files and projects. Workspaces support version control through snapshots.
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
              My Workspaces ({userWorkspaces.length})
            </Button>
            <Button
              variant="ghost"
              className={`rounded-none border-b-2 ${
                activeTab === 'create' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => setActiveTab('create')}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Workspace
            </Button>
          </div>

          {/* Tab Content */}
          {activeTab === 'list' ? (
            // Workspace List View
            <div className="space-y-4">
              {workspaceError && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{workspaceError}</div>}

              {loadingWorkspaces ? (
                <div className="text-center py-8 text-muted-foreground">Loading workspaces...</div>
              ) : userWorkspaces.length === 0 ? (
                <div className="text-center py-12">
                  <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">No workspaces created yet</p>
                  <Button onClick={() => setActiveTab('create')} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Workspace
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {userWorkspaces.map((workspace) => {
                    const displayName = workspace.name || getWorkspaceDisplayName(workspace.path);

                    return (
                      <div key={workspace.path} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Folder className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{displayName}</span>
                          </div>
                          <div className="text-sm text-muted-foreground font-mono mb-1">{workspace.path}</div>
                          {workspace.description && <div className="text-sm text-muted-foreground mb-2">{workspace.description}</div>}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Created {new Date(workspace.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteWorkspace(workspace.path, workspace.name)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm mt-4">
                <p className="text-blue-900 dark:text-blue-100">
                  <strong>About workspaces:</strong> Workspaces organize your files and enable snapshots for version control. Workspaces are created using the multi-tenant namespace convention with automatic ReBAC ownership.
                </p>
              </div>
            </div>
          ) : (
            // Create Workspace Form
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                {/* Workspace Name */}
                <div className="space-y-2">
                  <label htmlFor="workspace-name" className="text-sm font-medium">
                    Workspace Name *
                  </label>
                  <Input
                    id="workspace-name"
                    placeholder="my-project"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    disabled={isCreating}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">Workspace name (will be automatically placed in tenant/user namespace with UUID suffix)</p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label htmlFor="workspace-description" className="text-sm font-medium">
                    Description
                  </label>
                  <Textarea
                    id="workspace-description"
                    placeholder="Project description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isCreating}
                    rows={3}
                  />
                </div>

                {/* Info Box */}
                <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                  <p className="font-medium">What are workspaces?</p>
                  <p className="text-muted-foreground">
                    Workspaces are registered directories that support version control through snapshots. You can create snapshots, restore to previous
                    versions, and compare changes.
                  </p>
                </div>

                {error && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{error}</div>}

                {/* Submit Button */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={resetForm} disabled={isCreating}>
                    Reset
                  </Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating ? 'Creating...' : 'Create Workspace'}
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
    </div>
  );
}
