import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud, Database, HardDrive, Mail } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { fileKeys } from '../hooks/useFiles';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

type BackendType = 'gcs_connector' | 's3' | 'gdrive_connector' | 'gmail';

interface MountManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMountPoint?: string;
}

interface GCSConfig {
  bucket: string;
  project_id: string;
  prefix: string;
  access_token: string;
}

export function MountManagementDialog({ open, onOpenChange, initialMountPoint }: MountManagementDialogProps) {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'select' | 'configure'>(initialMountPoint ? 'configure' : 'select');
  const [selectedBackend, setSelectedBackend] = useState<BackendType>('gcs_connector');

  // Form state
  const [mountName, setMountName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('10');
  const [readonly, setReadonly] = useState(false);

  // Compute full mount point from prefix + name
  const fullMountPoint = initialMountPoint
    ? `${initialMountPoint}/${mountName}`.replace(/\/+/g, '/')
    : `/${mountName}`.replace(/\/+/g, '/');

  // GCS specific config
  const [gcsConfig, setGcsConfig] = useState<GCSConfig>({
    bucket: '',
    project_id: '',
    prefix: '',
    access_token: '',
  });

  const createMountMutation = useMutation({
    mutationFn: async (params: {
      mount_point: string;
      backend_type: string;
      backend_config: Record<string, any>;
      priority: number;
      readonly: boolean;
      description: string;
    }) => {
      // First save the mount
      const saveResult = await apiClient.call<string>('save_mount', params);
      console.log('Mount saved with ID:', saveResult);

      // Then load the mount to activate it
      const loadResult = await apiClient.call<string>('load_mount', {
        mount_point: params.mount_point,
      });
      console.log('Mount loaded:', loadResult);

      // Finally, sync the mount to import existing files (only for cloud backends)
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
          console.log('Mount synced:', syncResult);
          return { mountPoint: loadResult, syncResult };
        } catch (syncError) {
          console.warn('Sync failed but mount was created:', syncError);
          return { mountPoint: loadResult, syncResult: null };
        }
      }

      return { mountPoint: loadResult, syncResult: null };
    },
    onSuccess: async (result) => {
      const { mountPoint, syncResult } = result as any;

      if (syncResult) {
        const filesScanned = syncResult.files_scanned || syncResult.files_found || 0;
        const filesAdded = syncResult.files_created || syncResult.files_added || 0;
        toast.success(`Mount created and synced: ${mountPoint}\n${filesScanned} files scanned, ${filesAdded} imported`);
      } else {
        toast.success(`Mount created successfully: ${mountPoint}`);
      }

      // Invalidate mounts and file lists to refresh the UI
      await queryClient.invalidateQueries({ queryKey: fileKeys.mounts() });
      await queryClient.invalidateQueries({ queryKey: fileKeys.lists() });
      handleClose();
    },
    onError: (error: any) => {
      console.error('Failed to create mount:', error);
      toast.error(`Failed to create mount: ${error.message || 'Unknown error'}`);
    },
  });

  const handleClose = () => {
    setStep(initialMountPoint ? 'configure' : 'select');
    setMountName('');
    setDescription('');
    setPriority('10');
    setReadonly(false);
    setGcsConfig({ bucket: '', project_id: '', prefix: '', access_token: '' });
    onOpenChange(false);
  };

  const handleBackendSelect = (backend: BackendType) => {
    setSelectedBackend(backend);
    setStep('configure');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate mount name
    if (!mountName || mountName.trim() === '') {
      toast.error('Mount name is required');
      return;
    }

    // Build backend config based on selected backend
    let backendConfig: Record<string, any> = {};

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
    }

    // Submit the mount
    createMountMutation.mutate({
      mount_point: fullMountPoint,
      backend_type: selectedBackend,
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
      icon: <Database className="h-6 w-6 text-green-500" />,
      description: 'Connect to Google Drive',
      available: false,
    },
    {
      type: 'gmail' as BackendType,
      name: 'Gmail',
      icon: <Mail className="h-6 w-6 text-red-500" />,
      description: 'Connect to Gmail',
      available: false,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Mount</DialogTitle>
          <DialogDescription>
            {step === 'select'
              ? 'Choose a backend to mount'
              : `Configure ${backendOptions.find(b => b.type === selectedBackend)?.name} mount`}
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
            {initialMountPoint && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Mount Path Prefix</label>
                <Input value={initialMountPoint} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Base directory path (read-only)</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="mountName" className="text-sm font-medium">
                Mount Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="mountName"
                placeholder="my-gcs-bucket"
                value={mountName}
                onChange={(e) => setMountName(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {initialMountPoint
                  ? `Full mount path will be: ${fullMountPoint}`
                  : 'Name for the mount point (e.g., my-bucket)'}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="description"
                placeholder="Optional description for this mount"
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
                    placeholder="my-gcs-bucket"
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
                <p className="text-xs text-muted-foreground">Higher priority mounts are checked first</p>
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
              <Button type="submit" disabled={createMountMutation.isPending}>
                {createMountMutation.isPending ? 'Creating...' : 'Create Mount'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
