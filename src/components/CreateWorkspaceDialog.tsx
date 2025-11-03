import { FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateWorkspace: (path: string, name: string, description: string) => Promise<void>;
}

export function CreateWorkspaceDialog({ open, onOpenChange, onCreateWorkspace }: CreateWorkspaceDialogProps) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!workspaceName.trim()) {
      setError('Workspace name is required');
      return;
    }

    // Validate workspace name (no slashes, no special chars at start)
    if (workspaceName.includes('/')) {
      setError('Workspace name cannot contain slashes');
      return;
    }

    setIsCreating(true);

    try {
      const fullPath = `/workspace/${workspaceName.trim()}`;
      await onCreateWorkspace(fullPath, displayName.trim(), description.trim());

      // Reset form
      setWorkspaceName('');
      setDisplayName('');
      setDescription('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" />
            Create New Workspace
          </DialogTitle>
          <DialogDescription>Create a new workspace directory and register it. This will create the folder and set up permissions.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Workspace Name with fixed prefix */}
            <div className="space-y-2">
              <label htmlFor="workspace-name" className="text-sm font-medium">
                Workspace Name *
              </label>
              <div className="flex items-center gap-0">
                <span className="px-3 py-2 bg-muted text-muted-foreground border border-r-0 rounded-l-md font-mono text-sm">/workspace/</span>
                <Input
                  id="workspace-name"
                  placeholder="my-workspace"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  disabled={isCreating}
                  className="font-mono rounded-l-none"
                />
              </div>
              <p className="text-xs text-muted-foreground">Name for your workspace (e.g., my-project, joe_personal)</p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <label htmlFor="display-name" className="text-sm font-medium">
                Display Name
              </label>
              <Input id="display-name" placeholder="My Workspace" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={isCreating} />
              <p className="text-xs text-muted-foreground">Optional friendly name for the workspace</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label htmlFor="workspace-description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="workspace-description"
                placeholder="Describe the purpose of this workspace..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isCreating}
                rows={3}
              />
            </div>

            {error && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{error}</div>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
