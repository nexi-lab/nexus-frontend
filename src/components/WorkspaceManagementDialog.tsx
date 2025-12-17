import { Calendar, Folder, FolderPlus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

interface WorkspaceManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateWorkspace: (path: string, name: string, description: string) => Promise<void>;
}

interface Workspace {
  path: string;
  name: string | null;
  description: string;
  created_at: string;
  created_by: string | null;
  metadata: Record<string, any>;
}

export function WorkspaceManagementDialog({ open, onOpenChange, onCreateWorkspace }: WorkspaceManagementDialogProps) {
  const { userInfo, apiClient } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Workspace list state
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Create workspace state
  const [workspaceName, setWorkspaceName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load workspaces when dialog opens
  useEffect(() => {
    if (open) {
      loadWorkspaces();
    }
  }, [open]);

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
      await apiClient.unregisterWorkspace(path);
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

    // Validate workspace name (alphanumeric, underscores, hyphens only)
    if (!/^[a-zA-Z0-9_-]+$/.test(workspaceName.trim())) {
      setError('Workspace name must contain only letters, numbers, underscores, and hyphens');
      return;
    }

    // Get user_id from userInfo
    const userId = userInfo?.user || userInfo?.subject_id;
    if (!userId) {
      setError('Unable to determine user ID. Please log in again.');
      return;
    }

    // Compose full path as /workspace/<user_id>/<workspace_name>
    const fullPath = `/workspace/${userId}/${workspaceName.trim()}`;

    setIsCreating(true);

    try {
      await onCreateWorkspace(fullPath, workspaceName.trim(), description.trim());

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

  const handleClose = () => {
    resetForm();
    setActiveTab('list');
    onOpenChange(false);
  };

  // Extract workspace name from full path (/workspace/<user_id>/<workspace_name>)
  const getWorkspaceDisplayName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  // Filter to only show user's workspaces
  const userWorkspaces = workspaces.filter((ws) => {
    const userId = userInfo?.user || userInfo?.subject_id;
    return ws.path.startsWith(`/workspace/${userId}/`);
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" />
            Workspace Management
          </DialogTitle>
          <DialogDescription>Manage your workspaces for organizing files and projects.</DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            type="button"
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'list' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('list')}
          >
            My Workspaces ({userWorkspaces.length})
          </button>
          <button
            type="button"
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'create' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('create')}
          >
            <Plus className="h-4 w-4 inline mr-1" />
            New Workspace
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto py-4">
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
                  <strong>💡 About workspaces:</strong> Workspaces organize your files and enable snapshots for version control. All workspaces are under{' '}
                  <code className="bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">/workspace/{userInfo?.user || 'user'}/</code>
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
                  <div className="flex items-center gap-0">
                    <span className="px-3 py-2 bg-muted text-muted-foreground border border-r-0 rounded-l-md font-mono text-sm whitespace-nowrap">
                      /workspace/{userInfo?.user || 'user'}/
                    </span>
                    <Input
                      id="workspace-name"
                      placeholder="my-project"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      disabled={isCreating}
                      className="font-mono rounded-l-none"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Unique name for your workspace (letters, numbers, underscores, hyphens only)</p>
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
                {isCreating ? 'Creating...' : 'Create Workspace'}
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
