import { useState } from 'react';
import { Bot, FolderPlus, Loader2, Package, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

interface UserProvisioningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UserProvisioningDialog({
  open,
  onOpenChange,
  onSuccess,
}: UserProvisioningDialogProps) {
  const { apiClient, userInfo, userAccount } = useAuth();
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [createAgents, setCreateAgents] = useState(true);
  const [importSkills, setImportSkills] = useState(true);

  const handleProvision = async () => {
    if (!apiClient || !userInfo) {
      toast.error('Not authenticated. Please log in first.');
      return;
    }

    try {
      setIsProvisioning(true);

      // Determine user details
      const userId = userInfo.subject_id || 'unknown';
      const email = userAccount?.email || `${userId}@nexus.local`;
      const displayName = userAccount?.display_name || userId;
      const tenantId = userInfo.tenant_id;

      toast.info('Setting up your workspace...', {
        description: 'This may take a few moments',
      });

      // Call provision_user API
      const result = await apiClient.provisionUser({
        user_id: userId,
        email: email,
        display_name: displayName,
        tenant_id: tenantId,
        create_api_key: false, // Don't create new API key (user already has one)
        create_agents: createAgents,
        import_skills: importSkills,
      });

      // Show success message with details
      const resourceCount =
        result.created_resources.directories.length +
        result.created_resources.agents.length +
        result.created_resources.skills.length;

      toast.success('Workspace created successfully!', {
        description: `Created ${resourceCount} resources`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Provisioning failed:', error);
      toast.error('Failed to create workspace', {
        description: error.message || 'Please try again or contact support',
      });
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <DialogTitle className="text-xl">Welcome to Nexus!</DialogTitle>
          </div>
          <DialogDescription>
            Let's set up your personal workspace. We'll create folders, install agents, and
            import skills to get you started.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Resources Overview */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FolderPlus className="h-4 w-4 text-primary" />
              <span>Directories to create:</span>
            </div>
            <ul className="ml-6 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="font-mono text-xs">workspace/</span> - Your personal workspace
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="font-mono text-xs">memory/</span> - Memory storage
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="font-mono text-xs">skill/</span> - Skills directory
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="font-mono text-xs">agent/</span> - Agents directory
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="font-mono text-xs">connector/</span> - External storage connectors
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="font-mono text-xs">resource/</span> - Shared resources
              </li>
            </ul>
          </div>

          {/* Configuration Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="create-agents" className="cursor-pointer">
                  Install default agents
                </Label>
              </div>
              <Switch
                id="create-agents"
                checked={createAgents}
                onCheckedChange={setCreateAgents}
                disabled={isProvisioning}
              />
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Creates ImpersonatedUser and UntrustedAgent for testing
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="import-skills" className="cursor-pointer">
                  Import default skills
                </Label>
              </div>
              <Switch
                id="import-skills"
                checked={importSkills}
                onCheckedChange={setImportSkills}
                disabled={isProvisioning}
              />
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Imports skill-creator, PDF tools, and other useful skills
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProvisioning}
          >
            Cancel
          </Button>
          <Button onClick={handleProvision} disabled={isProvisioning}>
            {isProvisioning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating workspace...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Create workspace
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
