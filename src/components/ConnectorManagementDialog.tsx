import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, Folder, HardDrive, Mail, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys } from '../hooks/useFiles';
import { userPath } from '../utils/pathUtils';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// Custom icon for cloud storage services (Google Drive, OneDrive, etc.)
const CloudFolderIcon = ({ className }: { className?: string }) => (
  <div className="relative inline-block">
    <Folder className={className} />
    <Cloud className={`${className} absolute -top-1 -right-1 h-3 w-3`} />
  </div>
);

type BackendType = 'gcs_connector' | 's3' | 'gdrive_connector' | 'gmail_connector';

interface ConnectorManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface GCSConfig {
  bucket: string;
  project_id: string;
  prefix: string;
  access_token: string;
}

interface GoogleDriveConfig {
  user_email: string;
  root_folder: string;
}

interface GmailConfig {
  user_email: string;
  max_message_per_label: number;
}

export function ConnectorManagementDialog({
  open,
  onOpenChange,
  onSuccess,
}: ConnectorManagementDialogProps) {
  const { apiClient, userInfo } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [selectedBackend, setSelectedBackend] = useState<BackendType>('gcs_connector');
  
  // Get current user's user_id (preferred) or user (fallback)
  const currentUserId = userInfo?.subject_id || userInfo?.user || null;
  
  // Check for Google Drive OAuth credentials
  const { data: gdriveCredentials = [] } = useQuery({
    queryKey: ['oauth_credentials', 'google-drive'],
    queryFn: async () => {
      try {
        return await apiClient.oauthListCredentials({ 
          provider: 'google-drive',
          include_revoked: false 
        });
      } catch (error) {
        console.error('Failed to load Google Drive credentials:', error);
        return [];
      }
    },
    enabled: open && selectedBackend === 'gdrive_connector',
  });
  
  // Find active Google Drive credential for current user
  const activeGdriveCredential = gdriveCredentials.find((cred) => {
    if (cred.revoked) return false;
    if (cred.user_id) {
      return cred.user_id === currentUserId;
    }
    return cred.user_email === currentUserId;
  });

  // Check for Gmail OAuth credentials
  const { data: gmailCredentials = [] } = useQuery({
    queryKey: ['oauth_credentials', 'gmail'],
    queryFn: async () => {
      try {
        return await apiClient.oauthListCredentials({ 
          provider: 'gmail',
          include_revoked: false 
        });
      } catch (error) {
        console.error('Failed to load Gmail credentials:', error);
        return [];
      }
    },
    enabled: open && selectedBackend === 'gmail_connector',
  });
  
  // Find active Gmail credential for current user
  const activeGmailCredential = gmailCredentials.find((cred) => {
    if (cred.revoked) return false;
    if (cred.user_id) {
      return cred.user_id === currentUserId;
    }
    return cred.user_email === currentUserId;
  });

  // Form state
  const [connectorName, setConnectorName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('10');
  const [readonly, setReadonly] = useState(false);

  // Compute full connector path using new convention: /tenant:<tenantId>/user:<userId>/connector/<name>
  // Use connector name directly (sanitized, no spaces)
  const tenantId = userInfo?.tenant_id || 'default';
  const userId = userInfo?.subject_id || userInfo?.user || 'anonymous';
  // Sanitize connector name: remove spaces, keep alphanumeric, underscore, hyphen
  const sanitizedName = connectorName ? connectorName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') : '';
  const fullConnectorPath = sanitizedName ? userPath(tenantId, userId, 'connector', sanitizedName) : '';

  // GCS specific config
  const [gcsConfig, setGcsConfig] = useState<GCSConfig>({
    bucket: '',
    project_id: '',
    prefix: '',
    access_token: '',
  });

  // Google Drive specific config
  const [gdriveConfig, setGdriveConfig] = useState<Omit<GoogleDriveConfig, 'token_manager_db'>>({
    user_email: '',
    root_folder: 'nexus-data',
  });
  
  // Gmail specific config
  const [gmailConfig, setGmailConfig] = useState<Omit<GmailConfig, 'token_manager_db'>>({
    user_email: '',
    max_message_per_label: 200, // Default: 200 messages per folder
  });
  
  // Auto-fill user_email from OAuth credential when available
  useEffect(() => {
    if (selectedBackend === 'gdrive_connector' && activeGdriveCredential) {
      setGdriveConfig((prev) => ({
        ...prev,
        user_email: activeGdriveCredential.user_email,
      }));
    }
    if (selectedBackend === 'gmail_connector' && activeGmailCredential) {
      setGmailConfig((prev) => ({
        ...prev,
        user_email: activeGmailCredential.user_email,
      }));
    }
  }, [selectedBackend, activeGdriveCredential, activeGmailCredential]);


  const createConnectorMutation = useMutation({
    mutationFn: async (params: {
      mount_point: string;
      backend_type: string;
      backend_config: Record<string, any>;
      priority: number;
      readonly: boolean;
      description: string;
    }) => {
      // First save the connector
      const saveResult = await apiClient.call<string>('save_mount', params);
      console.log('Connector saved with ID:', saveResult);

      // Then load the connector to activate it
      const loadResult = await apiClient.call<string>('load_mount', {
        mount_point: params.mount_point,
      });
      console.log('Connector loaded:', loadResult);

      // Finally, sync the connector to import existing files (only for cloud backends)
      if (params.backend_type.includes('connector') || params.backend_type.includes('gcs')) {
        try {
          const syncResult = await apiClient.call<{
            files_found?: number;
            files_added?: number;
            files_updated?: number;
            files_scanned?: number;
            files_created?: number;
            errors: number;
          }>('sync_mount', {
            mount_point: params.mount_point,
            recursive: true,
          });
          console.log('Connector synced:', syncResult);
          return { connectorPath: loadResult, syncResult };
        } catch (syncError) {
          console.warn('Sync failed but connector was created:', syncError);
          return { connectorPath: loadResult, syncResult: null };
        }
      }

      return { connectorPath: loadResult, syncResult: null };
    },
    onSuccess: async (result) => {
      const { connectorPath, syncResult } = result as any;

      if (syncResult) {
        const filesScanned = syncResult.files_scanned || syncResult.files_found || 0;
        const filesAdded = syncResult.files_created || syncResult.files_added || 0;
        toast.success(`Connector created and synced: ${connectorPath}\n${filesScanned} files scanned, ${filesAdded} imported`);
      } else {
        toast.success(`Connector created successfully: ${connectorPath}`);
      }

      // Invalidate connectors and file lists to refresh the UI
      await queryClient.invalidateQueries({ queryKey: fileKeys.connectors() });
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
      await queryClient.invalidateQueries({ queryKey: ['saved_connectors'] });
      handleClose();
      // Call onSuccess callback if provided (for parent component to refresh)
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: any) => {
      console.error('Failed to create connector:', error);
      toast.error(`Failed to create connector: ${error.message || 'Unknown error'}`);
    },
  });

  const handleClose = () => {
    setStep('select');
    setConnectorName('');
    setDescription('');
    setPriority('10');
    setReadonly(false);
    setGcsConfig({ bucket: '', project_id: '', prefix: '', access_token: '' });
    setGdriveConfig({ user_email: '', root_folder: 'nexus-data' });
    onOpenChange(false);
  };

  const handleBackendSelect = async (backend: BackendType) => {
    // For Google Drive, check if OAuth credentials exist
    if (backend === 'gdrive_connector') {
      try {
        const credentials = await apiClient.oauthListCredentials({ 
          provider: 'google-drive',
          include_revoked: false 
        });
        
        // Find active credential for current user
        const activeCredential = credentials.find((cred) => {
          if (cred.revoked) return false;
          if (cred.user_id) {
            return cred.user_id === currentUserId;
          }
          return cred.user_email === currentUserId;
        });
        
        if (!activeCredential) {
          // No OAuth credential - redirect to integrations page
          toast.info('Please connect Google Drive in Integrations first');
          onOpenChange(false);
          navigate('/integrations');
          return;
        }
      } catch (error) {
        console.error('Failed to check Google Drive credentials:', error);
        toast.error('Failed to check OAuth credentials. Please try again.');
        return;
      }
    }
    
    setSelectedBackend(backend);
    setStep('configure');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate connector name
    if (!connectorName || connectorName.trim() === '') {
      toast.error('Connector name is required');
      return;
    }
    if (/\s/.test(connectorName)) {
      toast.error('Connector name cannot contain spaces');
      return;
    }

    // Build backend config based on selected backend
    let backendConfig: Record<string, any> = {};
    let backendType = selectedBackend; // Use separate variable for backend_type

    if (selectedBackend === 'gcs_connector') {
      if (!gcsConfig.bucket || !gcsConfig.project_id) {
        toast.error('Bucket and Project ID are required for GCS');
        return;
      }
      backendConfig = {
        bucket: gcsConfig.bucket,
        project_id: gcsConfig.project_id,
        prefix: gcsConfig.prefix || '',
        access_token: gcsConfig.access_token || '',
      };
    } else if (selectedBackend === 'gdrive_connector') {
      // Check if OAuth credential exists
      if (!activeGdriveCredential) {
        toast.error('Google Drive OAuth credential not found. Please connect in Integrations first.');
        return;
      }
      
      // Backend will use TOKEN_MANAGER_DB env var, don't include it in config
      backendConfig = {
        root_folder: gdriveConfig.root_folder || 'nexus-data',
        user_email: activeGdriveCredential.user_email,
        provider: 'google-drive', // Specify the provider name for the connector
      };
    } else if (selectedBackend === 'gmail_connector') {
      // Check if OAuth credential exists
      if (!activeGmailCredential) {
        toast.error('Gmail OAuth credential not found. Please connect in Integrations first.');
        return;
      }
      
      // Backend will use TOKEN_MANAGER_DB env var, don't include it in config
      backendConfig = {
        user_email: activeGmailCredential.user_email,
        max_message_per_label: gmailConfig.max_message_per_label, // Maximum messages to sync per folder
        provider: 'gmail', // Specify the provider name for the connector
      };
      backendType = 'gmail_connector';
    }

    // Submit the connector
    createConnectorMutation.mutate({
      mount_point: fullConnectorPath,
      backend_type: backendType,
      backend_config: backendConfig,
      priority: parseInt(priority) || 10,
      readonly,
      description,
    });
  };

  const backendOptions = [
    {
      type: 'gcs_connector' as BackendType,
      name: 'Google Cloud Storage',
      icon: <Cloud className="h-6 w-6 text-blue-500" />,
      description: 'Connect to a GCS bucket',
      available: true,
    },
    {
      type: 's3' as BackendType,
      name: 'Amazon S3',
      icon: <HardDrive className="h-6 w-6 text-orange-500" />,
      description: 'Connect to an S3 bucket',
      available: false,
    },
    {
      type: 'gdrive_connector' as BackendType,
      name: 'Google Drive',
      icon: <CloudFolderIcon className="h-6 w-6 text-green-500" />,
      description: 'Connect to Google Drive',
      available: true,
    },
    {
      type: 'gmail_connector' as BackendType,
      name: 'Gmail',
      icon: <Mail className="h-6 w-6 text-red-500" />,
      description: 'Sync emails from Gmail',
      available: true,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Connector</DialogTitle>
          <DialogDescription>
            {step === 'select'
              ? 'Choose a backend to connect'
              : `Configure ${backendOptions.find(b => b.type === selectedBackend)?.name} connector`}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' ? (
          <div className="grid grid-cols-2 gap-4 py-4">
            {backendOptions.map((backend) => (
              <button
                key={backend.type}
                onClick={() => backend.available && handleBackendSelect(backend.type)}
                disabled={!backend.available}
                className={`flex flex-col items-center gap-3 p-6 border rounded-lg transition-all ${
                  backend.available
                    ? 'hover:border-primary hover:shadow-md cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                }`}
              >
                {backend.icon}
                <div className="text-center">
                  <div className="font-medium">{backend.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{backend.description}</div>
                  {!backend.available && (
                    <div className="text-xs text-yellow-500 mt-1">Coming Soon</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Common fields */}
            <div className="space-y-2">
              <label htmlFor="connectorName" className="text-sm font-medium">
                Connector Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="connectorName"
                placeholder="my-connector"
                value={connectorName}
                onChange={(e) => setConnectorName(e.target.value.replace(/\s+/g, ''))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Connector path: {fullConnectorPath}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="description"
                placeholder="Optional description for this connector"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* GCS specific config */}
            {selectedBackend === 'gcs_connector' && (
              <>
                <div className="space-y-2">
                  <label htmlFor="bucket" className="text-sm font-medium">
                    Bucket Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="bucket"
                    placeholder="my-connector"
                    value={gcsConfig.bucket}
                    onChange={(e) => setGcsConfig({ ...gcsConfig, bucket: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="projectId" className="text-sm font-medium">
                    Project ID <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="projectId"
                    placeholder="my-project-id"
                    value={gcsConfig.project_id}
                    onChange={(e) => setGcsConfig({ ...gcsConfig, project_id: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="prefix" className="text-sm font-medium">
                    Prefix (Optional)
                  </label>
                  <Input
                    id="prefix"
                    placeholder="folder/path"
                    value={gcsConfig.prefix}
                    onChange={(e) => setGcsConfig({ ...gcsConfig, prefix: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional prefix to limit access to a specific folder in the bucket
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="accessToken" className="text-sm font-medium">
                    Access Token (Optional)
                  </label>
                  <Input
                    id="accessToken"
                    type="password"
                    placeholder="ya29...."
                    value={gcsConfig.access_token}
                    onChange={(e) => setGcsConfig({ ...gcsConfig, access_token: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    OAuth access token. If not provided, uses Application Default Credentials
                  </p>
                </div>
              </>
            )}

            {/* Google Drive specific config */}
            {selectedBackend === 'gdrive_connector' && (
              <>
                {activeGdriveCredential ? (
                  <>
                    <div className="rounded-md bg-green-50 dark:bg-green-950 p-4 border border-green-200 dark:border-green-800">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">
                        ✓ OAuth Connected
                      </p>
                      <p className="text-xs text-green-800 dark:text-green-200">
                        Using credentials for {activeGdriveCredential.user_email}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="rootFolder" className="text-sm font-medium">
                        Root Folder <span className="text-muted-foreground">(Optional)</span>
                      </label>
                      <Input
                        id="rootFolder"
                        placeholder="nexus-data"
                        value={gdriveConfig.root_folder}
                        onChange={(e) => setGdriveConfig({ ...gdriveConfig, root_folder: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Root folder name in Google Drive (default: nexus-data)
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 p-4 border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                        OAuth Setup Required
                      </p>
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                        Google Drive requires OAuth authentication. Please connect Google Drive in the Integrations page first.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          navigate('/integrations');
                        }}
                        className="w-full"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Go to Integrations
                      </Button>
                    </div>
                )}
              </>
            )}

            {/* Gmail specific config */}
            {selectedBackend === 'gmail_connector' && (
              <>
                {activeGmailCredential ? (
                  <>
                    <div className="rounded-md bg-green-50 dark:bg-green-950 p-4 border border-green-200 dark:border-green-800">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">
                        ✓ OAuth Connected
                      </p>
                      <p className="text-xs text-green-800 dark:text-green-200">
                        Using credentials for {activeGmailCredential.user_email}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="maxMessagesPerLabel" className="text-sm font-medium">
                        Max Messages Per Label
                      </label>
                      <Input
                        id="maxMessagesPerLabel"
                        type="number"
                        min="1"
                        max="10000"
                        value={gmailConfig.max_message_per_label}
                        onChange={(e) => setGmailConfig({ ...gmailConfig, max_message_per_label: parseInt(e.target.value) || 200 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum number of messages to sync per folder (SENT, STARRED, IMPORTANT, INBOX). Default: 200. Note: Syncing takes approximately 1 minute per 200 messages.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 p-4 border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                        OAuth Setup Required
                      </p>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                        Gmail requires OAuth authentication. Please connect Gmail in the Integrations page first.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false);
                        navigate('/integrations');
                      }}
                      className="w-full"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Go to Integrations
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* Advanced options */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="priority" className="text-sm font-medium">
                  Priority
                </label>
                <Input
                  id="priority"
                  type="number"
                  placeholder="10"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Higher priority connectors are checked first</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="readonly" className="text-sm font-medium">
                  Read-only
                </label>
                <Select value={readonly ? 'true' : 'false'} onValueChange={(v) => setReadonly(v === 'true')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">No</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button type="submit" disabled={createConnectorMutation.isPending}>
                {createConnectorMutation.isPending ? 'Creating...' : 'Create Connector'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>

    </Dialog>
  );
}
