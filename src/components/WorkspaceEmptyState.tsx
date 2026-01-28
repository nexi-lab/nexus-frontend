import { useState } from 'react';
import { FolderPlus, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { UserProvisioningDialog } from './UserProvisioningDialog';

interface WorkspaceEmptyStateProps {
  onWorkspaceCreated: () => void;
}

export function WorkspaceEmptyState({ onWorkspaceCreated }: WorkspaceEmptyStateProps) {
  const [provisionDialogOpen, setProvisionDialogOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="max-w-md space-y-4">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl" />
              <div className="relative bg-primary/5 rounded-full p-6">
                <FolderPlus className="h-16 w-16 text-primary" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-semibold tracking-tight">Welcome to Nexus!</h2>

          {/* Description */}
          <p className="text-muted-foreground">
            Your workspace hasn't been set up yet. Let's create your personal workspace with
            folders, agents, and skills to get you started.
          </p>

          {/* Features list */}
          <div className="pt-4 space-y-3 text-sm text-left">
            <div className="flex items-start gap-3 text-muted-foreground">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Complete directory structure</div>
                <div className="text-xs">Workspace, memory, skill, agent, connector, and resource folders</div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-muted-foreground">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">AI agents</div>
                <div className="text-xs">ImpersonatedUser and UntrustedAgent for testing</div>
              </div>
            </div>
            <div className="flex items-start gap-3 text-muted-foreground">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Useful skills</div>
                <div className="text-xs">skill-creator, PDF tools, and more</div>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="pt-6">
            <Button
              size="lg"
              onClick={() => setProvisionDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Set up my workspace
            </Button>
          </div>

          {/* Help text */}
          <p className="text-xs text-muted-foreground pt-2">
            This only takes a few seconds and you can customize what gets installed
          </p>
        </div>
      </div>

      <UserProvisioningDialog
        open={provisionDialogOpen}
        onOpenChange={setProvisionDialogOpen}
        onSuccess={onWorkspaceCreated}
      />
    </>
  );
}
