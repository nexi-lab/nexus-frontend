import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Cloud, Database, Folder, HardDrive, Link2, Loader2, Mail, Plus, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createFilesAPI } from '../api/files';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys } from '../hooks/useFiles';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { ConnectorManagementDialog } from '../components/ConnectorManagementDialog';
import { IntegrationsPanel } from './Integrations';

// Custom icon for cloud storage services (Google Drive, OneDrive, etc.)
const CloudFolderIcon = ({ className }: { className?: string }) => (
  <div className="relative inline-block">
    <Folder className={className} />
    <Cloud className={`${className} absolute -top-1 -right-1 h-3 w-3`} />
  </div>
);

interface SavedConnector {
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

interface ActiveConnector {
  mount_point: string;
  priority: number;
  readonly: boolean;
  backend_type: string;
}

const BACKEND_ICONS: Record<string, React.ReactNode> = {
  gcs_connector: <Cloud className="h-5 w-5 text-blue-500" />,
  s3: <HardDrive className="h-5 w-5 text-orange-500" />,
  gdrive_connector: <CloudFolderIcon className="h-5 w-5 text-green-500" />,
  gmail_connector: <Mail className="h-5 w-5 text-red-500" />,
};

const BACKEND_NAMES: Record<string, string> = {
  gcs_connector: 'Google Cloud Storage',
  s3: 'Amazon S3',
  gdrive_connector: 'Google Drive',
  gmail_connector: 'Gmail',
};

export function Connectors() {
  const navigate = useNavigate();
  const { apiClient } = useAuth();
  
  if (!apiClient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium mb-2">API client not initialized</p>
          <p>Please configure your connection in the login page.</p>
        </div>
      </div>
    );
  }
  
  const queryClient = useQueryClient();
  const filesAPI = createFilesAPI(apiClient);
  const [activeTab, setActiveTab] = useState<'connectors' | 'integrations'>('connectors');
  const [addConnectorDialogOpen, setAddConnectorDialogOpen] = useState(false);
  const [loadingConnector, setLoadingConnector] = useState<string | null>(null);
  const [deletingConnector, setDeletingConnector] = useState<string | null>(null);

  // Fetch saved connectors and active connectors
  const { data: savedConnectors = [], isLoading: isLoadingSaved } = useQuery({
    queryKey: ['saved_connectors'],
    queryFn: () => filesAPI.listSavedConnectors(),
  });

  const { data: activeConnectors = [], isLoading: isLoadingActive } = useQuery({
    queryKey: fileKeys.connectors(),
    queryFn: () => filesAPI.listConnectors(),
  });

  // Create a set of active connector paths for quick lookup
  const activeConnectorPaths = new Set(activeConnectors.map((c: ActiveConnector) => c.mount_point));

  const loadConnectorMutation = useMutation({
    mutationFn: async (mount_point: string) => {
      setLoadingConnector(mount_point);
      return await filesAPI.loadConnector(mount_point);
    },
    onSuccess: async (_mountId, mount_point) => {
      toast.success(`Connector loaded successfully: ${mount_point}`);
      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: fileKeys.connectors() });
      await queryClient.invalidateQueries({ queryKey: ['saved_connectors'] });
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
    },
    onError: (error: any, mount_point) => {
      toast.error(`Failed to load connector ${mount_point}: ${error.message || 'Unknown error'}`);
    },
    onSettled: () => {
      setLoadingConnector(null);
    },
  });

  const handleLoadConnector = (mount_point: string) => {
    loadConnectorMutation.mutate(mount_point);
  };

  const deleteConnectorMutation = useMutation({
    mutationFn: async (mount_point: string) => {
      setDeletingConnector(mount_point);
      // Use the bundled delete_connector API
      return await filesAPI.deleteConnector(mount_point);
    },
    onSuccess: async (_result, mount_point) => {
      toast.success(`Connector deleted successfully: ${mount_point}`);
      // Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['saved_connectors'] });
      await queryClient.invalidateQueries({ queryKey: fileKeys.connectors() });
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
    },
    onError: (error: any, mount_point) => {
      toast.error(`Failed to delete connector ${mount_point}: ${error.message || 'Unknown error'}`);
    },
    onSettled: () => {
      setDeletingConnector(null);
    },
  });

  const handleDeleteConnector = (mount_point: string) => {
    if (window.confirm(`Are you sure you want to delete the connector "${mount_point}"? This will:\n- Remove the saved connector configuration\n- Delete the connector directory and all its contents\n- Deactivate the connector if it's currently active\n\nThis action cannot be undone.`)) {
      deleteConnectorMutation.mutate(mount_point);
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
            <h1 className="text-2xl font-bold">Connectors</h1>
          </div>
          <Button onClick={() => setAddConnectorDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Connector
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Introduction */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              Manage your connectors to connect external backends with Nexus. Saved connectors persist across server restarts.
            </p>
          </div>

          {/* Tabs */}
          <div className="mb-6 flex items-center gap-2">
            <Button
              variant={activeTab === 'connectors' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('connectors')}
            >
              Connectors
            </Button>
            <Button
              variant={activeTab === 'integrations' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('integrations')}
            >
              <Link2 className="h-4 w-4 mr-2" />
              Integrations
            </Button>
          </div>

          {activeTab === 'integrations' ? (
            <IntegrationsPanel embedded urlCleanupPath="/connectors" />
          ) : (
            <>
              {/* Saved Connectors List */}
          <div className="rounded-lg border bg-card">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Saved Connectors</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {savedConnectors.length > 0
                  ? `${savedConnectors.length} connector${savedConnectors.length !== 1 ? 's' : ''} configured`
                  : 'No connectors configured yet'}
              </p>
            </div>
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading connectors...</span>
                </div>
              ) : savedConnectors.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground mb-4">No saved connectors found</p>
                  <Button onClick={() => setAddConnectorDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Connector
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedConnectors.map((connector: SavedConnector) => {
                    const isActive = activeConnectorPaths.has(connector.mount_point);
                    const backendName = BACKEND_NAMES[connector.backend_type] || connector.backend_type;
                    const backendKey = connector.backend_type || '';
                    const backendKeyLower = backendKey.toLowerCase();
                    const backendIcon =
                      BACKEND_ICONS[backendKey] ||
                      (backendKeyLower.includes('gmail') ? <Mail className="h-5 w-5 text-red-500" /> : <Database className="h-5 w-5" />);
                    
                    // Parse backend_config if it's a string (JSON)
                    let backendConfig: Record<string, any> = {};
                    if (connector.backend_config) {
                      if (typeof connector.backend_config === 'string') {
                        try {
                          backendConfig = JSON.parse(connector.backend_config);
                        } catch {
                          backendConfig = {};
                        }
                      } else {
                        backendConfig = connector.backend_config;
                      }
                    }

                    return (
                      <div
                        key={connector.mount_point}
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
                                <h3 className="font-semibold truncate">{connector.mount_point}</h3>
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
                                {backendName} {connector.readonly && '(Read-only)'}
                              </p>
                              {connector.description && (
                                <p className="text-xs text-muted-foreground mb-2">{connector.description}</p>
                              )}
                              {/* Backend-specific configuration details */}
                              {connector.backend_type === 'gcs_connector' && backendConfig && (
                                <div className="text-xs text-muted-foreground mb-2 space-y-1">
                                  {backendConfig.bucket && (
                                    <div>Bucket: <span className="font-medium">{backendConfig.bucket}</span></div>
                                  )}
                                  {backendConfig.prefix && (
                                    <div>Prefix: <span className="font-medium">{backendConfig.prefix}</span></div>
                                  )}
                                </div>
                              )}
                              {connector.backend_type === 'gdrive_connector' && backendConfig && (
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
                                <span>Priority: {connector.priority}</span>
                                {connector.tenant_id && <span>Tenant: {connector.tenant_id}</span>}
                                {connector.created_at && (
                                  <span>Created: {new Date(connector.created_at).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!isActive && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleLoadConnector(connector.mount_point)}
                                disabled={loadingConnector === connector.mount_point}
                              >
                                {loadingConnector === connector.mount_point ? (
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
                              onClick={() => handleDeleteConnector(connector.mount_point)}
                              disabled={deletingConnector === connector.mount_point || loadingConnector === connector.mount_point}
                              className="text-destructive hover:text-destructive"
                            >
                              {deletingConnector === connector.mount_point ? (
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
            </>
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

      {/* Add Connector Dialog */}
      <ConnectorManagementDialog
        open={addConnectorDialogOpen}
        onOpenChange={setAddConnectorDialogOpen}
        onSuccess={() => {
          // Invalidate queries to refresh the UI
          queryClient.invalidateQueries({ queryKey: ['saved_connectors'] });
          queryClient.invalidateQueries({ queryKey: fileKeys.connectors() });
          queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
        }}
      />
    </div>
  );
}

