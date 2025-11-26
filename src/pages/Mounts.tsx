import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Cloud, Database, Folder, HardDrive, Loader2, Mail, Plus, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys } from '../hooks/useFiles';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { MountManagementDialog } from '../components/MountManagementDialog';

// Custom icon for cloud storage services (Google Drive, OneDrive, etc.)
const CloudFolderIcon = ({ className }: { className?: string }) => (
  <div className="relative inline-block">
    <Folder className={className} />
    <Cloud className={`${className} absolute -top-1 -right-1 h-3 w-3`} />
  </div>
);

interface SavedMount {
  mount_point: string;
  backend_type: string;
  backend_config: Record<string, any>;
  priority: number;
  readonly: boolean;
  description?: string;
  owner_user_id?: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface ActiveMount {
  mount_point: string;
  priority: number;
  readonly: boolean;
  backend_type: string;
}

const BACKEND_ICONS: Record<string, React.ReactNode> = {
  gcs_connector: <Cloud className="h-5 w-5 text-blue-500" />,
  s3: <HardDrive className="h-5 w-5 text-orange-500" />,
  gdrive_connector: <CloudFolderIcon className="h-5 w-5 text-green-500" />,
  gmail: <Mail className="h-5 w-5 text-red-500" />,
};

const BACKEND_NAMES: Record<string, string> = {
  gcs_connector: 'Google Cloud Storage',
  s3: 'Amazon S3',
  gdrive_connector: 'Google Drive',
  gmail: 'Gmail',
};

export function Mounts() {
  const navigate = useNavigate();
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const filesAPI = createFilesAPI(apiClient);
  const [addMountDialogOpen, setAddMountDialogOpen] = useState(false);
  const [loadingMount, setLoadingMount] = useState<string | null>(null);
  const [deletingMount, setDeletingMount] = useState<string | null>(null);

  // Fetch saved mounts and active mounts
  const { data: savedMounts = [], isLoading: isLoadingSaved } = useQuery({
    queryKey: ['saved_mounts'],
    queryFn: () => filesAPI.listSavedMounts(),
  });

  const { data: activeMounts = [], isLoading: isLoadingActive } = useQuery({
    queryKey: fileKeys.mounts(),
    queryFn: () => filesAPI.listMounts(),
  });

  // Create a set of active mount points for quick lookup
  const activeMountPoints = new Set(activeMounts.map((m: ActiveMount) => m.mount_point));

  const loadMountMutation = useMutation({
    mutationFn: async (mount_point: string) => {
      setLoadingMount(mount_point);
      return await filesAPI.loadMount(mount_point);
    },
    onSuccess: async (_mountId, mount_point) => {
      toast.success(`Mount loaded successfully: ${mount_point}`);
      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: fileKeys.mounts() });
      await queryClient.invalidateQueries({ queryKey: ['saved_mounts'] });
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
    },
    onError: (error: any, mount_point) => {
      toast.error(`Failed to load mount ${mount_point}: ${error.message || 'Unknown error'}`);
    },
    onSettled: () => {
      setLoadingMount(null);
    },
  });

  const handleLoadMount = (mount_point: string) => {
    loadMountMutation.mutate(mount_point);
  };

  const deleteMountMutation = useMutation({
    mutationFn: async (mount_point: string) => {
      setDeletingMount(mount_point);
      // First, try to remove the mount if it's active (deactivate it and delete directory)
      try {
        await apiClient.call('remove_mount', { mount_point });
      } catch (error) {
        // Mount might not be active, continue
        console.log('Mount not active or already removed:', error);
      }
      
      // Always try to delete the directory to ensure it's removed
      // (remove_mount should handle this, but we ensure it as a fallback)
      try {
        await filesAPI.rmdir(mount_point, true);
      } catch (dirError: any) {
        // Directory might not exist (already deleted by remove_mount) or other error
        // Only log if it's not a "not found" error
        if (dirError?.message && !dirError.message.includes('not found') && !dirError.message.includes('does not exist')) {
          console.warn('Directory deletion warning:', dirError);
        }
      }
      
      // Finally, delete the saved mount configuration
      return await filesAPI.deleteSavedMount(mount_point);
    },
    onSuccess: async (_result, mount_point) => {
      toast.success(`Mount deleted successfully: ${mount_point}`);
      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['saved_mounts'] });
      await queryClient.invalidateQueries({ queryKey: fileKeys.mounts() });
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
    },
    onError: (error: any, mount_point) => {
      toast.error(`Failed to delete mount ${mount_point}: ${error.message || 'Unknown error'}`);
    },
    onSettled: () => {
      setDeletingMount(null);
    },
  });

  const handleDeleteMount = (mount_point: string) => {
    if (window.confirm(`Are you sure you want to delete the mount "${mount_point}"? This will:\n- Remove the saved mount configuration\n- Delete the mount point directory and all its contents\n- Deactivate the mount if it's currently active\n\nThis action cannot be undone.`)) {
      deleteMountMutation.mutate(mount_point);
    }
  };

  const isLoading = isLoadingSaved || isLoadingActive;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to files">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Database className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Mounts</h1>
          </div>
          <Button onClick={() => setAddMountDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Mount
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Introduction */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              Manage your storage mounts to connect external backends with Nexus. Saved mounts persist across server restarts.
            </p>
          </div>

          {/* Saved Mounts List */}
          <div className="rounded-lg border bg-card">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Saved Mounts</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {savedMounts.length > 0
                  ? `${savedMounts.length} mount${savedMounts.length !== 1 ? 's' : ''} configured`
                  : 'No mounts configured yet'}
              </p>
            </div>
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading mounts...</span>
                </div>
              ) : savedMounts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground mb-4">No saved mounts found</p>
                  <Button onClick={() => setAddMountDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Mount
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedMounts.map((mount: SavedMount) => {
                    const isActive = activeMountPoints.has(mount.mount_point);
                    const backendName = BACKEND_NAMES[mount.backend_type] || mount.backend_type;
                    const backendIcon = BACKEND_ICONS[mount.backend_type] || <Database className="h-5 w-5" />;
                    
                    // Parse backend_config if it's a string (JSON)
                    let backendConfig: Record<string, any> = {};
                    if (mount.backend_config) {
                      if (typeof mount.backend_config === 'string') {
                        try {
                          backendConfig = JSON.parse(mount.backend_config);
                        } catch {
                          backendConfig = {};
                        }
                      } else {
                        backendConfig = mount.backend_config;
                      }
                    }

                    return (
                      <div
                        key={mount.mount_point}
                        className={`rounded-lg border p-4 hover:bg-muted/50 transition-colors ${
                          isActive
                            ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'
                            : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="mt-0.5">{backendIcon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold truncate">{mount.mount_point}</h3>
                                {isActive && (
                                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 flex items-center gap-1 flex-shrink-0">
                                    <Play className="h-3 w-3" />
                                    Active
                                  </span>
                                )}
                                {!isActive && (
                                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 flex-shrink-0">
                                    Not Loaded
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {backendName} {mount.readonly && '(Read-only)'}
                              </p>
                              {mount.description && (
                                <p className="text-xs text-muted-foreground mb-2">{mount.description}</p>
                              )}
                              {/* Backend-specific configuration details */}
                              {mount.backend_type === 'gcs_connector' && backendConfig && (
                                <div className="text-xs text-muted-foreground mb-2 space-y-1">
                                  {backendConfig.bucket && (
                                    <div>Bucket: <span className="font-medium">{backendConfig.bucket}</span></div>
                                  )}
                                  {backendConfig.prefix && (
                                    <div>Prefix: <span className="font-medium">{backendConfig.prefix}</span></div>
                                  )}
                                </div>
                              )}
                              {mount.backend_type === 'gdrive_connector' && backendConfig && (
                                <div className="text-xs text-muted-foreground mb-2 space-y-1">
                                  {backendConfig.user_email && (
                                    <div>User: <span className="font-medium">{backendConfig.user_email}</span></div>
                                  )}
                                  {backendConfig.root_folder && (
                                    <div>Root Folder: <span className="font-medium">{backendConfig.root_folder}</span></div>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>Priority: {mount.priority}</span>
                                {mount.tenant_id && <span>Tenant: {mount.tenant_id}</span>}
                                {mount.created_at && (
                                  <span>Created: {new Date(mount.created_at).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!isActive && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleLoadMount(mount.mount_point)}
                                disabled={loadingMount === mount.mount_point}
                              >
                                {loadingMount === mount.mount_point ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Loading...
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Load
                                  </>
                                )}
                              </Button>
                            )}
                            {isActive && (
                              <Button variant="outline" size="sm" disabled>
                                <Play className="h-4 w-4 mr-2" />
                                Active
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteMount(mount.mount_point)}
                              disabled={deletingMount === mount.mount_point || loadingMount === mount.mount_point}
                              className="text-destructive hover:text-destructive"
                            >
                              {deletingMount === mount.mount_point ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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

      {/* Add Mount Dialog */}
      <MountManagementDialog
        open={addMountDialogOpen}
        onOpenChange={setAddMountDialogOpen}
        onSuccess={() => {
          // Invalidate queries to refresh the UI
          queryClient.invalidateQueries({ queryKey: ['saved_mounts'] });
          queryClient.invalidateQueries({ queryKey: fileKeys.mounts() });
          queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
        }}
      />
    </div>
  );
}

