import { ArrowLeft, Calendar, Check, Copy, Edit, Eye, EyeOff, Filter, Key, Plus, Search, Shield, Trash2, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuth } from '../contexts/AuthContext';
import OAuthStatusPanel from '../components/OAuthStatusPanel';

interface ApiKey {
  key_id: string;
  user_id: string;
  subject_type: string;
  subject_id: string;
  tenant_id: string;
  is_admin: boolean;
  name: string;
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
  last_used_at: string | null;
}

export function AdminSettings() {
  const navigate = useNavigate();
  const { apiClient, userInfo } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    user_id: '',
    name: '',
    is_admin: false,
    expires_days: 365,
  });
  const [creating, setCreating] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Filter state
  const [filters, setFilters] = useState({
    userId: '',
    name: '',
    role: 'all', // 'all' | 'admin' | 'user'
    status: 'active', // 'all' | 'active' | 'revoked'
  });

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    is_admin: false,
    expires_days: 365,
  });
  const [updating, setUpdating] = useState(false);

  // Redirect if not admin
  useEffect(() => {
    if (!userInfo?.is_admin) {
      setError('Access denied: Admin privileges required');
      setLoading(false);
    }
  }, [userInfo]);

  // Load API keys
  const loadKeys = async () => {
    if (!userInfo?.is_admin) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.adminListKeys({
        include_revoked: true,
        include_expired: true,
        limit: 100,
      });
      setKeys(response.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [userInfo]);

  // Create new user (API key)
  const handleCreate = async () => {
    if (!createForm.user_id.trim() || !createForm.name.trim()) {
      setError('User ID and Name are required');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const response = await apiClient.adminCreateKey({
        user_id: createForm.user_id.trim(),
        name: createForm.name.trim(),
        is_admin: createForm.is_admin,
        expires_days: createForm.expires_days > 0 ? createForm.expires_days : null,
      });

      console.log('API key created:', response);
      console.log('API key value:', response.api_key);

      // Store the API key to show to user
      setNewApiKey(response.api_key);

      console.log('newApiKey state set to:', response.api_key);

      // Reset form
      setCreateForm({
        user_id: '',
        name: '',
        is_admin: false,
        expires_days: 365,
      });

      // Reload list
      await loadKeys();
    } catch (err) {
      console.error('Error creating user:', err);
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  // Update user (API key)
  const handleUpdate = async () => {
    if (!editingKey) return;

    try {
      setUpdating(true);
      setError(null);
      await apiClient.adminUpdateKey({
        key_id: editingKey.key_id,
        name: editForm.name.trim() || undefined,
        is_admin: editForm.is_admin,
        expires_days: editForm.expires_days > 0 ? editForm.expires_days : undefined,
      });

      setEditDialogOpen(false);
      setEditingKey(null);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setUpdating(false);
    }
  };

  // Delete user (revoke API key)
  const handleDelete = async (key: ApiKey) => {
    if (!confirm(`Are you sure you want to revoke the API key for "${key.user_id}"?`)) {
      return;
    }

    try {
      setError(null);
      await apiClient.adminRevokeKey(key.key_id);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    }
  };

  // Open edit dialog
  const openEditDialog = (key: ApiKey) => {
    setEditingKey(key);
    setEditForm({
      name: key.name,
      is_admin: key.is_admin,
      expires_days: 365, // Default for extension
    });
    setEditDialogOpen(true);
  };

  // Copy API key to clipboard
  const handleCopyApiKey = async () => {
    if (!newApiKey) return;

    try {
      await navigator.clipboard.writeText(newApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Mask API key with asterisks
  const maskApiKey = (key: string) => {
    if (key.length <= 12) {
      return '*'.repeat(key.length);
    }
    // Show first 4 and last 4 characters
    return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4);
  };

  // Filter keys based on current filter state
  const filteredKeys = keys.filter((key) => {
    // Filter by user ID
    if (filters.userId && !key.user_id.toLowerCase().includes(filters.userId.toLowerCase())) {
      return false;
    }

    // Filter by name
    if (filters.name && !key.name.toLowerCase().includes(filters.name.toLowerCase())) {
      return false;
    }

    // Filter by role
    if (filters.role === 'admin' && !key.is_admin) {
      return false;
    }
    if (filters.role === 'user' && key.is_admin) {
      return false;
    }

    // Filter by status
    if (filters.status === 'active' && key.revoked) {
      return false;
    }
    if (filters.status === 'revoked' && !key.revoked) {
      return false;
    }

    return true;
  });

  if (!userInfo?.is_admin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Shield className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">Admin privileges required</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to files">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Shield className="h-8 w-8" />
            <h1 className="text-2xl font-bold">Admin Settings</h1>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {error && <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-4">{error}</div>}

          {/* OAuth Status Panel */}
          <OAuthStatusPanel className="mb-6" />

          {/* Filter Bar */}
          <div className="bg-white dark:bg-muted rounded-lg shadow p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* User ID Search */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">User ID</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search user ID..."
                    value={filters.userId}
                    onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Name Search */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name..."
                    value={filters.name}
                    onChange={(e) => setFilters({ ...filters, name: e.target.value })}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Role Filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                <Select value={filters.role} onValueChange={(value) => setFilters({ ...filters, role: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Active" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="revoked">Revoked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading users...</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-muted rounded-lg shadow">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">User ID</th>
                    <th className="text-left p-4 font-medium">Name</th>
                    <th className="text-left p-4 font-medium">Role</th>
                    <th className="text-left p-4 font-medium">Created</th>
                    <th className="text-left p-4 font-medium">Expires</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeys.map((key) => (
                    <tr key={key.key_id} className="border-b hover:bg-muted/20">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{key.user_id}</span>
                        </div>
                      </td>
                      <td className="p-4">{key.name}</td>
                      <td className="p-4">
                        {key.is_admin ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            <Key className="h-3 w-3 mr-1" />
                            User
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{new Date(key.created_at).toLocaleDateString()}</td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {key.expires_at ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(key.expires_at).toLocaleDateString()}
                          </span>
                        ) : (
                          'Never'
                        )}
                      </td>
                      <td className="p-4">
                        {key.revoked ? (
                          <span className="text-xs font-medium text-destructive">Revoked</span>
                        ) : (
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">Active</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(key)} disabled={key.revoked}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(key)} disabled={key.revoked}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {keys.length === 0 && (
                <div className="text-center py-12">
                  <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No users found</p>
                  <Button onClick={() => setCreateDialogOpen(true)} className="mt-4">
                    <Plus className="h-4 w-4 mr-2" />
                    Create First User
                  </Button>
                </div>
              )}
            </div>
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

      {/* Create User Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            // Reset all states when closing
            setNewApiKey(null);
            setShowApiKey(false);
            setCopied(false);
          }
          setCreateDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Create a new API key for a user. The API key will be shown only once.</DialogDescription>
          </DialogHeader>

          {(() => {
            console.log('Rendering dialog, newApiKey:', newApiKey);
            return null;
          })()}

          {newApiKey ? (
            <div className="py-4 space-y-4">
              <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-orange-900 dark:text-orange-100 mb-1">Important: Save Your API Key</p>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      This is the only time the API key will be displayed. Make sure to copy and save it securely.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-muted p-3 rounded-lg font-mono text-sm break-all border border-border">
                    {showApiKey ? newApiKey : maskApiKey(newApiKey)}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={handleCopyApiKey} title="Copy to clipboard">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label htmlFor="user_id" className="text-sm font-medium">
                  User ID *
                </label>
                <Input
                  id="user_id"
                  placeholder="alice"
                  value={createForm.user_id}
                  onChange={(e) => setCreateForm({ ...createForm, user_id: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Display Name *
                </label>
                <Input id="name" placeholder="Alice Smith" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
              </div>

              <div className="grid gap-2">
                <label htmlFor="expires_days" className="text-sm font-medium">
                  Expires In (days)
                </label>
                <Input
                  id="expires_days"
                  type="number"
                  min="0"
                  placeholder="365"
                  value={createForm.expires_days}
                  onChange={(e) => setCreateForm({ ...createForm, expires_days: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">Set to 0 for no expiration</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={createForm.is_admin}
                  onChange={(e) => setCreateForm({ ...createForm, is_admin: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="is_admin" className="text-sm font-medium">
                  Grant admin privileges
                </label>
              </div>
            </div>
          )}

          <DialogFooter>
            {newApiKey ? (
              <Button
                onClick={() => {
                  setNewApiKey(null);
                  setShowApiKey(false);
                  setCopied(false);
                  setCreateDialogOpen(false);
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating...' : 'Create User'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user properties for {editingKey?.user_id}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="edit_name" className="text-sm font-medium">
                Display Name
              </label>
              <Input id="edit_name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>

            <div className="grid gap-2">
              <label htmlFor="edit_expires_days" className="text-sm font-medium">
                Extend Expiration (days)
              </label>
              <Input
                id="edit_expires_days"
                type="number"
                min="0"
                value={editForm.expires_days}
                onChange={(e) => setEditForm({ ...editForm, expires_days: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">Number of days from now</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit_is_admin"
                checked={editForm.is_admin}
                onChange={(e) => setEditForm({ ...editForm, is_admin: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="edit_is_admin" className="text-sm font-medium">
                Admin privileges
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={updating}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating ? 'Updating...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
