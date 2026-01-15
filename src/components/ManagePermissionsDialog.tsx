import { Loader2, Plus, RefreshCw, Shield, Trash2, User, Users } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFilePermissions } from '../hooks/usePermissions';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface ManagePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
}

const relationLabels: Record<string, { label: string; color: string }> = {
  direct_owner: { label: 'Owner', color: 'text-red-600 bg-red-50 border-red-200' },
  direct_editor: { label: 'Editor', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  direct_viewer: { label: 'Viewer', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  owner: { label: 'Owner', color: 'text-red-600 bg-red-50 border-red-200' },
  editor: { label: 'Editor', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  viewer: { label: 'Viewer', color: 'text-blue-600 bg-blue-50 border-blue-200' },
};

const subjectTypeIcons: Record<string, any> = {
  user: User,
  group: Users,
};

export function ManagePermissionsDialog({ open, onOpenChange, filePath }: ManagePermissionsDialogProps) {
  const { apiClient } = useAuth();
  
  if (!apiClient) {
    return null;
  }
  
  const { data: rawPermissions, isLoading, refetch } = useFilePermissions(filePath);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newPermission, setNewPermission] = useState<string>('direct_viewer');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Use raw fields directly from backend
  const permissions = rawPermissions?.map((perm: any) => ({
    tuple_id: perm.tuple_id,
    subject_type: perm.subject_type,
    subject_id: perm.subject_id,
    relation: perm.relation,
    object_type: perm.object_type,
    object_id: perm.object_id,
    created_at: perm.created_at,
  }));

  const handleDelete = async (tupleId: string) => {
    setDeleting(tupleId);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.rebacDelete({ tuple_id: tupleId });
      setSuccess('Permission removed successfully');
      refetch();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove permission');
    } finally {
      setDeleting(null);
    }
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newUserId.trim()) {
      setError('User ID is required');
      return;
    }

    setGranting(true);

    try {
      await apiClient.rebacCreate({
        subject: ['user', newUserId.trim()],
        relation: newPermission,
        object: ['file', filePath],
        tenant_id: 'default',
      });
      setSuccess(`Permission granted to ${newUserId}`);
      setNewUserId('');
      setNewPermission('direct_viewer');
      refetch();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant permission');
    } finally {
      setGranting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage Permissions
          </DialogTitle>
          <DialogDescription>
            Control who has access to: <code className="text-xs bg-muted px-1 py-0.5 rounded">{filePath}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Current Permissions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Current Permissions</span>
              <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !permissions || permissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No permissions set for this file</p>
                <p className="text-xs mt-1">Add permissions below</p>
              </div>
            ) : (
              <div className="space-y-2">
                {permissions
                  .filter((perm) => perm.relation.startsWith('direct_'))
                  .map((perm) => {
                    const relationInfo = relationLabels[perm.relation] || {
                      label: perm.relation,
                      color: 'text-gray-600 bg-gray-50 border-gray-200',
                    };
                    const Icon = subjectTypeIcons[perm.subject_type] || User;

                    return (
                      <div key={perm.tuple_id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm font-medium truncate">{perm.subject_id}</span>
                          <div className={`text-xs px-2 py-0.5 rounded border ${relationInfo.color} font-medium whitespace-nowrap`}>{relationInfo.label}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(perm.tuple_id)} disabled={deleting === perm.tuple_id}>
                          {deleting === perm.tuple_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                        </Button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Add Permission Form */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add New Permission
            </h3>
            <form onSubmit={handleGrant} className="space-y-3">
              <div>
                <label htmlFor="user-id" className="text-xs font-medium mb-1 block">
                  User ID
                </label>
                <Input id="user-id" placeholder="alice" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} disabled={granting} />
              </div>

              <div>
                <label htmlFor="permission" className="text-xs font-medium mb-1 block">
                  Permission Level
                </label>
                <Select value={newPermission} onValueChange={setNewPermission} disabled={granting}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct_viewer">Viewer (Read-only)</SelectItem>
                    <SelectItem value="direct_editor">Editor (Read & Write)</SelectItem>
                    <SelectItem value="direct_owner">Owner (Full control)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={granting} className="w-full">
                {granting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Granting...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Grant Permission
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Success/Error Messages */}
          {success && <div className="bg-green-500/10 text-green-600 px-3 py-2 rounded-md text-sm">{success}</div>}
          {error && <div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
